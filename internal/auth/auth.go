// Package auth fournit l'authentification multi-utilisateur de SafeDock :
// comptes réels avec rôles, mot de passe + MFA (TOTP) obligatoire par utilisateur,
// sessions par cookie signé porteur d'identité, et middleware d'autorisation.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
)

const (
	cookieName        = "safedock_session"
	preAuthCookieName = "safedock_preauth"
	sessionTTL        = 12 * time.Hour
	preAuthTTL        = 5 * time.Minute
	maxBodyBytes      = 4 << 10
	mfaIssuer         = "SafeDock"
	backupCodeCount   = 10
)

type ctxKey int

const claimsCtxKey ctxKey = 0

// secureCookies passe les cookies en Secure quand le TLS est actif.
var secureCookies bool

// SetSecureCookies est appelé au démarrage selon l'activation du TLS.
func SetSecureCookies(enabled bool) { secureCookies = enabled }

// ResolveAdminPassword garantit l'existence d'un mot de passe pour le compte 'admin'.
//   - SAFEDOCK_AUTH_PASSWORD fourni → (ré)initialise le mot de passe de l'admin.
//   - Sinon, si l'admin n'a pas encore de mot de passe → génération + journalisation unique.
//   - Sinon, conservation de l'existant.
func ResolveAdminPassword(envPassword string) error {
	admin, err := db.GetUserAuth("admin")
	if err != nil {
		return err
	}
	if !admin.Found {
		// Filet de sécurité : si la migration n'a pas créé l'admin, on le crée.
		pw := envPassword
		generated := false
		if pw == "" {
			pw = generateRandomPassword(20)
			generated = true
		}
		if _, cerr := db.CreateUser("admin", crypto.PasswordVerifier(pw), db.RoleAdmin, "", "", true, false); cerr != nil {
			return cerr
		}
		if generated {
			logGeneratedPassword(pw)
		}
		return nil
	}

	if envPassword != "" {
		return db.SetUserPassword(admin.ID, crypto.PasswordVerifier(envPassword), false)
	}
	if admin.PasswordHash == "" {
		pw := generateRandomPassword(20)
		if serr := db.SetUserPassword(admin.ID, crypto.PasswordVerifier(pw), false); serr != nil {
			return serr
		}
		logGeneratedPassword(pw)
	}
	return nil
}

// ResetAdminMFA réinitialise le MFA du compte admin (récupération d'urgence).
func ResetAdminMFA() error {
	admin, err := db.GetUserAuth("admin")
	if err != nil || !admin.Found {
		return err
	}
	return db.ResetUserMFA(admin.ID)
}

// Middleware protège les routes /api/ : exige une session valide et injecte l'identité.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		// Routes publiques de connexion.
		if path == "/api/login" || path == "/api/login/verify" || path == "/api/session" {
			next.ServeHTTP(w, r)
			return
		}

		claims, ok := sessionClaims(r)
		if !ok {
			writeJSONError(w, http.StatusUnauthorized, "Authentification requise")
			return
		}
		ctx := context.WithValue(r.Context(), claimsCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// HandleLogin — étape 1 : nom d'utilisateur + mot de passe. Pose un cookie de pré-auth.
func HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	u, err := db.GetUserAuth(strings.TrimSpace(req.Username))
	if err != nil {
		http.Error(w, "Erreur interne", http.StatusInternalServerError)
		return
	}
	if !u.Found || !crypto.VerifyPassword(req.Password, u.PasswordHash) {
		time.Sleep(500 * time.Millisecond) // anti brute-force + anti énumération
		writeJSONError(w, http.StatusUnauthorized, "Identifiants incorrects")
		return
	}

	preToken, err := crypto.NewToken(crypto.ScopePreAuth, u.ID, u.Role, preAuthTTL)
	if err != nil {
		http.Error(w, "Impossible d'initialiser l'authentification", http.StatusInternalServerError)
		return
	}
	setCookie(w, preAuthCookieName, preToken, int(preAuthTTL.Seconds()))

	w.Header().Set("Content-Type", "application/json")
	if u.TOTPEnabled {
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "mfa_required"})
		return
	}

	secret, gerr := crypto.GenerateTOTPSecret()
	if gerr != nil {
		http.Error(w, "Impossible de générer le secret MFA", http.StatusInternalServerError)
		return
	}
	if serr := db.SetUserTOTPSecret(u.ID, secret); serr != nil {
		http.Error(w, "Impossible d'enregistrer le secret MFA", http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":      "enroll_required",
		"secret":      secret,
		"otpauth_uri": crypto.TOTPProvisioningURI(secret, u.Username, mfaIssuer),
	})
}

// HandleLoginVerify — étape 2 : code TOTP ou code de secours. Émet la session.
func HandleLoginVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	c, err := r.Cookie(preAuthCookieName)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "Session de connexion expirée, recommencez")
		return
	}
	claims, ok := crypto.ParseToken(c.Value, crypto.ScopePreAuth)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Session de connexion expirée, recommencez")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	code := strings.TrimSpace(req.Code)

	secret, enabled, err := db.GetUserTOTP(claims.UserID)
	if err != nil || secret == "" {
		http.Error(w, "MFA non initialisé", http.StatusInternalServerError)
		return
	}

	var backupCodes []string
	if enabled {
		valid := crypto.ValidateTOTP(secret, code)
		if !valid {
			valid = db.ConsumeUserBackupCode(claims.UserID, crypto.HashBackupCode(code))
		}
		if !valid {
			time.Sleep(500 * time.Millisecond)
			writeJSONError(w, http.StatusUnauthorized, "Code invalide")
			return
		}
	} else {
		if !crypto.ValidateTOTP(secret, code) {
			time.Sleep(500 * time.Millisecond)
			writeJSONError(w, http.StatusUnauthorized, "Code invalide — vérifiez l'heure de votre téléphone")
			return
		}
		if err := db.EnableUserTOTP(claims.UserID); err != nil {
			http.Error(w, "Impossible d'activer le MFA", http.StatusInternalServerError)
			return
		}
		if codes, cerr := crypto.GenerateBackupCodes(backupCodeCount); cerr == nil {
			hashes := make([]string, len(codes))
			for i, bc := range codes {
				hashes[i] = crypto.HashBackupCode(bc)
			}
			if db.ReplaceUserBackupCodes(claims.UserID, hashes) == nil {
				backupCodes = codes
			}
		}
	}

	// Rôle frais depuis la base (il a pu changer depuis l'émission du jeton de pré-auth).
	user, _ := db.GetUserByID(claims.UserID)
	token, err := crypto.NewToken(crypto.ScopeSession, claims.UserID, user.Role, sessionTTL)
	if err != nil {
		http.Error(w, "Impossible de créer la session", http.StatusInternalServerError)
		return
	}
	setCookie(w, cookieName, token, int(sessionTTL.Seconds()))
	clearCookie(w, preAuthCookieName)

	db.WriteSecurityAudit(user.ID, user.Username, "auth.login", "", "connexion réussie (MFA validé)")

	resp := map[string]interface{}{
		"status":               "ok",
		"authenticated":        true,
		"role":                 user.Role,
		"username":             user.Username,
		"must_change_password": user.MustChangePassword,
	}
	if len(backupCodes) > 0 {
		resp["backup_codes"] = backupCodes
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// HandleChangePassword permet à l'utilisateur connecté de changer son propre mot de passe.
func HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := ClaimsFrom(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Authentification requise")
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 10 {
		writeJSONError(w, http.StatusBadRequest, "Le nouveau mot de passe doit faire au moins 10 caractères")
		return
	}

	u, err := db.GetUserByID(claims.UserID)
	if err != nil {
		http.Error(w, "Utilisateur introuvable", http.StatusInternalServerError)
		return
	}
	auth, _ := db.GetUserAuth(u.Username)
	if !crypto.VerifyPassword(req.CurrentPassword, auth.PasswordHash) {
		time.Sleep(500 * time.Millisecond)
		writeJSONError(w, http.StatusUnauthorized, "Mot de passe actuel incorrect")
		return
	}
	if err := db.SetUserPassword(claims.UserID, crypto.PasswordVerifier(req.NewPassword), false); err != nil {
		http.Error(w, "Impossible de changer le mot de passe", http.StatusInternalServerError)
		return
	}
	db.WriteSecurityAudit(claims.UserID, u.Username, "auth.password_change", "", "mot de passe modifié par l'utilisateur")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// HandleUpdateProfile permet à l'utilisateur connecté de mettre à jour son identité
// affichée (nom complet + email).
func HandleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := ClaimsFrom(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Authentification requise")
		return
	}
	var req struct {
		FullName string `json:"full_name"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := db.SetUserProfile(claims.UserID, strings.TrimSpace(req.FullName), strings.TrimSpace(req.Email)); err != nil {
		http.Error(w, "Impossible de mettre à jour le profil", http.StatusInternalServerError)
		return
	}
	user, _ := db.GetUserByID(claims.UserID)
	db.WriteSecurityAudit(claims.UserID, user.Username, "profile.update", "", "")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok": true, "full_name": user.FullName, "email": user.Email,
	})
}

// HandleLogout invalide les cookies de session.
func HandleLogout(w http.ResponseWriter, r *http.Request) {
	clearCookie(w, cookieName)
	clearCookie(w, preAuthCookieName)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"authenticated": false})
}

// HandleSession renvoie l'état d'authentification et le profil courant.
func HandleSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, ok := sessionClaims(r)
	if !ok {
		_ = json.NewEncoder(w).Encode(map[string]bool{"authenticated": false})
		return
	}
	user, err := db.GetUserByID(claims.UserID)
	if err != nil {
		_ = json.NewEncoder(w).Encode(map[string]bool{"authenticated": false})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated":        true,
		"user_id":              user.ID,
		"username":             user.Username,
		"full_name":            user.FullName,
		"email":                user.Email,
		"role":                 user.Role,
		"must_change_password": user.MustChangePassword,
		"scope_all":            user.ScopeAll,
	})
}

// ── Helpers d'identité / d'autorisation (utilisés par les handlers) ──────────

// ClaimsFrom extrait les claims de session injectés par le middleware.
func ClaimsFrom(r *http.Request) (*crypto.TokenClaims, bool) {
	c, ok := r.Context().Value(claimsCtxKey).(*crypto.TokenClaims)
	return c, ok
}

// roleRank ordonne les rôles pour les comparaisons de privilège.
func roleRank(role string) int {
	switch role {
	case db.RoleAdmin:
		return 3
	case db.RoleAuditor:
		return 2
	case db.RoleViewer:
		return 1
	default:
		return 0
	}
}

// RequireRole vérifie que la requête courante dispose au moins du rôle minimal.
// Renvoie false et écrit une réponse 403 sinon.
func RequireRole(w http.ResponseWriter, r *http.Request, minRole string) bool {
	claims, ok := ClaimsFrom(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Authentification requise")
		return false
	}
	if roleRank(claims.Role) < roleRank(minRole) {
		writeJSONError(w, http.StatusForbidden, "Privilèges insuffisants pour cette action")
		return false
	}
	return true
}

// ── Internes ────────────────────────────────────────────────────────────────

func sessionClaims(r *http.Request) (*crypto.TokenClaims, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil, false
	}
	return crypto.ParseToken(c.Value, crypto.ScopeSession)
}

func setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", HttpOnly: true,
		Secure: secureCookies, SameSite: http.SameSiteStrictMode, MaxAge: maxAge,
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: "/", HttpOnly: true,
		Secure: secureCookies, SameSite: http.SameSiteStrictMode, MaxAge: -1,
	})
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func logGeneratedPassword(pw string) {
	log.Println("============================================================")
	log.Println("🔐 SÉCURITÉ — Mot de passe administrateur généré :")
	log.Printf("   utilisateur : admin   mot de passe : %s\n", pw)
	log.Println("   Notez-le : il ne sera plus affiché. Définissez")
	log.Println("   SAFEDOCK_AUTH_PASSWORD pour le contrôler vous-même.")
	log.Println("============================================================")
}

func generateRandomPassword(n int) string {
	raw := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return base64.RawURLEncoding.EncodeToString([]byte(time.Now().String()))
	}
	return base64.RawURLEncoding.EncodeToString(raw)[:n]
}
