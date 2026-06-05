package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
)

var rbacSeq int

// setupRBAC monte un serveur de test exposant quelques routes derrière le VRAI
// middleware d'authentification, et crée un jeu de comptes (admin/auditor/viewer +
// un compte must_change). Les e-mails sont uniques par appel (la connexion SQLite
// globale est partagée entre tests du paquet).
func setupRBAC(t *testing.T) (*httptest.Server, map[string]int) {
	t.Helper()
	if _, err := db.InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB : %v", err)
	}
	rbacSeq++
	suffix := fmt.Sprintf("%d", rbacSeq)

	mk := func(prefix, role string, mustChange bool) int {
		email := prefix + suffix + "@example.com"
		id, err := db.CreateUser(email, crypto.PasswordVerifier("Password1234"), role, "Prénom", "Nom", false, mustChange)
		if err != nil {
			t.Fatalf("CreateUser %s : %v", email, err)
		}
		return int(id)
	}
	ids := map[string]int{
		"admin":      mk("admin", db.RoleAdmin, false),
		"auditor":    mk("auditor", db.RoleAuditor, false),
		"viewer":     mk("viewer", db.RoleViewer, false),
		"mustchange": mk("newadmin", db.RoleAdmin, true),
	}

	s := &Server{}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/users", s.HandleUsers)
	mux.HandleFunc("/api/audit-logs", s.HandleAuditLogs)
	mux.HandleFunc("/api/notifications", s.HandleNotifications)
	mux.HandleFunc("/api/tags", s.HandleTags)
	mux.HandleFunc("/api/session", auth.HandleSession)

	srv := httptest.NewServer(auth.Middleware(mux))
	t.Cleanup(srv.Close)
	return srv, ids
}

func sessionCookie(t *testing.T, userID int, role string) *http.Cookie {
	t.Helper()
	tok, err := crypto.NewToken(crypto.ScopeSession, userID, role, time.Hour)
	if err != nil {
		t.Fatalf("NewToken : %v", err)
	}
	return &http.Cookie{Name: "safedock_session", Value: tok}
}

func status(t *testing.T, srv *httptest.Server, method, path string, c *http.Cookie) int {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, nil)
	if c != nil {
		req.AddCookie(c)
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("requête %s %s : %v", method, path, err)
	}
	_ = resp.Body.Close()
	return resp.StatusCode
}

func TestRBACGates(t *testing.T) {
	srv, ids := setupRBAC(t)

	cases := []struct {
		path, role, who string
		want            int
	}{
		// Gestion des comptes : admin uniquement.
		{"/api/users", db.RoleAdmin, "admin", http.StatusOK},
		{"/api/users", db.RoleAuditor, "auditor", http.StatusForbidden},
		{"/api/users", db.RoleViewer, "viewer", http.StatusForbidden},
		// Journaux d'audit : auditeur+.
		{"/api/audit-logs", db.RoleAuditor, "auditor", http.StatusOK},
		{"/api/audit-logs", db.RoleViewer, "viewer", http.StatusForbidden},
		// Notifications : auditeur+.
		{"/api/notifications", db.RoleAuditor, "auditor", http.StatusOK},
		{"/api/notifications", db.RoleViewer, "viewer", http.StatusForbidden},
		// Liste des tags : tout compte authentifié.
		{"/api/tags", db.RoleViewer, "viewer", http.StatusOK},
	}
	for _, c := range cases {
		got := status(t, srv, http.MethodGet, c.path, sessionCookie(t, ids[c.who], c.role))
		if got != c.want {
			t.Errorf("GET %s en %s : attendu %d, obtenu %d", c.path, c.role, c.want, got)
		}
	}

	// Sans session → 401.
	if got := status(t, srv, http.MethodGet, "/api/users", nil); got != http.StatusUnauthorized {
		t.Errorf("sans session : attendu 401, obtenu %d", got)
	}
}

func TestMustChangeEnforcement(t *testing.T) {
	srv, ids := setupRBAC(t)
	c := sessionCookie(t, ids["mustchange"], db.RoleAdmin)

	// Bien qu'administrateur, l'accès est bloqué tant que le mot de passe imposé
	// n'a pas été changé.
	if got := status(t, srv, http.MethodGet, "/api/users", c); got != http.StatusForbidden {
		t.Errorf("must_change devrait bloquer /api/users : attendu 403, obtenu %d", got)
	}
	// La route publique /api/session reste accessible.
	if got := status(t, srv, http.MethodGet, "/api/session", c); got != http.StatusOK {
		t.Errorf("/api/session devrait rester accessible : obtenu %d", got)
	}
}
