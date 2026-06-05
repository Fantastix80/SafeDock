package secops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
)

// Structures pour décoder le flux JSON de Grype CLI.
type rawGrypeReport struct {
	Matches []rawGrypeMatch `json:"matches"`
}

type rawGrypeMatch struct {
	Vulnerability rawGrypeVulnerability `json:"vulnerability"`
	Artifact      rawGrypeArtifact      `json:"artifact"`
}

type rawGrypeVulnerability struct {
	ID          string   `json:"id"`
	Severity    string   `json:"severity"` // "Critical", "High", "Medium", "Low", "Negligible", "Unknown"
	Description string   `json:"description"`
	URLs        []string `json:"urls"`
}

type rawGrypeArtifact struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ScanImageGrype exécute Anchore Grype CLI en arrière-plan et décode son rapport JSON.
func ScanImageGrype(ctx context.Context, imageName string) (*TrivyReport, error) {
	// "--" termine les options : la référence d'image est traitée comme argument
	// positionnel même si elle commence par '-' (anti-injection de drapeau).
	cmd := exec.CommandContext(ctx, "grype", "-o", "json", "--", imageName)
	
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		// SÉCURITÉ : aucun rapport simulé. Un outil de sécurité ne doit jamais
		// fabriquer de données de vulnérabilité. Si le binaire est absent ou échoue,
		// on remonte une erreur explicite plutôt qu'un faux verdict.
		if strings.Contains(err.Error(), "executable file not found") {
			return nil, fmt.Errorf("le binaire 'grype' est introuvable dans le PATH — installez Grype ou choisissez un autre scanner")
		}
		return nil, fmt.Errorf("erreur lors de l'exécution de Grype (code: %v) | stderr: %s", err, stderr.String())
	}

	return ParseGrypeJSON(imageName, stdout.Bytes())
}

// ParseGrypeJSON décode le buffer JSON natif de Grype et le mappe vers notre structure TrivyReport.
func ParseGrypeJSON(imageName string, data []byte) (*TrivyReport, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("données de rapport Grype vides")
	}

	var raw rawGrypeReport
	err := json.Unmarshal(data, &raw)
	if err != nil {
		return nil, fmt.Errorf("impossible de décoder le JSON Grype : %w", err)
	}

	report := &TrivyReport{
		ImageName:       imageName,
		Vulnerabilities: make([]VulnerabilityDetail, 0),
	}

	for _, m := range raw.Matches {
		sev := strings.ToUpper(m.Vulnerability.Severity)
		if sev == "NEGLIGIBLE" {
			sev = "LOW"
		}

		url := ""
		if len(m.Vulnerability.URLs) > 0 {
			url = m.Vulnerability.URLs[0]
		}

		detail := VulnerabilityDetail{
			CVEID:            m.Vulnerability.ID,
			PackageName:      m.Artifact.Name,
			InstalledVersion: m.Artifact.Version,
			FixedVersion:     "", // Grype fournit les versions corrigées dans d'autres sous-structures, non nécessaire ici
			Severity:         sev,
			Title:            fmt.Sprintf("Faille détectée par Grype dans le paquet %s", m.Artifact.Name),
			Description:      m.Vulnerability.Description,
			URL:              url,
		}

		report.Vulnerabilities = append(report.Vulnerabilities, detail)

		// Remplissage du résumé
		switch sev {
		case "CRITICAL":
			report.Summary.Critical++
		case "HIGH":
			report.Summary.High++
		case "MEDIUM":
			report.Summary.Medium++
		case "LOW":
			report.Summary.Low++
		default:
			report.Summary.Unknown++
		}
	}

	return report, nil
}


// ScanImageHybrid exécute les deux analyses (Trivy et Grype) et fusionne les résultats.
func ScanImageHybrid(ctx context.Context, imageName string) (*TrivyReport, error) {
	trivyReport, errT := ScanImage(ctx, imageName)
	if errT != nil {
		log.Printf("[HYBRID WARNING] Échec scan Trivy, tentative Grype seul : %v\n", errT)
	}

	grypeReport, errG := ScanImageGrype(ctx, imageName)
	if errG != nil {
		log.Printf("[HYBRID WARNING] Échec scan Grype : %v\n", errG)
		if errT != nil {
			return nil, fmt.Errorf("les deux scanners Trivy et Grype ont échoué")
		}
		return trivyReport, nil
	}

	if errT != nil {
		return grypeReport, nil
	}

	// Fusion des vulnérabilités
	mergedMap := make(map[string]VulnerabilityDetail)

	// Ajouter Trivy en premier
	for _, v := range trivyReport.Vulnerabilities {
		key := strings.ToUpper(v.CVEID)
		if key == "" {
			key = v.PackageName + "@" + v.InstalledVersion
		}
		mergedMap[key] = v
	}

	// Ajouter Grype, en complétant ou en flaguant
	for _, v := range grypeReport.Vulnerabilities {
		key := strings.ToUpper(v.CVEID)
		if key == "" {
			key = v.PackageName + "@" + v.InstalledVersion
		}

		if existing, exists := mergedMap[key]; exists {
			// Si déjà présente, on indique que les deux ont détecté
			existing.Scanner = "Trivy & Grype"
			if existing.Description == "" {
				existing.Description = v.Description
			}
			mergedMap[key] = existing
		} else {
			// Sinon on ajoute avec Scanner = "Grype"
			v.Scanner = "Grype"
			mergedMap[key] = v
		}
	}

	// Recompiler la liste
	report := &TrivyReport{
		ImageName:       imageName,
		Vulnerabilities: make([]VulnerabilityDetail, 0, len(mergedMap)),
	}

	for _, v := range mergedMap {
		report.Vulnerabilities = append(report.Vulnerabilities, v)

		// Recalcul du résumé de sévérité
		switch v.Severity {
		case "CRITICAL":
			report.Summary.Critical++
		case "HIGH":
			report.Summary.High++
		case "MEDIUM":
			report.Summary.Medium++
		case "LOW":
			report.Summary.Low++
		default:
			report.Summary.Unknown++
		}
	}

	return report, nil
}
