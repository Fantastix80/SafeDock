package secops

import (
	"testing"
)

func TestScanEnvVariables(t *testing.T) {
	mockEnv := []string{
		"DB_HOST=127.0.0.1",
		"DB_PORT=5432",
		"DB_PASSWORD=mySuperSecretPassword123", // Devrait déclencher
		"API_KEY=key_live_abcdefg123456",       // Devrait déclencher
		"APP_SECRET=token_secure_987654",       // Devrait déclencher
		"PUBLIC_VARIABLE=hello_world",
		"EMPTY_SECRET_KEY=",                    // Devrait être ignoré (valeur vide)
		"PASSWORD_PLACEHOLDER=your_password",   // Devrait être ignoré (placeholder)
		"SHORT_SECRET=ab",                      // Devrait être ignoré (trop court)
	}

	leaks := ScanEnvVariables(mockEnv)

	// Doit détecter précisément 3 fuites
	expectedCount := 3
	if len(leaks) != expectedCount {
		t.Fatalf("Nombre de fuites attendu : %d, obtenu : %d", expectedCount, len(leaks))
	}

	// Indexation rapide des résultats pour vérification
	leakMap := make(map[string]string)
	for _, l := range leaks {
		leakMap[l.Key] = l.ValueSnippet
	}

	// 1. Validation de DB_PASSWORD
	pwdSnippet, exists := leakMap["DB_PASSWORD"]
	if !exists {
		t.Errorf("Variable DB_PASSWORD non détectée comme sensible")
	}
	if pwdSnippet != "my***" {
		t.Errorf("Snippet de masquage incorrect pour DB_PASSWORD : '%s', attendu : 'my***'", pwdSnippet)
	}

	// 2. Validation de API_KEY
	keySnippet, exists := leakMap["API_KEY"]
	if !exists {
		t.Errorf("Variable API_KEY non détectée comme sensible")
	}
	if keySnippet != "ke***" {
		t.Errorf("Snippet de masquage incorrect pour API_KEY : '%s', attendu : 'ke***'", keySnippet)
	}

	// 3. Validation de APP_SECRET
	secSnippet, exists := leakMap["APP_SECRET"]
	if !exists {
		t.Errorf("Variable APP_SECRET non détectée comme sensible")
	}
	if secSnippet != "to***" {
		t.Errorf("Snippet de masquage incorrect pour APP_SECRET : '%s', attendu : 'to***'", secSnippet)
	}

	// 4. Validation que les variables inoffensives ou ignorées ne sont pas présentes
	if _, exists := leakMap["PUBLIC_VARIABLE"]; exists {
		t.Errorf("PUBLIC_VARIABLE indûment signalée comme fuyante")
	}
	if _, exists := leakMap["EMPTY_SECRET_KEY"]; exists {
		t.Errorf("EMPTY_SECRET_KEY indûment signalée comme fuyante")
	}
	if _, exists := leakMap["PASSWORD_PLACEHOLDER"]; exists {
		t.Errorf("PASSWORD_PLACEHOLDER indûment signalée comme fuyante")
	}
}
