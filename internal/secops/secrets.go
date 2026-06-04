package secops

import (
	"math"
	"regexp"
	"strings"
)

// SecretLeak detaille une fuite de secret repérée dans la configuration d'un conteneur.
type SecretLeak struct {
	Key          string `json:"key"`
	ValueSnippet string `json:"value_snippet"` // Valeur masquée pour éviter les fuites secondaires dans les rapports
	Type         string `json:"type"`          // Raison de la détection (nom sensible, motif connu, haute entropie…)
}

// Mots-clés indiquant une variable contenant des données sensibles (détection par nom).
var sensitiveKeys = []string{
	"PASSWORD", "SECRET", "API_KEY", "APIKEY", "TOKEN", "CREDENTIAL",
	"PRIVATE_KEY", "PASSWD", "ACCESS_KEY", "AUTH_KEY",
}

// Motifs de secrets connus (détection par valeur, indépendante du nom de la variable).
var secretPatterns = []struct {
	name string
	re   *regexp.Regexp
}{
	{"clé d'accès AWS", regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
	{"jeton GitHub", regexp.MustCompile(`gh[pousr]_[0-9A-Za-z]{30,}`)},
	{"jeton Slack", regexp.MustCompile(`xox[baprs]-[0-9A-Za-z-]{10,}`)},
	{"clé API Google", regexp.MustCompile(`AIza[0-9A-Za-z_\-]{35}`)},
	{"jeton JWT", regexp.MustCompile(`eyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}`)},
	{"clé privée PEM", regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`)},
	{"identifiants dans une URL", regexp.MustCompile(`[a-z][a-z0-9+.\-]*://[^:@/\s]+:[^@/\s]+@`)},
}

const (
	entropyMinLength    = 24  // en-dessous, le risque de faux positif est trop élevé
	entropyThreshold    = 4.0 // bits/caractère : au-delà, la valeur ressemble à un secret aléatoire
)

// ScanEnvVariables analyse une liste de variables d'environnement (format KEY=VALUE)
// et détecte les secrets via trois mécanismes complémentaires :
//  1. nom de variable sensible (PASSWORD, TOKEN…) ;
//  2. motif de secret connu dans la valeur (clé AWS, JWT, clé privée, URL avec identifiants…) ;
//  3. valeur à haute entropie (secret aléatoire échappant aux deux premiers).
func ScanEnvVariables(envVars []string) []SecretLeak {
	var leaks []SecretLeak

	for _, env := range envVars {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		// Valeur trop courte ou vide : pas un secret exploitable.
		if val == "" || len(val) < 3 {
			continue
		}

		// On ignore les placeholders manifestes.
		lowerVal := strings.ToLower(val)
		if strings.Contains(lowerVal, "your_") ||
			strings.Contains(lowerVal, "<your") ||
			strings.Contains(lowerVal, "placeholder") ||
			strings.Contains(lowerVal, "todo") {
			continue
		}

		// 1. Détection par nom de variable.
		upperKey := strings.ToUpper(key)
		flaggedByName := false
		for _, sk := range sensitiveKeys {
			if strings.Contains(upperKey, sk) {
				flaggedByName = true
				break
			}
		}
		if flaggedByName {
			leaks = append(leaks, SecretLeak{Key: key, ValueSnippet: obfuscateSecret(val), Type: "nom de variable sensible"})
			continue
		}

		// 2. Détection par motif connu dans la valeur.
		matchedPattern := ""
		for _, p := range secretPatterns {
			if p.re.MatchString(val) {
				matchedPattern = p.name
				break
			}
		}
		if matchedPattern != "" {
			leaks = append(leaks, SecretLeak{Key: key, ValueSnippet: obfuscateSecret(val), Type: matchedPattern})
			continue
		}

		// 3. Détection par haute entropie (secret aléatoire sans nom ni motif révélateur).
		if len(val) >= entropyMinLength && !looksLikeText(val) && shannonEntropy(val) >= entropyThreshold {
			leaks = append(leaks, SecretLeak{Key: key, ValueSnippet: obfuscateSecret(val), Type: "valeur à haute entropie"})
		}
	}

	return leaks
}

// shannonEntropy calcule l'entropie de Shannon (bits par caractère) d'une chaîne.
func shannonEntropy(s string) float64 {
	if s == "" {
		return 0
	}
	freq := make(map[rune]float64)
	for _, c := range s {
		freq[c]++
	}
	n := float64(len([]rune(s)))
	entropy := 0.0
	for _, count := range freq {
		p := count / n
		entropy -= p * math.Log2(p)
	}
	return entropy
}

// looksLikeText réduit les faux positifs d'entropie : une valeur contenant des espaces
// ou plusieurs séparateurs de mots ressemble à du texte/chemin, pas à un secret brut.
func looksLikeText(s string) bool {
	if strings.ContainsAny(s, " \t") {
		return true
	}
	// Beaucoup de '/' → probablement un chemin de fichier ; beaucoup de '.' → hostname/version.
	if strings.Count(s, "/") >= 3 || strings.Count(s, ".") >= 3 {
		return true
	}
	return false
}

// obfuscateSecret masque la valeur du secret (affiche les 2 premiers caractères puis des astérisques).
func obfuscateSecret(secret string) string {
	if len(secret) <= 2 {
		return "***"
	}
	return secret[:2] + "***"
}
