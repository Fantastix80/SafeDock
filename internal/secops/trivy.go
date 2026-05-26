package secops

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// VulnerabilityDetail fournit les métadonnées sur une CVE spécifique.
type VulnerabilityDetail struct {
	CVEID            string `json:"cve_id"`
	PackageName      string `json:"package_name"`
	InstalledVersion string `json:"installed_version"`
	FixedVersion     string `json:"fixed_version"`
	Severity         string `json:"severity"`
	Title            string `json:"title"`
	Description      string `json:"description"`
	URL              string `json:"url"`
	Scanner          string `json:"scanner"`
}

// TrivySummary stocke le décompte brut des CVE classées par sévérité.
type TrivySummary struct {
	Unknown  int `json:"unknown"`
	Low      int `json:"low"`
	Medium   int `json:"medium"`
	High     int `json:"high"`
	Critical int `json:"critical"`
}

// TrivyReport est le rapport final structuré retourné à SafeDock.
type TrivyReport struct {
	ImageName       string                `json:"image_name"`
	Summary         TrivySummary          `json:"summary"`
	Vulnerabilities []VulnerabilityDetail `json:"vulnerabilities"`
}

// Structures internes pour désérialiser le JSON natif produit par Trivy.
type rawTrivyReport struct {
	Results []rawTrivyResult `json:"Results"`
}

type rawTrivyResult struct {
	Target          string             `json:"Target"`
	Vulnerabilities []rawVulnerability `json:"Vulnerabilities"`
}

type rawVulnerability struct {
	VulnerabilityID  string `json:"VulnerabilityID"`
	PkgName          string `json:"PkgName"`
	InstalledVersion string `json:"InstalledVersion"`
	FixedVersion     string `json:"FixedVersion"`
	Severity         string `json:"Severity"`
	Title            string `json:"Title"`
	Description      string `json:"Description"`
	PrimaryURL       string `json:"PrimaryURL"`
}

// ScanImage exécute Trivy CLI en arrière-plan sur l'image fournie,
// capture son flux JSON de sortie, et retourne un rapport structuré.
func ScanImage(ctx context.Context, imageName string) (*TrivyReport, error) {
	// Nous configurons la commande : trivy image --format json --quiet <imageName>
	// --quiet permet de désactiver les barres de chargement et logs parasites sur stderr.
	cmd := exec.CommandContext(ctx, "trivy", "image", "--format", "json", "--quiet", imageName)
	
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("erreur lors de l'exécution de Trivy (code: %v) | stderr: %s", err, stderr.String())
	}

	return ParseTrivyJSON(imageName, stdout.Bytes())
}

// ParseTrivyJSON décode le buffer JSON natif de Trivy et construit le TrivyReport.
// Cette fonction est séparée pour permettre d'écrire des tests unitaires facilement.
func ParseTrivyJSON(imageName string, data []byte) (*TrivyReport, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("données de rapport Trivy vides")
	}

	var raw rawTrivyReport
	err := json.Unmarshal(data, &raw)
	if err != nil {
		return nil, fmt.Errorf("impossible de décoder le JSON Trivy : %w", err)
	}

	report := &TrivyReport{
		ImageName:       imageName,
		Vulnerabilities: make([]VulnerabilityDetail, 0),
	}

	for _, result := range raw.Results {
		for _, vuln := range result.Vulnerabilities {
			// Normalisation de la sévérité
			sev := strings.ToUpper(vuln.Severity)
			
			// Enregistrement des détails de vulnérabilité
			detail := VulnerabilityDetail{
				CVEID:            vuln.VulnerabilityID,
				PackageName:      vuln.PkgName,
				InstalledVersion: vuln.InstalledVersion,
				FixedVersion:     vuln.FixedVersion,
				Severity:         sev,
				Title:            vuln.Title,
				Description:      vuln.Description,
				URL:              vuln.PrimaryURL,
				Scanner:          "Trivy",
			}
			report.Vulnerabilities = append(report.Vulnerabilities, detail)

			// Mise à jour du résumé
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
	}

	return report, nil
}
