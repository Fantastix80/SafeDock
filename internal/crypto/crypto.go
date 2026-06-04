// Package crypto fournit le socle cryptographique de SafeDock :
//   - une clé maître persistante (32 octets) gérée localement ;
//   - le chiffrement symétrique des secrets stockés (AES-256-GCM) ;
//   - la vérification du mot de passe administrateur (HMAC-SHA256 à clé) ;
//   - la signature des jetons de session (HMAC-SHA256).
//
// Aucune dépendance externe : tout repose sur la librairie standard Go.
// La clé maître ne transite jamais par la base de données : un attaquant qui
// ne possède que safedock.db ne peut ni déchiffrer les secrets ni forger de session.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	encPrefix    = "enc:v1:" // marqueur des valeurs chiffrées (permet la migration du clair)
	keyFileName  = "secret.key"
	keySizeBytes = 32 // AES-256
)

var (
	masterKey []byte
	initMu    sync.Mutex
)

// Init charge la clé maître depuis la variable d'environnement SAFEDOCK_SECRET_KEY
// (base64 de 32 octets) ou, à défaut, depuis <dataDir>/secret.key. Si aucune clé
// n'existe, elle est générée aléatoirement et persistée avec des permissions 0600.
// Idempotent : un second appel ne régénère pas la clé.
func Init(dataDir string) error {
	initMu.Lock()
	defer initMu.Unlock()

	if masterKey != nil {
		return nil
	}

	// 1. Priorité à la variable d'environnement (déploiements orchestrés / secrets injectés)
	if envKey := os.Getenv("SAFEDOCK_SECRET_KEY"); envKey != "" {
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(envKey))
		if err != nil {
			return fmt.Errorf("SAFEDOCK_SECRET_KEY n'est pas un base64 valide : %w", err)
		}
		if len(raw) != keySizeBytes {
			return fmt.Errorf("SAFEDOCK_SECRET_KEY doit faire %d octets une fois décodé (obtenu %d)", keySizeBytes, len(raw))
		}
		masterKey = raw
		return nil
	}

	// 2. Fichier de clé persistant
	keyPath := filepath.Join(dataDir, keyFileName)
	if data, err := os.ReadFile(keyPath); err == nil {
		raw, derr := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
		if derr == nil && len(raw) == keySizeBytes {
			masterKey = raw
			return nil
		}
		return fmt.Errorf("fichier de clé %s corrompu ou de taille invalide", keyPath)
	}

	// 3. Génération initiale
	raw := make([]byte, keySizeBytes)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return fmt.Errorf("impossible de générer la clé maître : %w", err)
	}
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return fmt.Errorf("impossible de créer le dossier de données pour la clé : %w", err)
	}
	encoded := base64.StdEncoding.EncodeToString(raw)
	if err := os.WriteFile(keyPath, []byte(encoded), 0o600); err != nil {
		return fmt.Errorf("impossible de persister la clé maître : %w", err)
	}
	masterKey = raw
	return nil
}

// Ready indique si la clé maître est disponible.
func Ready() bool {
	return masterKey != nil
}

// IsEncrypted indique si une valeur est déjà au format chiffré SafeDock.
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, encPrefix)
}

// Encrypt chiffre une valeur en AES-256-GCM et retourne "enc:v1:<base64(nonce|ciphertext)>".
// Une valeur vide reste vide (pas de secret à protéger).
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	if masterKey == nil {
		return "", fmt.Errorf("clé maître non initialisée")
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt déchiffre une valeur produite par Encrypt. Pour faciliter la migration,
// une valeur sans marqueur (ancien stockage en clair) est retournée telle quelle.
func Decrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	if !IsEncrypted(value) {
		// Donnée historique en clair : on la retourne, elle sera ré-chiffrée à la prochaine écriture.
		return value, nil
	}
	if masterKey == nil {
		return "", fmt.Errorf("clé maître non initialisée")
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix))
	if err != nil {
		return "", fmt.Errorf("valeur chiffrée illisible : %w", err)
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	ns := gcm.NonceSize()
	if len(raw) < ns {
		return "", fmt.Errorf("valeur chiffrée tronquée")
	}
	nonce, ciphertext := raw[:ns], raw[ns:]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("échec du déchiffrement (clé invalide ou donnée altérée) : %w", err)
	}
	return string(plain), nil
}

// ── Mot de passe administrateur ─────────────────────────────────────────────

// PasswordVerifier calcule un vérificateur HMAC-SHA256 du mot de passe avec la clé maître.
// Stocké en base, il ne permet pas de retrouver le mot de passe et ne peut être
// recalculé sans la clé maître (absente de la base).
func PasswordVerifier(password string) string {
	mac := hmac.New(sha256.New, masterKey)
	mac.Write([]byte(password))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// VerifyPassword compare en temps constant un mot de passe candidat au vérificateur stocké.
func VerifyPassword(password, verifier string) bool {
	if verifier == "" {
		return false
	}
	expected := PasswordVerifier(password)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(verifier)) == 1
}

// ── Jetons signés à portée ──────────────────────────────────────────────────
// Deux portées existent :
//   - "session" : session complète, émise APRÈS validation du second facteur (MFA) ;
//   - "preauth" : jeton court émis après le mot de passe seul, autorisant uniquement
//                 l'étape de vérification MFA. Il ne donne accès à aucune route protégée.

const (
	ScopeSession = "session"
	ScopePreAuth = "preauth"
)

// TokenClaims porte l'identité et la portée d'un jeton signé.
type TokenClaims struct {
	Exp    int64  `json:"exp"`
	Scope  string `json:"scope"`
	UserID int    `json:"uid"`
	Role   string `json:"role"`
}

// NewToken crée un jeton signé "base64(payload).base64(hmac)" porteur d'identité.
func NewToken(scope string, userID int, role string, ttl time.Duration) (string, error) {
	payload := TokenClaims{Exp: time.Now().Add(ttl).Unix(), Scope: scope, UserID: userID, Role: role}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	b64 := base64.RawURLEncoding.EncodeToString(body)
	return b64 + "." + signRaw(b64), nil
}

// ParseToken vérifie signature, expiration et portée, et retourne les claims.
func ParseToken(token, expectedScope string) (*TokenClaims, bool) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, false
	}
	b64, sig := parts[0], parts[1]

	if subtle.ConstantTimeCompare([]byte(sig), []byte(signRaw(b64))) != 1 {
		return nil, false
	}
	body, err := base64.RawURLEncoding.DecodeString(b64)
	if err != nil {
		return nil, false
	}
	var c TokenClaims
	if err := json.Unmarshal(body, &c); err != nil {
		return nil, false
	}
	if c.Scope != expectedScope || time.Now().Unix() >= c.Exp {
		return nil, false
	}
	return &c, true
}

func signRaw(data string) string {
	mac := hmac.New(sha256.New, masterKey)
	mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
