package secops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// DockleSummary stocke les statistiques globales des règles de conformité.
type DockleSummary struct {
	Fatal int `json:"fatal"`
	Warn  int `json:"warn"`
	Info  int `json:"info"`
	Pass  int `json:"pass"`
}

// DockleAlert contient les détails d'une non-conformité détectée.
type DockleAlert struct {
	Code   string   `json:"code"`
	Title  string   `json:"title"`
	Level  string   `json:"level"` // FATAL, WARN, INFO
	Alerts []string `json:"alerts"`
}

// DockleReport représente le rapport complet retourné par Dockle.
type DockleReport struct {
	ImageName string         `json:"image_name"`
	Summary   DockleSummary  `json:"summary"`
	Details   []DockleAlert  `json:"details"`
}

// Structures internes pour désérialiser le flux JSON de Dockle.
type rawDockleReport struct {
	Summary rawDockleSummary `json:"summary"`
	Details []rawDockleAlert `json:"details"`
}

type rawDockleSummary struct {
	Fatal int `json:"fatal"`
	Warn  int `json:"warn"`
	Info  int `json:"info"`
	Pass  int `json:"pass"`
}

type rawDockleAlert struct {
	Code   string   `json:"code"`
	Title  string   `json:"title"`
	Level  string   `json:"level"`
	Alerts []string `json:"alerts"`
}

// ScanCompliance exécute Dockle CLI en arrière-plan pour auditer la conformité
// de l'image (User Root, Fuite de clés, structures suspectes).
func ScanCompliance(ctx context.Context, imageName string) (*DockleReport, error) {
	// Nous configurons : dockle --format json <imageName>
	// "--" termine les options (anti-injection de drapeau via une référence en '-').
	cmd := exec.CommandContext(ctx, "dockle", "--format", "json", "--", imageName)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Dockle retourne des codes d'erreur non nuls si des alertes FATAL ou WARN sont détectées.
	// C'est pourquoi nous ne devons pas échouer directement si cmd.Run() retourne une erreur,
	// mais plutôt tenter de parser le flux JSON s'il a bien été généré.
	_ = cmd.Run()

	return ParseDockleJSON(imageName, stdout.Bytes())
}

// ParseDockleJSON parse le JSON produit par Dockle et construit un DockleReport.
func ParseDockleJSON(imageName string, data []byte) (*DockleReport, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("données de rapport Dockle vides")
	}

	var raw rawDockleReport
	err := json.Unmarshal(data, &raw)
	if err != nil {
		return nil, fmt.Errorf("impossible de décoder le JSON Dockle : %w | brute: %s", err, string(data))
	}

	report := &DockleReport{
		ImageName: imageName,
		Summary: DockleSummary{
			Fatal: raw.Summary.Fatal,
			Warn:  raw.Summary.Warn,
			Info:  raw.Summary.Info,
			Pass:  raw.Summary.Pass,
		},
		Details: make([]DockleAlert, 0),
	}

	for _, d := range raw.Details {
		report.Details = append(report.Details, DockleAlert(d))
	}

	return report, nil
}
