package api

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
)

// Assistant de configuration initiale (first-run) : tant qu'aucun compte
// administrateur n'existe, ces endpoints PUBLICS permettent à l'opérateur de créer
// le premier compte (e-mail = identifiant + mot de passe + MFA), authentifié par
// le jeton de configuration journalisé au démarrage. Ils se désactivent d'eux-mêmes
// dès qu'un administrateur existe.

const setupMaxBody = 4 << 10

// requestIP extrait une IP cliente lisible (sans le port) pour la traçabilité.
func requestIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		host = host[:i]
	}
	return host
}

// setupOpen indique si la configuration initiale est encore ouverte (aucun admin).
func setupOpen() bool {
	n, err := db.CountAdmins()
	return err == nil && n == 0
}

// validSetupToken compare en temps constant le jeton fourni à l'empreinte stockée.
func validSetupToken(token string) bool {
	token = strings.TrimSpace(token)
	if token == "" {
		return false
	}
	stored, err := db.GetSetupTokenHash()
	if err != nil || stored == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(crypto.HashInviteToken(token)), []byte(stored)) == 1
}

// HandleSetupStatus indique si l'assistant de configuration initiale doit s'afficher.
// GET /api/setup/status
func (s *Server) HandleSetupStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"needs_setup": setupOpen()})
}

// HandleSetupStart valide le jeton de configuration (étape 1 de l'assistant).
// POST /api/setup/start {token}
func (s *Server) HandleSetupStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !setupOpen() {
		jsonError(w, http.StatusConflict, "La configuration initiale est déjà terminée.")
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, setupMaxBody)).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Format JSON invalide")
		return
	}
	if !validSetupToken(req.Token) {
		time.Sleep(500 * time.Millisecond) // anti-devinette
		jsonError(w, http.StatusForbidden, "Jeton de configuration invalide.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"valid": true})
}

// HandleSetupComplete crée le premier compte administrateur (e-mail = identifiant)
// avec son mot de passe, pose un cookie de pré-auth, et invalide le jeton. Le MFA
// est ensuite enrôlé via les endpoints existants /api/login/setup-mfa puis verify.
// POST /api/setup/complete {token, email, first_name, last_name, password}
func (s *Server) HandleSetupComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !setupOpen() {
		jsonError(w, http.StatusConflict, "La configuration initiale est déjà terminée.")
		return
	}
	var req struct {
		Token     string `json:"token"`
		Email     string `json:"email"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Password  string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, setupMaxBody)).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Format JSON invalide")
		return
	}
	if !validSetupToken(req.Token) {
		time.Sleep(500 * time.Millisecond)
		jsonError(w, http.StatusForbidden, "Jeton de configuration invalide.")
		return
	}
	email := strings.TrimSpace(req.Email)
	if !validInviteEmail(email) {
		jsonError(w, http.StatusBadRequest, "Adresse e-mail invalide.")
		return
	}
	if au, _ := db.GetUserAuth(email); au.Found {
		jsonError(w, http.StatusConflict, "Un compte avec cet e-mail existe déjà.")
		return
	}
	if err := crypto.ValidatePassword(req.Password); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Compte admin : scope_all=true, must_change_password=false (sinon l'étape MFA
	// suivante — HandleSetupMFA — serait refusée).
	id, err := db.CreateUser(email, crypto.PasswordVerifier(req.Password), db.RoleAdmin,
		strings.TrimSpace(req.FirstName), strings.TrimSpace(req.LastName), true, false)
	if err != nil {
		jsonError(w, http.StatusConflict, "Création du compte impossible (e-mail déjà utilisé ?).")
		return
	}
	_ = db.ClearSetupTokenHash()
	if err := auth.IssuePreAuthCookie(w, int(id), db.RoleAdmin); err != nil {
		jsonError(w, http.StatusInternalServerError, "Impossible d'initialiser la session de configuration.")
		return
	}
	db.WriteSecurityAudit(int(id), email, "setup.admin_created", requestIP(r),
		"compte administrateur initial créé via l'assistant de configuration")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
