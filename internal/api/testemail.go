package api

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"strings"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/notifier"
)

// HandleTestEmail envoie un e-mail de test à l'adresse du compte connecté (=
// identifiant), afin de vérifier la configuration SMTP. Réservé aux admins.
// Les champs SMTP du formulaire sont utilisés s'ils sont fournis (test avant
// enregistrement) ; sinon on retombe sur la configuration enregistrée. Le mot de
// passe non re-saisi (vide) conserve celui déjà enregistré.
// POST /api/config/test
func (s *Server) HandleTestEmail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	claims, ok := auth.ClaimsFrom(r)
	if !ok {
		jsonError(w, http.StatusUnauthorized, "Authentification requise")
		return
	}
	user, err := db.GetUserByID(claims.UserID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Compte introuvable")
		return
	}
	to := strings.TrimSpace(user.Username) // identifiant = adresse e-mail
	if !validInviteEmail(to) {
		jsonError(w, http.StatusBadRequest,
			"Votre identifiant n'est pas une adresse e-mail valide : impossible de vous envoyer un test.")
		return
	}

	var req struct {
		SMTPHost          string `json:"smtp_host"`
		SMTPPort          int    `json:"smtp_port"`
		SMTPUser          string `json:"smtp_user"`
		SMTPPassword      string `json:"smtp_password"`
		SMTPFrom          string `json:"smtp_from"`
		SMTPTLSSkipVerify bool   `json:"smtp_tls_skip_verify"`
	}
	// Corps facultatif : sans valeurs fournies, on teste la config enregistrée.
	_ = json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&req)

	// Base = configuration enregistrée ; surcharge par les valeurs du formulaire.
	cfg := s.cfg.SMTP
	if v := strings.TrimSpace(req.SMTPHost); v != "" {
		cfg.Host = v
	}
	if req.SMTPPort != 0 {
		cfg.Port = req.SMTPPort
	}
	if v := strings.TrimSpace(req.SMTPUser); v != "" {
		cfg.User = v
	}
	if v := strings.TrimSpace(req.SMTPFrom); v != "" {
		cfg.From = v
	}
	if req.SMTPPassword != "" {
		cfg.Password = req.SMTPPassword // sinon : conserve le mot de passe enregistré
	}
	cfg.TLSSkipVerify = req.SMTPTLSSkipVerify

	if strings.TrimSpace(cfg.Host) == "" {
		jsonError(w, http.StatusBadRequest, "Aucun serveur SMTP configuré (renseignez l'hôte SMTP).")
		return
	}

	subject := "Test SMTP SafeDock ✅"
	content := fmt.Sprintf(`
		<p>Cet e-mail confirme que la configuration SMTP de SafeDock fonctionne.</p>
		<p>Destinataire : <strong>%s</strong></p>
		<p>Si vous recevez ce message, l'envoi d'alertes par e-mail est opérationnel.</p>
	`, html.EscapeString(to))

	if err := notifier.SendEmail(&cfg, []string{to}, subject, notifier.BuildHTMLReport(subject, content, true)); err != nil {
		db.WriteSecurityAudit(user.ID, user.Username, "smtp.test_failed", requestIP(r), err.Error())
		jsonError(w, http.StatusBadGateway, "Échec de l'envoi : "+err.Error())
		return
	}
	db.WriteSecurityAudit(user.ID, user.Username, "smtp.test_sent", requestIP(r), "e-mail de test envoyé à "+to)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "sent_to": to})
}
