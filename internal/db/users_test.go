package db

import (
	"testing"
	"time"

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

	// Sur une base vierge, aucun compte n'est amorcé : l'assistant de configuration
	// initiale (first-run) crée le premier admin. La migration n'auto-crée un 'admin'
	// que s'il existe un mot de passe hérité dans settings (installs historiques).
	if n, _ := CountAdmins(); n != 0 {
		t.Fatalf("attendu 0 admin sur base vierge, obtenu %d", n)
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

	// ListUsers : seulement alice (base vierge, pas d'admin auto-amorcé).
	list, _ := ListUsers()
	if len(list) != 1 {
		t.Errorf("attendu 1 compte, obtenu %d", len(list))
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

func TestInviteLifecycle(t *testing.T) {
	freshDB(t)

	id, err := CreateInvitedUser("invitee@example.com", RoleViewer, "Inv", "Itee", false, "hash-abc", time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("CreateInvitedUser : %v", err)
	}
	u, ok := GetUserByInviteHash("hash-abc")
	if !ok || u.ID != int(id) || u.Username != "invitee@example.com" {
		t.Fatalf("invitation introuvable : %+v ok=%v", u, ok)
	}
	if u.TOTPEnabled {
		t.Error("un compte invité ne devrait pas avoir le MFA actif")
	}

	// Invitation expirée → introuvable.
	if err := SetUserInvite(int(id), "hash-exp", time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("SetUserInvite : %v", err)
	}
	if _, ok := GetUserByInviteHash("hash-exp"); ok {
		t.Error("une invitation expirée ne devrait pas être valide")
	}

	// Réassignation valide, puis effacement après activation.
	_ = SetUserInvite(int(id), "hash-xyz", time.Now().Add(time.Hour))
	if _, ok := GetUserByInviteHash("hash-xyz"); !ok {
		t.Error("invitation valide attendue après réassignation")
	}
	if err := ClearUserInvite(int(id)); err != nil {
		t.Fatalf("ClearUserInvite : %v", err)
	}
	if _, ok := GetUserByInviteHash("hash-xyz"); ok {
		t.Error("une invitation effacée ne devrait plus être valide")
	}

	// URL de base.
	if GetBaseURL() != "" {
		t.Error("base_url devrait être vide par défaut")
	}
	if err := SetBaseURL("https://safedock.local:8080"); err != nil {
		t.Fatalf("SetBaseURL : %v", err)
	}
	if GetBaseURL() != "https://safedock.local:8080" {
		t.Errorf("base_url non persistée : %q", GetBaseURL())
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

func TestRetentionPerCategory(t *testing.T) {
	freshDB(t)

	// Par défaut : tout hérite (-1), défaut 90.
	rc := GetRetentionConfig()
	if rc.Default != 90 || rc.CVE != -1 || rc.Notifications != -1 {
		t.Fatalf("config par défaut inattendue : %+v", rc)
	}
	if rc.effective(rc.CVE) != 90 {
		t.Errorf("CVE héritée devrait valoir 90, obtenu %d", rc.effective(rc.CVE))
	}

	// CVE conservé illimité (0), notifications purgées à 30 j, le reste hérite (défaut 30).
	cfg := RetentionConfig{Default: 30, CVE: 0, Notifications: 30, SecurityAudit: -1, AuditLogs: -1}
	if err := SetRetentionConfig(cfg); err != nil {
		t.Fatalf("SetRetentionConfig : %v", err)
	}
	got := GetRetentionConfig()
	if got.Default != 30 || got.CVE != 0 || got.Notifications != 30 || got.SecurityAudit != -1 {
		t.Fatalf("config relue incorrecte : %+v", got)
	}

	db := GetDB()
	// Ancienne entrée CVE : ne doit PAS être purgée (CVE = illimité).
	_, _ = db.Exec("INSERT INTO cve_history (container_name, scanner, critical, high, medium, low, scanned_at) VALUES ('cve-old','trivy',1,0,0,0, datetime('now','-100 days'));")
	// Ancienne notification : doit être purgée (30 j).
	_, _ = db.Exec("INSERT INTO notifications (level, title, body, container_name, timestamp) VALUES ('CRITICAL','t','m','c', datetime('now','-100 days'));")

	if _, err := PurgeWithConfig(); err != nil {
		t.Fatalf("PurgeWithConfig : %v", err)
	}
	if pts, _ := GetVulnHistory("cve-old", 10); len(pts) != 1 {
		t.Error("l'historique CVE en illimité ne devrait pas être purgé")
	}
	var notifCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM notifications;").Scan(&notifCount)
	if notifCount != 0 {
		t.Errorf("la notification ancienne aurait dû être purgée, reste %d", notifCount)
	}
}
