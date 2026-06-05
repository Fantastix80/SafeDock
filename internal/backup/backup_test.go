package backup

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/safedock/safedock/internal/db"
)

func TestBackupLifecycle(t *testing.T) {
	tmp := t.TempDir()
	if _, err := db.InitDB(filepath.Join(tmp, "safedock.db")); err != nil {
		t.Fatalf("InitDB : %v", err)
	}

	base := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	for i := 0; i < 3; i++ {
		if _, err := Create(base.Add(time.Duration(i) * time.Second)); err != nil {
			t.Fatalf("Create #%d : %v", i, err)
		}
	}

	list, err := List()
	if err != nil {
		t.Fatalf("List : %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("3 sauvegardes attendues, obtenu %d", len(list))
	}
	if list[0].Size == 0 {
		t.Error("la sauvegarde la plus récente ne devrait pas être vide")
	}
	if list[0].Name <= list[1].Name {
		t.Error("tri attendu : la plus récente en premier")
	}
	if list[0].CreatedAt == "" {
		t.Error("horodatage RFC3339 attendu")
	}

	// Rotation à 2 → supprime la plus ancienne.
	removed, err := Prune(2)
	if err != nil {
		t.Fatalf("Prune : %v", err)
	}
	if removed != 1 {
		t.Errorf("1 suppression attendue, obtenu %d", removed)
	}
	if l, _ := List(); len(l) != 2 {
		t.Errorf("2 sauvegardes attendues après rotation, obtenu %d", len(l))
	}

	// Sécurité : la traversée de répertoire doit être refusée.
	if _, err := Path("../../etc/passwd"); err == nil {
		t.Error("un nom avec traversée devrait être refusé")
	}
	// Un nom valide ET existant (le plus récent restant) doit être accepté.
	remaining, _ := List()
	if _, err := Path(remaining[0].Name); err != nil {
		t.Errorf("un nom valide existant ne devrait pas être refusé : %v", err)
	}

	// Collision d'horodatage (même seconde) → suffixe de désambiguïsation.
	a, _ := Create(base)
	b, _ := Create(base)
	if a.Name == b.Name {
		t.Error("deux sauvegardes de la même seconde devraient avoir des noms distincts")
	}

	// Le dossier des sauvegardes est bien sous le dossier de données.
	if _, err := os.Stat(filepath.Join(tmp, "backups")); err != nil {
		t.Errorf("dossier backups manquant : %v", err)
	}
}
