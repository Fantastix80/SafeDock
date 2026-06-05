package api

import (
	"os"
	"testing"

	"github.com/safedock/safedock/internal/crypto"
)

// TestMain initialise une clé maître éphémère (nécessaire au calcul des vérificateurs
// de mot de passe et à la signature des jetons de session dans les tests d'intégration).
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "safedock-api-test-crypto")
	if err != nil {
		panic(err)
	}
	if err := crypto.Init(dir); err != nil {
		panic(err)
	}
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}
