package secops

import (
	"strings"
)

// SecretLeak detaille une fuite de secret repérée dans la configuration d'un conteneur.
type SecretLeak struct {
	Key          string `json:"key"`
	ValueSnippet string `json:"value_snippet"` // Valeur masquée pour éviter les fuites secondaires dans les rapports
}

// ScanEnvVariables analyse une liste de variables d'environnement (format KEY=VALUE)
// et recherche la présence de clés, mots de passe ou tokens passés en clair.
func ScanEnvVariables(envVars []string) []SecretLeak {
	var leaks []SecretLeak

	// Mots-clés indiquant une variable contenant des données sensibles
	sensitiveKeys := []string{
		"PASSWORD",
		"SECRET",
		"API_KEY",
		"APIKEY",
		"TOKEN",
		"CREDENTIAL",
		"PRIVATE_KEY",
		"PASSWD",
		"ACCESS_KEY",
		"AUTH_KEY",
	}

	for _, env := range envVars {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		// Si la valeur est vide ou trop courte, on ne la considère pas comme un secret fuité
		if val == "" || len(val) < 3 {
			continue
		}

		// On ignore les valeurs qui sont manifestement des placeholders inoffensifs
		lowerVal := strings.ToLower(val)
		if strings.Contains(lowerVal, "your_") || 
			strings.Contains(lowerVal, "<your") || 
			strings.Contains(lowerVal, "placeholder") || 
			strings.Contains(lowerVal, "todo") {
			continue
		}

		upperKey := strings.ToUpper(key)
		isSensitive := false

		for _, sk := range sensitiveKeys {
			if strings.Contains(upperKey, sk) {
				isSensitive = true
				break
			}
		}

		if isSensitive {
			leaks = append(leaks, SecretLeak{
				Key:          key,
				ValueSnippet: obfuscateSecret(val),
			})
		}
	}

	return leaks
}

// obfuscateSecret masque la valeur du secret (affiche les 2 premiers caractères puis des astérisques).
func obfuscateSecret(secret string) string {
	if len(secret) <= 2 {
		return "***"
	}
	return secret[:2] + "***"
}
