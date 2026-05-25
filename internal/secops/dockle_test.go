package secops

import (
	"testing"
)

func TestParseDockleJSON(t *testing.T) {
	mockJSON := `{
		"summary": {
			"fatal": 1,
			"warn": 2,
			"info": 1,
			"pass": 15
		},
		"details": [
			{
				"code": "DKL-DI-0005",
				"title": "Clear text secrets in history",
				"level": "FATAL",
				"alerts": [
					"Secret environment variable found: SECRET_KEY"
				]
			},
			{
				"code": "DKL-DI-0006",
				"title": "Avoid running as root",
				"level": "WARN",
				"alerts": [
					"Last user should not be root"
				]
			}
		]
	}`

	imageName := "nginx:1.19"
	report, err := ParseDockleJSON(imageName, []byte(mockJSON))
	if err != nil {
		t.Fatalf("ParseDockleJSON a retourné une erreur inattendue : %v", err)
	}

	// 1. Validation du nom de l'image
	if report.ImageName != imageName {
		t.Errorf("ImageName attendu : %s, obtenu : %s", imageName, report.ImageName)
	}

	// 2. Validation du résumé
	if report.Summary.Fatal != 1 {
		t.Errorf("Summary.Fatal attendu : 1, obtenu : %d", report.Summary.Fatal)
	}
	if report.Summary.Warn != 2 {
		t.Errorf("Summary.Warn attendu : 2, obtenu : %d", report.Summary.Warn)
	}
	if report.Summary.Info != 1 {
		t.Errorf("Summary.Info attendu : 1, obtenu : %d", report.Summary.Info)
	}
	if report.Summary.Pass != 15 {
		t.Errorf("Summary.Pass attendu : 15, obtenu : %d", report.Summary.Pass)
	}

	// 3. Validation des détails
	if len(report.Details) != 2 {
		t.Errorf("Nombre de détails attendu : 2, obtenu : %d", len(report.Details))
	}

	firstAlert := report.Details[0]
	if firstAlert.Code != "DKL-DI-0005" {
		t.Errorf("Code attendu : DKL-DI-0005, obtenu : %s", firstAlert.Code)
	}
	if firstAlert.Level != "FATAL" {
		t.Errorf("Level attendu : FATAL, obtenu : %s", firstAlert.Level)
	}
	if len(firstAlert.Alerts) != 1 || firstAlert.Alerts[0] != "Secret environment variable found: SECRET_KEY" {
		t.Errorf("Alertes incorrectes obtenues : %v", firstAlert.Alerts)
	}
}
