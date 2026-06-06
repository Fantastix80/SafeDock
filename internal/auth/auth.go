// Package auth fournit l'authentification multi-utilisateur de SafeDock :
// comptes réels avec rôles, mot de passe + MFA (TOTP) obligatoire par utilisateur,
// sessions par cookie signé porteur d'identité, et middleware d'autorisation.
package auth

import (
	"context"
	"encoding/json"
	"fmt"
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
	// preAuthTTL couvre l'étape MFA et l'amorçage initial (changement de mot de
	// passe imposé + enrôlement MFA). 10 minutes laissent le temps d'installer
	// l'application d'authentification sans rouvrir d'accès (le pré-jeton n'ouvre
	// aucune route protégée). Le cookie est rafraîchi à chaque étape de l'amorçage.
	preAuthTTL      = 10 * time.Minute
	maxBodyBytes    = 4 << 10
	mfaIssuer       = "SafeDock"
	backupCodeCount = 10
)

type ctxKey int

const claimsCtxKey ctxKey = 0

// secureCookies passe les cookies en Secure quand le TLS est actif.
var secureCookies bool

// SetSecureCookies est appelé au démarrage selon l'activation du TLS.
func SetSecureCookies(enabled bool) { secureCookies = enabled }

// EnsureAdminBootstrap garantit l'existence du compte 'admin' de premier rang.
// Au tout premier lancement (compte absent, ou présent mais sans mot de passe),
// un mot de passe aléatoire FORT (conforme ANSSI) est généré et journalisé UNE
// fois ; le compte est marqué « changement de mot de passe imposé » : à sa
// première connexion, l'administrateur devra le changer PUIS enrôler son MFA.
// SAFEDOCK_AUTH_PASSWORD, s'il est fourni, (ré)initialise le mot de passe d'un
// admin DÉJÀ activé (récupération), sans toucher au MFA.
func EnsureAdminBootstrap(envPassword string) error {
	admin, err := db.GetUserAuth("admin")
	if err != nil {
		return err
	}
	if !admin.Found {
		// Compte créé avec un mot de passe généré (défini juste après) + scope_all
		// + changement imposé au premier login.
		id, cerr := db.CreateUser("admin", "", db.RoleAdmin, "", "", true, true)
		if cerr != nil {
			return cerr
		}
		admin.ID = int(id)
		admin.Found = true
		admin.PasswordHash = ""
		admin.TOTPEnabled = false
	}

	// Amorçage : aucun mot de passe défini → en générer un fort, le journaliser et
	// imposer son changement au premier login.
	if admin.PasswordHash == "" {
		pw, gerr := crypto.GenerateStrongPassword()
		if gerr != nil {
			return fmt.Errorf("génération du mot de passe administrateur : %w", gerr)
		}
		if serr := db.SetUserPassword(admin.ID, crypto.PasswordVerifier(pw), true); serr != nil {
			return serr
		}
		logAdminBootstrapPassword(pw)
		return nil
	}

	// Réinitialisation du mot de passe par variable d'env (admin déjà actif uniquement).
	if envPassword != "" && admin.TOTPEnabled {
		if serr := db.SetUserPassword(admin.ID, crypto.PasswordVerifier(envPassword), false); serr != nil {
			return serr
		}
	}
	return nil
}

// logAdminBootstrapPassword journalise (une seule fois) les identifiants initiaux
// de l'administrateur. C'est le SEUL endroit où un mot de passe apparaît en clair :
// il n'est lisible que par l'opérateur ayant accès aux logs du conteneur, et doit
// être changé dès la première connexion (changement imposé).
func logAdminBootstrapPassword(pw string) {
	log.Println("════════════════════════════════════════════════════════════")
	log.Println("🔑  COMPTE ADMINISTRATEUR SafeDock — IDENTIFIANTS INITIAUX")
	log.Println("    Identifiant : admin")
	log.Printf("    Mot de passe : %s\n", pw)
	log.Println("    ⚠️  À changer OBLIGATOIREMENT à la première connexion,")
	log.Println("        puis configuration du MFA. Notez-le ailleurs et purgez ce log.")
	log.Println("════════════════════════════════════════════════════════════")
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
		// Routes publiques de connexion et d'activation par invitation
		// (le jeton d'invitation fait foi, pas de session).
		if path == "/api/login" || path == "/api/login/verify" || path == "/api/session" ||
			path == "/api/login/setup-password" || path == "/api/login/setup-mfa" ||
			path == "/api/invite" || path == "/api/invite/accept" || path == "/api/invite/verify" {
			next.ServeHTTP(w, r)
			return
		}

		claims, ok := sessionClaims(r)
		if !ok {
			writeJSONError(w, http.StatusUnauthorized, "Authentification requise")
			return
		}

		// Enforcement du changement de mot de passe imposé : tant qu'il n'est pas
		// effectué, seul le changement de mot de passe (et la déconnexion) est permis.
		if path != "/api/account/password" && path != "/api/logout" {
			if u, uerr := db.GetUserByID(claims.UserID); uerr == nil && u.MustChangePassword {
				writeJSONError(w, http.StatusForbidden, "Changement de mot de passe requis avant tout autre accès.")
				return
			}
		}

		ctx := context.WithValue(r.Context(), claimsCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// recordMFAFailure enregistre un échec de second facteur (compteur + audit).
func recordMFAFailure(r *http.Request, userName string, userID int) {
	justLockedU, _ := limiter.fail("user:"+userName, maxFailedAttempts)
	justLockedIP, _ := limiter.fail("ip:"+clientIP(r), maxIPAttempts)
	action := "auth.mfa_failed"
	if justLockedU || justLockedIP {
		action = "auth.locked"
	}
	db.WriteSecurityAudit(userID, userName, action, clientIP(r), "code MFA invalide")
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

	key := strings.ToLower(strings.TrimSpace(req.Username))
	uKey, ipKey := "user:"+key, "ip:"+clientIP(r)
	if locked, retry := limiter.lockedAny(uKey, ipKey); locked {
		db.WriteSecurityAudit(0, key, "auth.login_blocked", clientIP(r), "tentative pendant le verrouillage")
		writeJSONError(w, http.StatusTooManyRequests,
			fmt.Sprintf("Trop de tentatives. Réessayez dans %d minute(s).", int(retry.Minutes())+1))
		return
	}

	u, err := db.GetUserAuth(strings.TrimSpace(req.Username))
	if err != nil {
		http.Error(w, "Erreur interne", http.StatusInternalServerError)
		return
	}
	if !u.Found || !crypto.VerifyPassword(req.Password, u.PasswordHash) {
		justLockedU, _ := limiter.fail(uKey, maxFailedAttempts)
		justLockedIP, _ := limiter.fail(ipKey, maxIPAttempts)
		action := "auth.login_failed"
		if justLockedU || justLockedIP {
			action = "auth.locked"
		}
		db.WriteSecurityAudit(0, key, action, clientIP(r), "mot de passe incorrect")
		time.Sleep(500 * time.Millisecond) // anti brute-force + anti énumération
		writeJSONError(w, http.StatusUnauthorized, "Identifiants incorrects")
		return
	}

	// Migration transparente : un ancien vérificateur HMAC est re-hashé en argon2id
	// à cette connexion réussie (le flag must_change n'est pas touché).
	if !strings.HasPrefix(u.PasswordHash, "$argon2id$") {
		if nh := crypto.PasswordVerifier(req.Password); nh != "" {
			_ = db.UpdateUserPasswordHash(u.ID, nh)
		}
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

	// Compte sans MFA actif. Deux cas :
	//   - compte INVITÉ (jeton d'invitation en attente) : la finalisation passe
	//     EXCLUSIVEMENT par le lien d'invitation (un mot de passe volé ne doit pas
	//     permettre d'enrôler son propre authenticator) → 403.
	//   - compte amorcé localement (administrateur de premier rang, mot de passe
	//     généré dans les logs) : on autorise la finalisation guidée — changement
	//     du mot de passe imposé PUIS enrôlement MFA — via le pré-jeton.
	if db.HasPendingInvite(u.ID) {
		clearCookie(w, preAuthCookieName)
		writeJSONError(w, http.StatusForbidden,
			"Compte non finalisé : utilisez le lien d'invitation reçu par e-mail, ou demandez à un administrateur de le renvoyer.")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":               "setup_required",
		"must_change_password": u.MustChangePassword,
	})
}

// canFinalizeViaLogin valide qu'un compte est en état d'être finalisé par la voie
// /api/login (mot de passe défini, MFA non encore activé, aucune invitation en
// attente). Renvoie l'utilisateur d'auth si l'état est légitime.
func canFinalizeViaLogin(userID int) (db.UserAuth, bool) {
	u, err := db.GetUserByID(userID)
	if err != nil {
		return db.UserAuth{}, false
	}
	au, err := db.GetUserAuth(u.Username)
	if err != nil || !au.Found {
		return db.UserAuth{}, false
	}
	if au.PasswordHash == "" || au.TOTPEnabled || db.HasPendingInvite(userID) {
		return db.UserAuth{}, false
	}
	return au, true
}

// preAuthClaims lit et valide le pré-jeton (mot de passe vérifié, MFA pas encore
// validé) déposé par HandleLogin.
func preAuthClaims(r *http.Request) (*crypto.TokenClaims, bool) {
	c, err := r.Cookie(preAuthCookieName)
	if err != nil {
		return nil, false
	}
	return crypto.ParseToken(c.Value, crypto.ScopePreAuth)
}

// refreshPreAuth réémet un pré-jeton frais pour prolonger la fenêtre d'amorçage.
func refreshPreAuth(w http.ResponseWriter, claims *crypto.TokenClaims) {
	if tok, err := crypto.NewToken(crypto.ScopePreAuth, claims.UserID, claims.Role, preAuthTTL); err == nil {
		setCookie(w, preAuthCookieName, tok, int(preAuthTTL.Seconds()))
	}
}

// HandleSetupPassword — amorçage, étape « changement de mot de passe imposé »
// AVANT enrôlement MFA. Authentifié par le pré-jeton (mot de passe déjà vérifié).
// POST /api/login/setup-password {new_password}
func HandleSetupPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := preAuthClaims(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Session de connexion expirée, recommencez")
		return
	}
	if _, ok := canFinalizeViaLogin(claims.UserID); !ok {
		clearCookie(w, preAuthCookieName)
		writeJSONError(w, http.StatusForbidden, "Action non autorisée pour ce compte")
		return
	}
	var req struct {
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := crypto.ValidatePassword(req.NewPassword); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := db.SetUserPassword(claims.UserID, crypto.PasswordVerifier(req.NewPassword), false); err != nil {
		http.Error(w, "Impossible d'enregistrer le mot de passe", http.StatusInternalServerError)
		return
	}
	user, _ := db.GetUserByID(claims.UserID)
	db.WriteSecurityAudit(claims.UserID, user.Username, "auth.password_change", clientIP(r), "mot de passe initial changé (amorçage)")
	refreshPreAuth(w, claims) // prolonge la fenêtre pour l'étape MFA
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// HandleSetupMFA — amorçage, étape « initialisation du secret TOTP ». Génère et
// stocke un secret (non encore activé) et renvoie l'URI otpauth pour le QR code.
// L'activation a lieu via /api/login/verify (premier code valide). Authentifié
// par le pré-jeton ; n'est permis qu'après le changement du mot de passe imposé.
// POST /api/login/setup-mfa
func HandleSetupMFA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	claims, ok := preAuthClaims(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Session de connexion expirée, recommencez")
		return
	}
	if _, ok := canFinalizeViaLogin(claims.UserID); !ok {
		clearCookie(w, preAuthCookieName)
		writeJSONError(w, http.StatusForbidden, "Action non autorisée pour ce compte")
		return
	}
	user, err := db.GetUserByID(claims.UserID)
	if err != nil {
		http.Error(w, "Utilisateur introuvable", http.StatusInternalServerError)
		return
	}
	// Le changement de mot de passe imposé doit précéder l'enrôlement MFA.
	if user.MustChangePassword {
		writeJSONError(w, http.StatusForbidden, "Changez d'abord votre mot de passe.")
		return
	}
	secret, err := crypto.GenerateTOTPSecret()
	if err != nil {
		http.Error(w, "Impossible de générer le secret MFA", http.StatusInternalServerError)
		return
	}
	if err := db.SetUserTOTPSecret(claims.UserID, secret); err != nil {
		http.Error(w, "Impossible d'enregistrer le secret MFA", http.StatusInternalServerError)
		return
	}
	refreshPreAuth(w, claims)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"secret":      secret,
		"otpauth_uri": crypto.TOTPProvisioningURI(secret, user.Username, mfaIssuer),
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

	// Verrouillage anti-force-brute (mêmes compteurs que l'étape mot de passe).
	verifyUser, _ := db.GetUserByID(claims.UserID)
	key := strings.ToLower(verifyUser.Username)
	uKey, ipKey := "user:"+key, "ip:"+clientIP(r)
	if locked, retry := limiter.lockedAny(uKey, ipKey); locked {
		db.WriteSecurityAudit(verifyUser.ID, key, "auth.login_blocked", clientIP(r), "MFA pendant verrouillage")
		writeJSONError(w, http.StatusTooManyRequests,
			fmt.Sprintf("Trop de tentatives. Réessayez dans %d minute(s).", int(retry.Minutes())+1))
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
			// Codes de secours : hash salés → vérification par parcours (argon2),
			// avec repli transparent sur l'ancien format HMAC déterministe.
			valid = db.ConsumeUserBackupCodeMatch(claims.UserID, func(stored string) bool {
				return crypto.VerifyBackupCode(code, stored)
			})
		}
		if !valid {
			recordMFAFailure(r, key, verifyUser.ID)
			time.Sleep(500 * time.Millisecond)
			writeJSONError(w, http.StatusUnauthorized, "Code invalide")
			return
		}
	} else {
		if !crypto.ValidateTOTP(secret, code) {
			recordMFAFailure(r, key, verifyUser.ID)
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

	limiter.reset(uKey) // connexion réussie → réinitialise les compteurs d'échecs
	limiter.reset(ipKey)
	db.WriteSecurityAudit(user.ID, user.Username, "auth.login", clientIP(r), "connexion réussie (MFA validé)")

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
	if err := crypto.ValidatePassword(req.NewPassword); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
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
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := db.SetUserProfile(claims.UserID, strings.TrimSpace(req.FirstName), strings.TrimSpace(req.LastName)); err != nil {
		http.Error(w, "Impossible de mettre à jour le profil", http.StatusInternalServerError)
		return
	}
	user, _ := db.GetUserByID(claims.UserID)
	db.WriteSecurityAudit(claims.UserID, user.Username, "profile.update", "", "")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok": true, "first_name": user.FirstName, "last_name": user.LastName,
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
		"username":             user.Username, // = adresse e-mail (identifiant)
		"email":                user.Username,
		"first_name":           user.FirstName,
		"last_name":            user.LastName,
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

