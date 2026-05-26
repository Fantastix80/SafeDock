package db

import (
	"database/sql"
	"testing"
)

func TestInitDBAndMigrations(t *testing.T) {
	// Initialisation d'une base de données SQLite en mémoire pour isolation
	db, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("Impossible d'initialiser SQLite en mémoire : %v", err)
	}

	if db == nil {
		t.Fatal("La connexion globale DB retournée est nil")
	}

	// Vérification de l'existence des tables créées par les migrations
	tables := []string{"settings", "registries", "audit_logs"}
	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", table).Scan(&name)
		if err != nil {
			t.Errorf("La table '%s' n'a pas été créée correctement : %v", table, err)
		}
	}
}

func TestSettingsCRUD(t *testing.T) {
	// Réinitialisation de la DB en mémoire
	globalDB = nil
	_, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("Erreur init : %v", err)
	}

	// 1. Test de lecture sur table vide (doit renvoyer sql.ErrNoRows)
	_, _, _, _, _, _, _, _, _, _, err = GetSettings()
	if err != sql.ErrNoRows {
		t.Errorf("Attendu ErrNoRows, obtenu : %v", err)
	}

	// 2. Test d'insertion (SaveSettings)
	err = SaveSettings(
		"smtp.test.local", 465, "user1", "pass123", "from@test.local", "to@test.local", true,
		"CRITICAL", false, true,
	)
	if err != nil {
		t.Fatalf("Impossible de sauvegarder les paramètres : %v", err)
	}

	// 3. Test de lecture (GetSettings)
	host, port, user, pass, from, to, skip, maxSev, root, priv, err := GetSettings()
	if err != nil {
		t.Fatalf("Impossible de lire les paramètres : %v", err)
	}

	if host != "smtp.test.local" || port != 465 || user != "user1" || pass != "pass123" || from != "from@test.local" || to != "to@test.local" || skip != true {
		t.Errorf("Paramètres SMTP invalides en DB")
	}

	if maxSev != "CRITICAL" || root != false || priv != true {
		t.Errorf("Paramètres SecOps invalides en DB")
	}

	// 4. Test de mise à jour (SaveSettings avec ON CONFLICT DO UPDATE)
	// On met à jour l'hôte et le port, et on laisse le mot de passe vide (ne doit pas être écrasé !)
	err = SaveSettings(
		"new-smtp.local", 587, "user1", "", "from@test.local", "to@test.local", false,
		"HIGH", true, false,
	)
	if err != nil {
		t.Fatalf("Échec mise à jour : %v", err)
	}

	host, port, user, pass, from, to, skip, maxSev, root, priv, err = GetSettings()
	if err != nil {
		t.Fatalf("Erreur lecture après MAJ : %v", err)
	}

	if host != "new-smtp.local" || port != 587 || skip != false {
		t.Errorf("Champs mis à jour incorrects : host=%s, port=%d", host, port)
	}

	// Validation de sécurité : Le mot de passe ne doit pas avoir été écrasé s'il était passé vide
	if pass != "pass123" {
		t.Errorf("🚨 ALERTE SÉCURITÉ : Le mot de passe SMTP a été effacé par une mise à jour à vide !")
	}

	if maxSev != "HIGH" || root != true || priv != false {
		t.Errorf("Champs SecOps après MAJ incorrects")
	}
}

func TestRegistriesCRUD(t *testing.T) {
	globalDB = nil
	_, _ = InitDB(":memory:")

	// 1. Insertion
	err := SaveRegistry("registry.gitlab.com", "deploy-token", "token-secret")
	if err != nil {
		t.Fatalf("Erreur insertion registre : %v", err)
	}

	// 2. Lecture
	list, err := GetRegistries()
	if err != nil {
		t.Fatalf("Erreur lecture registre : %v", err)
	}

	if len(list) != 1 {
		t.Fatalf("Attendu 1 registre, obtenu %d", len(list))
	}

	if list[0].ServerAddress != "registry.gitlab.com" || list[0].Username != "deploy-token" || list[0].Password != "token-secret" {
		t.Errorf("Données de registre invalides")
	}

	// 3. Suppression
	err = DeleteRegistry(list[0].ID)
	if err != nil {
		t.Fatalf("Erreur suppression : %v", err)
	}

	list, _ = GetRegistries()
	if len(list) != 0 {
		t.Errorf("Registre non supprimé")
	}
}

func TestAuditLogsCRUD(t *testing.T) {
	globalDB = nil
	_, _ = InitDB(":memory:")

	// 1. Insertion de 2 logs
	err := WriteAuditLog("target-app", "1234567890ab", "nginx@sha256:abc", "BLOCKED", "Faille critique CVE-2026-9999 dans l'image", 1, 3, 0)
	if err != nil {
		t.Fatalf("Erreur écriture log 1 : %v", err)
	}

	err = WriteAuditLog("target-app", "1234567890ab", "nginx@sha256:def", "SUCCESS", "Pivot réussi", 0, 0, 0)
	if err != nil {
		t.Fatalf("Erreur écriture log 2 : %v", err)
	}

	// 2. Lecture et vérification de l'ordre décroissant par timestamp
	logs, err := GetAuditLogs()
	if err != nil {
		t.Fatalf("Erreur lecture logs : %v", err)
	}

	if len(logs) != 2 {
		t.Fatalf("Attendu 2 logs, obtenu %d", len(logs))
	}

	// Le plus récent (log 2) doit apparaître en premier
	if logs[0].Status != "SUCCESS" || logs[1].Status != "BLOCKED" {
		t.Errorf("Ordre de tri des logs incorrect")
	}

	if logs[1].CVECritical != 1 || logs[1].CVEHigh != 3 {
		t.Errorf(" CVE counts incorrects pour log bloqué")
	}
}

func TestContainerSettingsCRUD(t *testing.T) {
	globalDB = nil
	_, _ = InitDB(":memory:")

	// 1. Check default settings for container on empty DB (should return nil values)
	maxSev, allowRoot, allowPriv, _, err := GetContainerSettings("my-app")
	if err != nil {
		t.Fatalf("Erreur lecture sur table vide : %v", err)
	}
	if maxSev != "" || allowRoot != nil || allowPriv != nil {
		t.Errorf("Attendu des valeurs vides/nil, obtenu maxSev=%s", maxSev)
	}

	// 2. Save settings (SaveContainerSettings)
	trueVal := true
	falseVal := false
	err = SaveContainerSettings("my-app", "HIGH", &trueVal, &falseVal, "trivy")
	if err != nil {
		t.Fatalf("Impossible de sauvegarder la surcharge : %v", err)
	}

	// 3. Read specific container settings (GetContainerSettings)
	maxSev, allowRoot, allowPriv, scannerVal, err := GetContainerSettings("my-app")
	if err != nil {
		t.Fatalf("Impossible de charger la surcharge : %v", err)
	}
	if maxSev != "HIGH" || allowRoot == nil || *allowRoot != true || allowPriv == nil || *allowPriv != false || scannerVal != "trivy" {
		t.Errorf("Surcharge lue incorrecte : maxSev=%s, root=%v, priv=%v, scanner=%s", maxSev, allowRoot, allowPriv, scannerVal)
	}

	// 4. Read all container settings (GetAllContainerSettings)
	list, err := GetAllContainerSettings()
	if err != nil {
		t.Fatalf("Erreur lecture globale des surcharges : %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("Attendu 1 surcharge, obtenu %d", len(list))
	}
	item, exists := list["my-app"]
	if !exists {
		t.Fatalf("Surcharge my-app introuvable dans la liste")
	}
	if item.MaxSeverityAllowed != "HIGH" || item.AllowRoot == nil || *item.AllowRoot != true || item.AllowPrivileged == nil || *item.AllowPrivileged != false || item.SecopsScanner != "trivy" {
		t.Errorf("Surcharge liste incorrecte")
	}

	// 5. Delete specific container settings (DeleteContainerSettings)
	err = DeleteContainerSettings("my-app")
	if err != nil {
		t.Fatalf("Erreur lors de la suppression de la surcharge : %v", err)
	}

	maxSev, allowRoot, allowPriv, _, err = GetContainerSettings("my-app")
	if err != nil {
		t.Fatalf("Erreur après suppression : %v", err)
	}
	if maxSev != "" || allowRoot != nil || allowPriv != nil {
		t.Errorf("La surcharge n'a pas été supprimée de la DB")
	}
}
