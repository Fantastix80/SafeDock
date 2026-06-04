package crypto

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"
)

// Paramètres TOTP standard, compatibles Microsoft Authenticator / Google Authenticator.
const (
	totpPeriod = 30 // secondes par pas
	totpDigits = 6
	totpSkew   = 1 // tolérance ± un pas (gère le décalage d'horloge)
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// GenerateTOTPSecret produit un secret aléatoire de 20 octets encodé en base32.
func GenerateTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return b32.EncodeToString(b), nil
}

// totpAt calcule le code TOTP pour un compteur de pas donné (RFC 6238 / HOTP RFC 4226).
func totpAt(secret string, counter uint64) (string, error) {
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", fmt.Errorf("secret TOTP invalide : %w", err)
	}
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	// Troncature dynamique (RFC 4226 §5.3).
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	code %= 1_000_000
	return fmt.Sprintf("%0*d", totpDigits, code), nil
}

// ValidateTOTP vérifie un code à 6 chiffres sur la fenêtre temporelle courante ± totpSkew.
// La comparaison est faite en temps constant.
func ValidateTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return false
	}
	counter := uint64(time.Now().Unix()) / totpPeriod
	for d := -totpSkew; d <= totpSkew; d++ {
		candidate, err := totpAt(secret, counter+uint64(int64(d)))
		if err != nil {
			return false
		}
		if subtle.ConstantTimeCompare([]byte(candidate), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

// TOTPProvisioningURI construit l'URI otpauth:// à encoder en QR code pour l'enrôlement.
func TOTPProvisioningURI(secret, account, issuer string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprintf("%d", totpDigits))
	q.Set("period", fmt.Sprintf("%d", totpPeriod))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// ── Codes de secours ────────────────────────────────────────────────────────

// GenerateBackupCodes produit n codes de secours lisibles (format xxxx-xxxx).
func GenerateBackupCodes(n int) ([]string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sans I,O,0,1 ambigus
	codes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		raw := make([]byte, 8)
		if _, err := io.ReadFull(rand.Reader, raw); err != nil {
			return nil, err
		}
		var sb strings.Builder
		for j, b := range raw {
			if j == 4 {
				sb.WriteByte('-')
			}
			sb.WriteByte(alphabet[int(b)%len(alphabet)])
		}
		codes = append(codes, sb.String())
	}
	return codes, nil
}

// HashBackupCode calcule le vérificateur HMAC d'un code de secours (clé maître).
// Normalisé en majuscules et sans tiret pour tolérer les variations de saisie.
func HashBackupCode(code string) string {
	norm := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
	return PasswordVerifier(norm)
}
