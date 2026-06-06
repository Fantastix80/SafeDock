package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
)

func TestHandleConfig(t *testing.T) {
	// 1. Initialisation d'une configuration témoin contenant des données SecOps et SMTP
	cfg := &config.Config{
		SMTP: config.SMTPConfig{
			Host:     "smtp.test.local",
			Port:     587,
			User:     "test-user",
			Password: "SUPER_SECRET_PASSWORD_MUST_NEVER_LEAK",
		},
		SecOps: config.SecOpsConfig{
			MaxSeverityAllowed: "HIGH",
			AllowRoot:          true,
			AllowPrivileged:    false,
		},
	}

	server := &Server{
		cfg:  cfg,
		port: 8080,
	}

	// 2. Création d'une requête HTTP fictive et d'un enregistreur de réponse
	req, err := http.NewRequest(http.MethodGet, "/api/config", nil)
	if err != nil {
		t.Fatalf("Impossible de créer la requête de test : %v", err)
	}
	// /api/config est réservé aux administrateurs : on passe par le middleware
	// d'auth avec une session admin valide.
	req.AddCookie(sessionCookie(t, 1, db.RoleAdmin))

	rr := httptest.NewRecorder()
	handler := auth.Middleware(http.HandlerFunc(server.HandleConfig))

	// 3. Exécution du gestionnaire d'API
	handler.ServeHTTP(rr, req)

	// 4. Validations
	if status := rr.Code; status != http.StatusOK {
		t.Errorf("Le gestionnaire a retourné un statut incorrect : obtenu %v, attendu %v", status, http.StatusOK)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Type de contenu incorrect : obtenu %v, attendu %v", contentType, "application/json")
	}

	// 5. Désérialisation et validation du contenu
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	if err != nil {
		t.Fatalf("Impossible de décoder la réponse JSON : %v", err)
	}

	// Validation de la section SMTP
	smtpRaw, ok := result["SMTP"]
	if !ok {
		t.Fatal("Section SMTP absente de la configuration retournée")
	}
	smtp := smtpRaw.(map[string]interface{})

	if smtp["Host"].(string) != "smtp.test.local" {
		t.Errorf("Host SMTP incorrect : obtenu %v", smtp["Host"])
	}
	if int(smtp["Port"].(float64)) != 587 {
		t.Errorf("Port SMTP incorrect : obtenu %v", smtp["Port"])
	}

	// CRITICAL SECURITY VALIDATION: Le mot de passe ne doit JAMAIS apparaître !
	if _, exists := smtp["Password"]; exists {
		t.Error("🚨 ALERTE SÉCURITÉ : Le mot de passe SMTP a fuité dans l'API publique config !")
	}

	// Validation SecOps
	secopsRaw, ok := result["SecOps"]
	if !ok {
		t.Fatal("Section SecOps absente")
	}
	secops := secopsRaw.(map[string]interface{})

	if secops["MaxSeverityAllowed"].(string) != "HIGH" {
		t.Errorf("MaxSeverityAllowed incorrect : obtenu %v", secops["MaxSeverityAllowed"])
	}
	if secops["AllowRoot"].(bool) != true {
		t.Errorf("AllowRoot incorrect")
	}
	if secops["AllowPrivileged"].(bool) != false {
		t.Errorf("AllowPrivileged incorrect")
	}
}

func TestHandleSingleContainerInvalidActions(t *testing.T) {
	server := &Server{
		cfg:  &config.Config{},
		port: 8080,
	}

	// Tentative d'appeler une action invalide sur la route dynamique
	req, err := http.NewRequest(http.MethodGet, "/api/containers/dummy-id/invalid-action", nil)
	if err != nil {
		t.Fatalf("Erreur requête : %v", err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(server.HandleSingleContainerSubRoutes)
	handler.ServeHTTP(rr, req)

	// L'action étant inconnue, le serveur doit renvoyer un statut 404 Not Found
	if rr.Code != http.StatusNotFound {
		t.Errorf("Attendu statut %d pour action inconnue, obtenu %d", http.StatusNotFound, rr.Code)
	}
}

func TestServerStartContextCancellation(t *testing.T) {
	server := NewServer(&config.Config{})
	
	// Utilisation d'un contexte déjà annulé pour tester que le serveur s'arrête proprement
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := server.Start(ctx)
	if err != nil && !strings.Contains(err.Error(), "http: Server closed") {
		t.Errorf("Le démarrage du serveur a échoué de façon inattendue : %v", err)
	}
}
