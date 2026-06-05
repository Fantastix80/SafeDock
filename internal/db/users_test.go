package db

import (
	"testing"

	"github.com/safedock/safedock/internal/crypto"
)

func freshDB(t *testing.T) {
	t.Helper()
	globalDB = nil
	if _, err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB : %v", err)
	}
}

func TestValidRole(t *testing.T) {
	for _, r := range []string{RoleViewer, RoleAuditor, RoleAdmin} {
		if !ValidRole(r) {
			t.Errorf("%q devrait être un rôle valide", r)
		}
	}
	for _, r := range []string{"", "root", "superadmin"} {
		if ValidRole(r) {
			t.Errorf("%q ne devrait pas être un rôle valide", r)
		}
	}
}

func TestUserLifecycle(t *testing.T) {
	freshDB(t)

	// InitDB amorce un compte 'admin' (migration).
	if n, _ := CountAdmins(); n != 1 {
		t.Fatalf("attendu 1 admin amorcé, obtenu %d", n)
	}

	hash := crypto.PasswordVerifier("ViewerPass10")
	id, err := CreateUser("alice@corp.com", hash, RoleViewer, "Alice", "Martin", false, true)
	if err != nil {
		t.Fatalf("CreateUser : %v", err)
	}
	if id == 0 {
		t.Fatal("id de création nul")
	}

	// GetUserAuth (par identifiant = e-mail).
	auth, err := GetUserAuth("alice@corp.com")
	if err != nil || !auth.Found {
		t.Fatalf("GetUserAuth : found=%v err=%v", auth.Found, err)
	}
	if !crypto.VerifyPassword("ViewerPass10", auth.PasswordHash) {
		t.Error("le hash stocké devrait vérifier le mot de passe")
	}
	if !auth.MustChangePassword {
		t.Error("must_change_password devrait être vrai à la création")
	}

	// GetUserByID (vue publique).
	u, err := GetUserByID(int(id))
	if err != nil {
		t.Fatalf("GetUserByID : %v", err)
	}
	if u.FirstName != "Alice" || u.LastName != "Martin" || u.Role != RoleViewer {
		t.Errorf("identité incorrecte : %+v", u)
	}

	// ListUsers : admin + alice.
	list, _ := ListUsers()
	if len(list) != 2 {
		t.Errorf("attendu 2 comptes, obtenu %d", len(list))
	}

	// Changement de rôle.
	if err := SetUserRole(int(id), RoleAuditor); err != nil {
		t.Fatalf("SetUserRole : %v", err)
	}
	u, _ = GetUserByID(int(id))
	if u.Role != RoleAuditor {
		t.Errorf("rôle attendu auditor, obtenu %q", u.Role)
	}

	// Changement de mot de passe (lève must_change).
	if err := SetUserPassword(int(id), crypto.PasswordVerifier("NewPass1234"), false); err != nil {
		t.Fatalf("SetUserPassword : %v", err)
	}
	auth, _ = GetUserAuth("alice@corp.com")
	if auth.MustChangePassword {
		t.Error("must_change_password devrait être faux après changement")
	}

	// Suppression.
	if err := DeleteUser(int(id)); err != nil {
		t.Fatalf("DeleteUser : %v", err)
	}
	if a, _ := GetUserAuth("alice@corp.com"); a.Found {
		t.Error("le compte supprimé ne devrait plus être trouvé")
	}
}

func TestUserScopes(t *testing.T) {
	freshDB(t)
	id, _ := CreateUser("bob@corp.com", crypto.PasswordVerifier("BobPass1234"), RoleViewer, "Bob", "Durand", false, false)

	if err := SetUserAllowedTags(int(id), []int{1, 2, 3}); err != nil {
		t.Fatalf("SetUserAllowedTags : %v", err)
	}
	if err := SetUserAllowedHosts(int(id), []int{7}); err != nil {
		t.Fatalf("SetUserAllowedHosts : %v", err)
	}
	tags, _ := GetUserAllowedTags(int(id))
	if len(tags) != 3 {
		t.Errorf("attendu 3 tags, obtenu %v", tags)
	}
	hosts, _ := GetUserAllowedHosts(int(id))
	if len(hosts) != 1 || hosts[0] != 7 {
		t.Errorf("attendu [7], obtenu %v", hosts)
	}
	// Remplacement (et non ajout).
	_ = SetUserAllowedTags(int(id), []int{5})
	tags, _ = GetUserAllowedTags(int(id))
	if len(tags) != 1 || tags[0] != 5 {
		t.Errorf("le remplacement de portée a échoué : %v", tags)
	}
}

func TestRetention(t *testing.T) {
	freshDB(t)

	if GetRetentionDays() != 90 {
		t.Errorf("rétention par défaut attendue 90, obtenu %d", GetRetentionDays())
	}
	if err := SetRetentionDays(30); err != nil {
		t.Fatalf("SetRetentionDays : %v", err)
	}
	if GetRetentionDays() != 30 {
		t.Errorf("rétention 30 attendue, obtenu %d", GetRetentionDays())
	}

	db := GetDB()
	_, _ = db.Exec("INSERT INTO cve_history (container_name, scanner, critical, high, medium, low, scanned_at) VALUES ('old','trivy',1,2,3,4, datetime('now','-100 days'));")
	_, _ = db.Exec("INSERT INTO cve_history (container_name, scanner, critical, high, medium, low, scanned_at) VALUES ('recent','trivy',0,0,0,0, datetime('now','-1 days'));")

	n, err := PurgeOldData(30)
	if err != nil {
		t.Fatalf("PurgeOldData : %v", err)
	}
	if n < 1 {
		t.Errorf("au moins 1 ligne devrait être purgée, obtenu %d", n)
	}
	if pts, _ := GetVulnHistory("old", 10); len(pts) != 0 {
		t.Error("l'entrée ancienne aurait dû être purgée")
	}
	if pts, _ := GetVulnHistory("recent", 10); len(pts) != 1 {
		t.Error("l'entrée récente aurait dû être conservée")
	}

	// Rétention illimitée → aucune purge.
	if n0, _ := PurgeOldData(0); n0 != 0 {
		t.Errorf("rétention illimitée ne doit rien purger, obtenu %d", n0)
	}
}
