// Package scheduler assure la supervision continue de sécurité de SafeDock :
// il re-scanne périodiquement les images des conteneurs en cours d'exécution,
// rafraîchit le cache de rapports (SQLite) pour garder le tableau de bord à jour,
// et détecte la « dérive de vulnérabilités » — l'apparition de nouvelles CVE sur
// une image pourtant inchangée, due à la mise à jour des bases CVE.
//
// C'est le différenciateur « sécurité » de SafeDock : passer d'un scan réactif
// (à la demande) à une surveillance proactive du risque dans le temps.
package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/docker"
	"github.com/safedock/safedock/internal/notifier"
	"github.com/safedock/safedock/internal/secops"
)

const (
	defaultIntervalHours = 24
	initialDelay         = 3 * time.Minute // laisse le démarrage se stabiliser
)

// Manager orchestre les re-scans périodiques.
type Manager struct {
	interval time.Duration
}

// dockerContainer associe un conteneur audité à l'hôte dont il provient.
type dockerContainer struct {
	info     docker.ContainerAuditInfo
	hostName string
}

// New crée le planificateur. Intervalle surchargeable via SAFEDOCK_RESCAN_INTERVAL_HOURS.
func New() *Manager {
	return &Manager{interval: resolveInterval()}
}

// Start lance la boucle de re-scan en arrière-plan jusqu'à annulation du contexte.
func (m *Manager) Start(ctx context.Context) {
	go func() {
		log.Printf("🛰️  Supervision continue activée (premier re-scan dans %s, puis toutes les %s)\n", initialDelay, m.interval)

		select {
		case <-ctx.Done():
			return
		case <-time.After(initialDelay):
		}

		m.runCycle(ctx)

		ticker := time.NewTicker(m.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("🛰️  Supervision continue arrêtée proprement.")
				return
			case <-ticker.C:
				m.runCycle(ctx)
			}
		}
	}()
}

// runCycle re-scanne tous les conteneurs en cours (sur tous les hôtes) et détecte les dérives.
func (m *Manager) runCycle(ctx context.Context) {
	hosts, err := db.GetEnabledHosts()
	if err != nil || len(hosts) == 0 {
		hosts = []db.DockerHost{{Name: "Hôte local", Endpoint: ""}}
	}

	// Agrégation des conteneurs de tous les hôtes activés.
	var containers []dockerContainer
	for _, h := range hosts {
		auditor, aerr := docker.NewDockerAuditorFor(h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey)
		if aerr != nil {
			log.Printf("[RESCAN WARNING] Connexion à l'hôte '%s' impossible : %v\n", h.Name, aerr)
			continue
		}
		list, cerr := auditor.AuditContainers(ctx)
		auditor.Close()
		if cerr != nil {
			log.Printf("[RESCAN WARNING] Audit de l'hôte '%s' échoué : %v\n", h.Name, cerr)
			continue
		}
		for _, c := range list {
			containers = append(containers, dockerContainer{info: c, hostName: h.Name})
		}
	}

	// Configuration fraîche (le scanner ou le SMTP ont pu changer à chaud).
	cfg := config.ReloadConfig()
	scanner := scannerName(cfg.SecOps.SecopsScanner)

	log.Printf("🛰️  [RESCAN] Démarrage d'un cycle de supervision sur %d conteneur(s) / %d hôte(s)...\n", len(containers), len(hosts))
	drifts := 0

	for _, dc := range containers {
		c := dc.info
		if c.CurrentDigest == "" {
			continue
		}
		ref := c.ImageName + ":" + c.ImageTag

		// Rapport précédent pour ce digest (référence de comparaison de dérive).
		prevCrit, prevHigh, hadPrev := previousCounts(c.CurrentDigest)

		// Re-scan (l'image d'un conteneur actif est déjà locale → aucun pull, aucun coût disque).
		report, scanErr := runScan(ctx, scanner, ref)
		if scanErr != nil {
			log.Printf("[RESCAN WARNING] Scan de '%s' échoué : %v\n", ref, scanErr)
			continue
		}

		// Rafraîchissement du cache (le tableau de bord reflètera ces chiffres).
		cacheKey := c.CurrentDigest + "_" + scanner
		if b, e := json.Marshal(report); e == nil {
			_ = db.SaveScanReport(cacheKey, scanner, c.Name, ref, string(b))
		}

		// Détection de dérive : même image, davantage de CVE qu'au scan précédent.
		if hadPrev && (report.Summary.Critical > prevCrit || report.Summary.High > prevHigh) {
			drifts++
			log.Printf("🚨 [DÉRIVE] '%s' (%s) : nouvelles vulnérabilités sur une image inchangée — "+
				"Critiques %d→%d, Hautes %d→%d\n", c.Name, ref, prevCrit, report.Summary.Critical, prevHigh, report.Summary.High)

			_ = db.WriteAuditLog(c.Name, c.ID, ref, "DRIFT",
				fmt.Sprintf("Dérive de vulnérabilités détectée (image inchangée) : Critiques %d→%d, Hautes %d→%d",
					prevCrit, report.Summary.Critical, prevHigh, report.Summary.High),
				report.Summary.Critical, report.Summary.High, report.Summary.Medium)

			sendDriftAlert(cfg, c.Name, ref, prevCrit, report.Summary.Critical, prevHigh, report.Summary.High)
		}
	}

	log.Printf("🛰️  [RESCAN] Cycle terminé — %d dérive(s) détectée(s).\n", drifts)
}

// previousCounts lit les compteurs CVE du dernier scan en cache pour un digest.
func previousCounts(digest string) (crit, high int, ok bool) {
	reportJSON, _, _, err := db.GetLatestVulnScanByDigest(digest)
	if err != nil || reportJSON == "" {
		return 0, 0, false
	}
	var rep secops.TrivyReport
	if json.Unmarshal([]byte(reportJSON), &rep) != nil {
		return 0, 0, false
	}
	return rep.Summary.Critical, rep.Summary.High, true
}

func runScan(ctx context.Context, scanner, ref string) (*secops.TrivyReport, error) {
	switch scanner {
	case "grype":
		return secops.ScanImageGrype(ctx, ref)
	case "hybrid":
		return secops.ScanImageHybrid(ctx, ref)
	default:
		return secops.ScanImage(ctx, ref)
	}
}

func sendDriftAlert(cfg *config.Config, name, ref string, prevCrit, newCrit, prevHigh, newHigh int) {
	subject := fmt.Sprintf("🚨 Dérive de vulnérabilités détectée sur %s", name)
	content := fmt.Sprintf(`
		<p>SafeDock a détecté de <strong>nouvelles vulnérabilités</strong> sur une image qui n'a pourtant pas changé.</p>
		<p>Cela signifie que des CVE récemment publiées affectent désormais ce conteneur.</p>
		<ul>
			<li>Conteneur : <strong>%s</strong></li>
			<li>Image : <code>%s</code></li>
			<li>Vulnérabilités critiques : <strong style="color:#e03e2f;">%d → %d</strong></li>
			<li>Vulnérabilités hautes : <strong>%d → %d</strong></li>
		</ul>
		<p>Vérifiez s'il existe une image corrigée et envisagez une mise à jour.</p>
	`, name, ref, prevCrit, newCrit, prevHigh, newHigh)
	_ = notifier.SendEmail(&cfg.SMTP, subject, notifier.BuildHTMLReport(subject, content, false))
}

func scannerName(s string) string {
	switch s {
	case "grype", "hybrid", "trivy":
		return s
	default:
		return "trivy"
	}
}

func resolveInterval() time.Duration {
	if raw := os.Getenv("SAFEDOCK_RESCAN_INTERVAL_HOURS"); raw != "" {
		if h, err := strconv.Atoi(raw); err == nil && h > 0 {
			return time.Duration(h) * time.Hour
		}
		log.Printf("[RESCAN WARNING] SAFEDOCK_RESCAN_INTERVAL_HOURS invalide (%q), défaut %dh\n", raw, defaultIntervalHours)
	}
	return defaultIntervalHours * time.Hour
}
