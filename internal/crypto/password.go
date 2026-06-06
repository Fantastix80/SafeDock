package crypto

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"unicode"
)

// PasswordMinLength est la longueur minimale d'un mot de passe, conforme aux
// recommandations de l'ANSSI (mot de passe « fort » assorti de mesures
// complémentaires : MFA obligatoire + verrouillage anti-force-brute).
const PasswordMinLength = 12

// PasswordChecks détaille la conformité d'un mot de passe critère par critère.
// Sérialisable pour un éventuel usage API ; le front réalise sa propre vérification
// en direct pour guider la saisie.
type PasswordChecks struct {
	Length  bool `json:"length"`  // au moins PasswordMinLength caractères
	Upper   bool `json:"upper"`   // au moins une majuscule
	Lower   bool `json:"lower"`   // au moins une minuscule
	Digit   bool `json:"digit"`   // au moins un chiffre
	Special bool `json:"special"` // au moins un caractère spécial
}

// OK indique si tous les critères de robustesse sont satisfaits.
func (c PasswordChecks) OK() bool {
	return c.Length && c.Upper && c.Lower && c.Digit && c.Special
}

// isSpecial considère comme « spécial » toute ponctuation ou symbole.
func isSpecial(r rune) bool {
	return unicode.IsPunct(r) || unicode.IsSymbol(r)
}

// CheckPassword évalue un mot de passe au regard de la politique ANSSI.
func CheckPassword(pw string) PasswordChecks {
	c := PasswordChecks{Length: len([]rune(pw)) >= PasswordMinLength}
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			c.Upper = true
		case unicode.IsLower(r):
			c.Lower = true
		case unicode.IsDigit(r):
			c.Digit = true
		case isSpecial(r):
			c.Special = true
		}
	}
	return c
}

// ValidatePassword renvoie nil si le mot de passe respecte la politique, sinon
// une erreur listant précisément les critères manquants (message destiné à l'UI).
func ValidatePassword(pw string) error {
	c := CheckPassword(pw)
	if c.OK() {
		return nil
	}
	var missing []string
	if !c.Length {
		missing = append(missing, fmt.Sprintf("au moins %d caractères", PasswordMinLength))
	}
	if !c.Upper {
		missing = append(missing, "une majuscule")
	}
	if !c.Lower {
		missing = append(missing, "une minuscule")
	}
	if !c.Digit {
		missing = append(missing, "un chiffre")
	}
	if !c.Special {
		missing = append(missing, "un caractère spécial")
	}
	return fmt.Errorf("mot de passe trop faible : il doit contenir %s", strings.Join(missing, ", "))
}

// GenerateStrongPassword produit un mot de passe aléatoire conforme à la politique
// (≥ PasswordMinLength, majuscule, minuscule, chiffre, caractère spécial garantis).
// Utilisé pour l'amorçage du compte administrateur (mot de passe journalisé une fois).
func GenerateStrongPassword() (string, error) {
	const (
		lower   = "abcdefghijkmnpqrstuvwxyz"  // sans l ambigu
		upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"  // sans I/O ambigus
		digit   = "23456789"                  // sans 0/1 ambigus
		special = "!@#$%^&*-_=+?"             // ponctuation/symboles courants
		length  = 20
	)
	classes := []string{lower, upper, digit, special}
	all := lower + upper + digit + special

	out := make([]byte, 0, length)
	// Au moins un caractère de chaque classe requise.
	for _, set := range classes {
		ch, err := randChar(set)
		if err != nil {
			return "", err
		}
		out = append(out, ch)
	}
	// Compléter avec des caractères tirés de l'alphabet complet.
	for len(out) < length {
		ch, err := randChar(all)
		if err != nil {
			return "", err
		}
		out = append(out, ch)
	}
	// Mélange Fisher-Yates pour ne pas figer la position des classes garanties.
	for i := len(out) - 1; i > 0; i-- {
		j, err := randIndex(i + 1)
		if err != nil {
			return "", err
		}
		out[i], out[j] = out[j], out[i]
	}
	return string(out), nil
}

// randChar tire un caractère uniformément dans l'ensemble fourni.
func randChar(set string) (byte, error) {
	i, err := randIndex(len(set))
	if err != nil {
		return 0, err
	}
	return set[i], nil
}

// randIndex renvoie un entier aléatoire uniforme dans [0, n) sans biais.
func randIndex(n int) (int, error) {
	if n <= 0 {
		return 0, fmt.Errorf("plage aléatoire invalide")
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0, err
	}
	return int(v.Int64()), nil
}
