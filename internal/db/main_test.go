package db

import (
	"os"
	"testing"

	"github.com/safedock/safedock/internal/crypto"
)

// TestMain initialise une clé maître éphémère avant la suite de tests du package db.
// Le chiffrement des secrets au repos (SMTP, registres, TOTP) en dépend : sans clé,
// SaveSettings/SaveRegistry échouent avec « clé maître non initialisée ».
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "safedock-db-test-crypto")
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
