package scheduler

import (
	"strings"
	"testing"

	"github.com/safedock/safedock/internal/secops"
)

func rep(vulns ...secops.VulnerabilityDetail) *secops.TrivyReport {
	return &secops.TrivyReport{Vulnerabilities: vulns}
}

func crit(id string) secops.VulnerabilityDetail { return secops.VulnerabilityDetail{CVEID: id, Severity: "CRITICAL"} }
func high(id string) secops.VulnerabilityDetail { return secops.VulnerabilityDetail{CVEID: id, Severity: "HIGH"} }

// Cas clé : une CVE critique corrigée, une autre apparue → total identique, mais
// une NOUVELLE critique doit être détectée (angle mort de la détection par compte).
func TestNewVulnIDsDetectsSwapWithStableCount(t *testing.T) {
	prev := rep(crit("CVE-2020-1111"), high("CVE-2020-2222"))
	cur := rep(crit("CVE-2024-9999"), high("CVE-2020-2222")) // 1 critique remplacée

	newCrit, newHigh := newVulnIDs(prev, cur)
	if len(newCrit) != 1 || newCrit[0] != "CVE-2024-9999" {
		t.Errorf("nouvelle critique attendue CVE-2024-9999, obtenu %v", newCrit)
	}
	if len(newHigh) != 0 {
		t.Errorf("aucune nouvelle haute attendue, obtenu %v", newHigh)
	}
}

func TestNewVulnIDsNoChange(t *testing.T) {
	prev := rep(crit("CVE-1"), high("CVE-2"))
	cur := rep(high("CVE-2"), crit("CVE-1"))
	if nc, nh := newVulnIDs(prev, cur); len(nc) != 0 || len(nh) != 0 {
		t.Errorf("aucune nouvelle CVE attendue, obtenu crit=%v high=%v", nc, nh)
	}
}

func TestNewVulnIDsDeduplicates(t *testing.T) {
	prev := rep()
	cur := rep(crit("CVE-X"), crit("CVE-X"), high("CVE-Y"), high("CVE-Y"))
	nc, nh := newVulnIDs(prev, cur)
	if len(nc) != 1 || len(nh) != 1 {
		t.Errorf("dédoublonnage attendu (1 crit, 1 haute), obtenu crit=%v high=%v", nc, nh)
	}
}

func TestSummarizeNewCVEs(t *testing.T) {
	if s := summarizeNewCVEs(nil, nil); s != "" {
		t.Errorf("résumé vide attendu, obtenu %q", s)
	}
	s := summarizeNewCVEs([]string{"CVE-A", "CVE-B"}, []string{"CVE-C"})
	for _, want := range []string{"CVE-A", "CVE-B", "CVE-C", "critiques", "hautes"} {
		if !strings.Contains(s, want) {
			t.Errorf("résumé %q devrait contenir %q", s, want)
		}
	}
}

func TestJoinCappedTruncates(t *testing.T) {
	got := joinCapped([]string{"a", "b", "c", "d"}, 2)
	if got != "a, b (+2)" {
		t.Errorf("troncature attendue 'a, b (+2)', obtenu %q", got)
	}
}
