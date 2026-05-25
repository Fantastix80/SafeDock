package secops

import (
	"testing"
)

func TestParseTrivyJSON(t *testing.T) {
	// Exemple de JSON simulé généré par Trivy CLI
	mockJSON := `{
		"SchemaVersion": 2,
		"Results": [
			{
				"Target": "nginx:1.19 (debian 10.4)",
				"Vulnerabilities": [
					{
						"VulnerabilityID": "CVE-2020-1234",
						"PkgName": "openssl",
						"InstalledVersion": "1.1.1d-0+deb10u3",
						"FixedVersion": "1.1.1d-0+deb10u4",
						"Severity": "CRITICAL",
						"Title": "Critical vulnerability in OpenSSL",
						"PrimaryURL": "https://avd.aquasec.com/nvd/cve-2020-1234"
					},
					{
						"VulnerabilityID": "CVE-2020-5678",
						"PkgName": "bash",
						"InstalledVersion": "5.0-4",
						"FixedVersion": "5.0-5",
						"Severity": "HIGH",
						"Title": "High severity execution vulnerability",
						"PrimaryURL": "https://avd.aquasec.com/nvd/cve-2020-5678"
					},
					{
						"VulnerabilityID": "CVE-2021-9999",
						"PkgName": "libc",
						"InstalledVersion": "2.28-10",
						"Severity": "MEDIUM",
						"Title": "Medium vulnerability",
						"PrimaryURL": "https://avd.aquasec.com/nvd/cve-2021-9999"
					},
					{
						"VulnerabilityID": "CVE-2022-0001",
						"PkgName": "zlib",
						"InstalledVersion": "1.2.11",
						"Severity": "LOW",
						"Title": "Low vulnerability",
						"PrimaryURL": "https://avd.aquasec.com/nvd/cve-2022-0001"
					},
					{
						"VulnerabilityID": "CVE-2022-0002",
						"PkgName": "unzip",
						"InstalledVersion": "6.0",
						"Severity": "UNKNOWN",
						"Title": "Unknown vulnerability",
						"PrimaryURL": "https://avd.aquasec.com/nvd/cve-2022-0002"
					}
				]
			}
		]
	}`

	imageName := "nginx:1.19"
	report, err := ParseTrivyJSON(imageName, []byte(mockJSON))
	if err != nil {
		t.Fatalf("ParseTrivyJSON a retourné une erreur inattendue : %v", err)
	}

	// 1. Validation du nom de l'image
	if report.ImageName != imageName {
		t.Errorf("ImageName attendu : %s, obtenu : %s", imageName, report.ImageName)
	}

	// 2. Validation du nombre total de vulnérabilités
	expectedTotal := 5
	actualTotal := len(report.Vulnerabilities)
	if actualTotal != expectedTotal {
		t.Errorf("Nombre total de vulnérabilités attendu : %d, obtenu : %d", expectedTotal, actualTotal)
	}

	// 3. Validation du décompte des vulnérabilités par sévérité
	if report.Summary.Critical != 1 {
		t.Errorf("Décompte CRITICAL attendu : 1, obtenu : %d", report.Summary.Critical)
	}
	if report.Summary.High != 1 {
		t.Errorf("Décompte HIGH attendu : 1, obtenu : %d", report.Summary.High)
	}
	if report.Summary.Medium != 1 {
		t.Errorf("Décompte MEDIUM attendu : 1, obtenu : %d", report.Summary.Medium)
	}
	if report.Summary.Low != 1 {
		t.Errorf("Décompte LOW attendu : 1, obtenu : %d", report.Summary.Low)
	}
	if report.Summary.Unknown != 1 {
		t.Errorf("Décompte UNKNOWN attendu : 1, obtenu : %d", report.Summary.Unknown)
	}

	// 4. Validation d'une vulnérabilité spécifique
	firstVuln := report.Vulnerabilities[0]
	if firstVuln.CVEID != "CVE-2020-1234" {
		t.Errorf("CVEID attendu : CVE-2020-1234, obtenu : %s", firstVuln.CVEID)
	}
	if firstVuln.PackageName != "openssl" {
		t.Errorf("PackageName attendu : openssl, obtenu : %s", firstVuln.PackageName)
	}
	if firstVuln.Severity != "CRITICAL" {
		t.Errorf("Severity attendu : CRITICAL, obtenu : %s", firstVuln.Severity)
	}
}
