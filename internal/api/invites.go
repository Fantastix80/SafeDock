package api

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/notifier"
)

const (
	inviteTTL       = 72 * time.Hour
	inviteBackupN   = 10
	inviteMFAIssuer = "SafeDock"
)

// jsonError écrit une erreur JSON ({"error": "..."}) — format attendu par le front.
func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// baseURL résout l'URL publique de SafeDock : réglage admin, sinon variable d'env.
func baseURL() string {
	if u := db.GetBaseURL(); u != "" {
		return strings.TrimRight(u, "/")
	}
	return strings.TrimRight(os.Getenv("SAFEDOCK_BASE_URL"), "/")
}

// inviteLink construit le lien d'invitation. À défaut d'URL de base configurée,
// il la déduit de la requête courante (l'admin accède déjà à la bonne adresse).
func inviteLink(r *http.Request, token string) string {
	b := baseURL()
	if b == "" {
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		if r.Host != "" {
			b = scheme + "://" + r.Host
		}
	}
	if b == "" {
		return ""
	}
	return strings.TrimRight(b, "/") + "/invite?token=" + url.QueryEscape(token)
}

// sendInviteEmail envoie l'invitation (best-effort). Retourne true si l'e-mail est parti.
func (s *Server) sendInviteEmail(to, firstName, link string) bool {
	if strings.TrimSpace(s.cfg.SMTP.Host) == "" || link == "" {
		return false
	}
	subject := "Votre accès SafeDock"
	content := fmt.Sprintf(`
		<p>Bonjour %s,</p>
		<p>Un compte SafeDock a été créé pour vous. Cliquez sur le lien ci-dessous pour
		<strong>définir votre mot de passe et activer la double authentification (MFA)</strong> :</p>
		<p><a href="%s">Activer mon compte SafeDock</a></p>
		<p style="color:#94A3B8;font-size:12px;">Si le lien ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br><code>%s</code></p>
		<p>Ce lien expire dans 72 heures.</p>
	`, html.EscapeString(firstName), html.EscapeString(link), html.EscapeString(link))
	return notifier.SendEmail(&s.cfg.SMTP, []string{to}, subject, notifier.BuildHTMLReport(subject, content, false)) == nil
}

// HandleInviteInfo valide un jeton d'invitation et renvoie l'identité associée
// pour pré-remplir la page d'activation. Public (le jeton fait foi).
// GET /api/invite?token=...
func (s *Server) HandleInviteInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	u, ok := db.GetUserByInviteHash(crypto.HashInviteToken(token))
	if token == "" || !ok {
		jsonError(w, http.StatusNotFound, "Invitation invalide ou expirée")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"valid": true, "email": u.Username, "first_name": u.FirstName,
	})
}

// HandleInviteAccept définit le mot de passe (argon2id) et initialise le secret
// MFA. Le jeton d'invitation reste valide jusqu'à la confirmation du code.
// POST /api/invite/accept {token, password}
func (s *Server) HandleInviteAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Format JSON invalide")
		return
	}
	u, ok := db.GetUserByInviteHash(crypto.HashInviteToken(strings.TrimSpace(req.Token)))
	if !ok {
		jsonError(w, http.StatusNotFound, "Invitation invalide ou expirée")
		return
	}
	if err := crypto.ValidatePassword(req.Password); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := db.SetUserPassword(u.ID, crypto.PasswordVerifier(req.Password), false); err != nil {
		jsonError(w, http.StatusInternalServerError, "Impossible d'enregistrer le mot de passe")
		return
	}
	secret, err := crypto.GenerateTOTPSecret()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Impossible de générer le secret MFA")
		return
	}
	if err := db.SetUserTOTPSecret(u.ID, secret); err != nil {
		jsonError(w, http.StatusInternalServerError, "Impossible d'enregistrer le secret MFA")
		return
	}
	db.WriteSecurityAudit(u.ID, u.Username, "invite.accept", "", "mot de passe défini, enrôlement MFA")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"secret":      secret,
		"otpauth_uri": crypto.TOTPProvisioningURI(secret, u.Username, inviteMFAIssuer),
	})
}

// HandleInviteVerify valide le premier code TOTP, active le MFA, génère les codes
// de secours et consomme l'invitation. Le compte devient actif.
// POST /api/invite/verify {token, code}
func (s *Server) HandleInviteVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Token string `json:"token"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Format JSON invalide")
		return
	}
	u, ok := db.GetUserByInviteHash(crypto.HashInviteToken(strings.TrimSpace(req.Token)))
	if !ok {
		jsonError(w, http.StatusNotFound, "Invitation invalide ou expirée")
		return
	}
	secret, _, err := db.GetUserTOTP(u.ID)
	if err != nil || secret == "" {
		jsonError(w, http.StatusBadRequest, "Enrôlement non initialisé, reprenez l'étape précédente")
		return
	}
	if !crypto.ValidateTOTP(secret, strings.TrimSpace(req.Code)) {
		jsonError(w, http.StatusUnauthorized, "Code invalide — vérifiez l'heure de votre téléphone")
		return
	}
	if err := db.EnableUserTOTP(u.ID); err != nil {
		jsonError(w, http.StatusInternalServerError, "Impossible d'activer le MFA")
		return
	}
	var backup []string
	if codes, cerr := crypto.GenerateBackupCodes(inviteBackupN); cerr == nil {
		hashes := make([]string, len(codes))
		for i, bc := range codes {
			hashes[i] = crypto.HashBackupCode(bc)
		}
		if db.ReplaceUserBackupCodes(u.ID, hashes) == nil {
			backup = codes
		}
	}
	_ = db.ClearUserInvite(u.ID)
	db.WriteSecurityAudit(u.ID, u.Username, "invite.completed", "", "compte activé (MFA)")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok", "backup_codes": backup,
	})
}

// validInviteEmail valide une adresse e-mail (identifiant de connexion).
func validInviteEmail(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil
}
