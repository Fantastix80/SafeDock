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
	"html"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/backup"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/docker"
	"github.com/safedock/safedock/internal/notifier"
	"github.com/safedock/safedock/internal/secops"
)

const (
	defaultIntervalHours = 24
	initialDelay         = 3 * time.Minute // laisse le démarrage se stabiliser
	eagerScanInterval    = 5 * time.Minute // premier scan rapide des nouveaux conteneurs
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
		// Passage rapide : capte les conteneurs fraîchement démarrés et les scanne
		// sans attendre le prochain cycle complet.
		eager := time.NewTicker(eagerScanInterval)
		defer eager.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("🛰️  Supervision continue arrêtée proprement.")
				return
			case <-ticker.C:
				m.runCycle(ctx)
			case <-eager.C:
				m.scanNewContainers(ctx)
			}
		}
	}()
}

// collectContainers agrège les conteneurs en cours d'exécution de tous les hôtes activés.
func (m *Manager) collectContainers(ctx context.Context) []dockerContainer {
	hosts, err := db.GetEnabledHosts()
	if err != nil || len(hosts) == 0 {
		hosts = []db.DockerHost{{Name: "Hôte local", Endpoint: ""}}
	}
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
	return containers
}

// scanNewContainers effectue le PREMIER scan des conteneurs jamais scannés (cadence
// rapide), pour qu'un conteneur fraîchement démarré obtienne ses résultats sans
// attendre le prochain cycle complet de 24 h. Ne fait rien si tout est déjà scanné.
func (m *Manager) scanNewContainers(ctx context.Context) {
	cfg := config.ReloadConfig()
	scanner := scannerName(cfg.SecOps.SecopsScanner)
	scanned := 0
	for _, dc := range m.collectContainers(ctx) {
		c := dc.info
		if c.CurrentDigest == "" {
			continue
		}
		if _, _, _, e := db.GetLatestVulnScanByDigest(c.CurrentDigest); e == nil {
			continue // déjà un rapport en cache pour ce digest
		}
		ref := c.ImageName + ":" + c.ImageTag
		report, scanErr := runScan(ctx, scanner, ref)
		if scanErr != nil {
			continue // l'image n'est peut-être pas encore prête ; on réessaiera au prochain passage
		}
		if b, e := json.Marshal(report); e == nil {
			_ = db.SaveScanReport(c.CurrentDigest+"_"+scanner, scanner, c.Name, ref, string(b))
		}
		_ = db.AppendVulnHistory(c.Name, c.CurrentDigest, scanner,
			report.Summary.Critical, report.Summary.High, report.Summary.Medium, report.Summary.Low)
		scanned++
		log.Printf("🆕 [SCAN INITIAL] Premier scan de '%s' (%s) : %d critiques, %d élevées.\n",
			c.Name, ref, report.Summary.Critical, report.Summary.High)
	}
	if scanned > 0 {
		log.Printf("🆕 [SCAN INITIAL] %d nouveau(x) conteneur(s) scanné(s).\n", scanned)
	}
}

// runCycle re-scanne tous les conteneurs en cours (sur tous les hôtes) et détecte les dérives.
func (m *Manager) runCycle(ctx context.Context) {
	containers := m.collectContainers(ctx)

	// Configuration fraîche (le scanner ou le SMTP ont pu changer à chaud).
	cfg := config.ReloadConfig()
	scanner := scannerName(cfg.SecOps.SecopsScanner)

	log.Printf("🛰️  [RESCAN] Démarrage d'un cycle de supervision sur %d conteneur(s)...\n", len(containers))
	drifts := 0

	for _, dc := range containers {
		c := dc.info
		if c.CurrentDigest == "" {
			continue
		}
		ref := c.ImageName + ":" + c.ImageTag

		// Rapport précédent pour ce digest (référence de comparaison de dérive).
		prev := previousReport(c.CurrentDigest)

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

		// Point d'historique CVE (suivi de l'évolution dans la durée).
		_ = db.AppendVulnHistory(c.Name, c.CurrentDigest, scanner,
			report.Summary.Critical, report.Summary.High, report.Summary.Medium, report.Summary.Low)

		if prev == nil {
			continue // premier scan de ce digest : pas de référence de dérive
		}

		// Détection de dérive sur une image INCHANGÉE. Deux signaux complémentaires :
		//  1. le total de CVE critiques/hautes augmente ;
		//  2. de NOUVELLES CVE critiques/hautes apparaissent (par identifiant) — même
		//     si le total est stable (une CVE corrigée masquant une CVE nouvelle).
		prevCrit, prevHigh := prev.Summary.Critical, prev.Summary.High
		newCrit, newHigh := newVulnIDs(prev, report)
		countDrift := report.Summary.Critical > prevCrit || report.Summary.High > prevHigh

		if len(newCrit) > 0 || len(newHigh) > 0 || countDrift {
			drifts++
			detail := summarizeNewCVEs(newCrit, newHigh)
			log.Printf("🚨 [DÉRIVE] '%s' (%s) sur image inchangée — Critiques %d→%d, Hautes %d→%d. %s\n",
				c.Name, ref, prevCrit, report.Summary.Critical, prevHigh, report.Summary.High, detail)

			_ = db.WriteAuditLog(c.Name, c.ID, ref, "DRIFT",
				fmt.Sprintf("Dérive de vulnérabilités (image inchangée) : Critiques %d→%d, Hautes %d→%d. %s",
					prevCrit, report.Summary.Critical, prevHigh, report.Summary.High, detail),
				report.Summary.Critical, report.Summary.High, report.Summary.Medium)

			db.WriteNotification("CRITICAL", "Nouvelles vulnérabilités détectées",
				fmt.Sprintf("%s (%s) : Critiques %d→%d, Élevées %d→%d sur une image inchangée. %s",
					c.Name, ref, prevCrit, report.Summary.Critical, prevHigh, report.Summary.High, detail),
				c.Name, "")

			sendDriftAlert(cfg, c.Name, ref, prevCrit, report.Summary.Critical, prevHigh, report.Summary.High, newCrit, newHigh)
		}
	}

	log.Printf("🛰️  [RESCAN] Cycle terminé — %d dérive(s) détectée(s).\n", drifts)

	// Purge des données au-delà de la rétention configurée (par catégorie, héritage résolu).
	if n, err := db.PurgeWithConfig(); err == nil && n > 0 {
		log.Printf("🧹 [RÉTENTION] %d enregistrement(s) au-delà de la rétention supprimé(s).\n", n)
	}

	// Sauvegarde planifiée de la base (instantané cohérent + rotation).
	if bc := db.GetBackupConfig(); bc.Enabled {
		if info, err := backup.Create(time.Now()); err != nil {
			log.Printf("[BACKUP WARNING] Sauvegarde planifiée échouée : %v\n", err)
		} else {
			log.Printf("💾 [BACKUP] Sauvegarde créée : %s (%d octets).\n", info.Name, info.Size)
			if removed, perr := backup.Prune(bc.Keep); perr == nil && removed > 0 {
				log.Printf("🧹 [BACKUP] %d ancienne(s) sauvegarde(s) supprimée(s) (rotation à %d).\n", removed, bc.Keep)
			}
		}
	}
}

// previousReport lit le dernier rapport en cache pour un digest (référence de dérive).
// Renvoie nil s'il n'y a pas de scan antérieur (premier passage sur ce digest).
func previousReport(digest string) *secops.TrivyReport {
	reportJSON, _, _, err := db.GetLatestVulnScanByDigest(digest)
	if err != nil || reportJSON == "" {
		return nil
	}
	var rep secops.TrivyReport
	if json.Unmarshal([]byte(reportJSON), &rep) != nil {
		return nil
	}
	return &rep
}

// newVulnIDs renvoie les identifiants de CVE critiques/hautes présents dans le
// rapport courant mais absents du précédent — c.-à-d. les vulnérabilités
// nouvellement apparues sur une image inchangée. Le résultat est dédoublonné.
func newVulnIDs(prev, cur *secops.TrivyReport) (newCrit, newHigh []string) {
	prevSet := make(map[string]struct{}, len(prev.Vulnerabilities))
	for _, v := range prev.Vulnerabilities {
		prevSet[v.CVEID] = struct{}{}
	}
	seenCrit := make(map[string]struct{})
	seenHigh := make(map[string]struct{})
	for _, v := range cur.Vulnerabilities {
		if v.CVEID == "" {
			continue
		}
		if _, known := prevSet[v.CVEID]; known {
			continue
		}
		switch strings.ToUpper(v.Severity) {
		case "CRITICAL":
			if _, dup := seenCrit[v.CVEID]; !dup {
				seenCrit[v.CVEID] = struct{}{}
				newCrit = append(newCrit, v.CVEID)
			}
		case "HIGH":
			if _, dup := seenHigh[v.CVEID]; !dup {
				seenHigh[v.CVEID] = struct{}{}
				newHigh = append(newHigh, v.CVEID)
			}
		}
	}
	return newCrit, newHigh
}

// summarizeNewCVEs produit un libellé court listant les nouvelles CVE (au plus 5
// par sévérité) pour les journaux, notifications et e-mails.
func summarizeNewCVEs(newCrit, newHigh []string) string {
	if len(newCrit) == 0 && len(newHigh) == 0 {
		return ""
	}
	parts := make([]string, 0, 2)
	if len(newCrit) > 0 {
		parts = append(parts, "nouvelles critiques : "+joinCapped(newCrit, 5))
	}
	if len(newHigh) > 0 {
		parts = append(parts, "nouvelles hautes : "+joinCapped(newHigh, 5))
	}
	return strings.Join(parts, " ; ") + "."
}

// joinCapped joint au plus n éléments, en suffixant « (+k) » si la liste est tronquée.
func joinCapped(ids []string, n int) string {
	if len(ids) <= n {
		return strings.Join(ids, ", ")
	}
	return strings.Join(ids[:n], ", ") + fmt.Sprintf(" (+%d)", len(ids)-n)
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

func sendDriftAlert(cfg *config.Config, name, ref string, prevCrit, curCrit, prevHigh, curHigh int, newCritIDs, newHighIDs []string) {
	subject := fmt.Sprintf("🚨 Dérive de vulnérabilités détectée sur %s", name)
	// Échappement HTML : le nom de conteneur et la référence d'image sont
	// influençables par l'opérateur de l'hôte distant.
	name = html.EscapeString(name)
	ref = html.EscapeString(ref)

	newBlock := ""
	if len(newCritIDs) > 0 || len(newHighIDs) > 0 {
		newBlock = "<p><strong>CVE nouvellement apparues</strong> (image inchangée) :</p><ul>"
		if len(newCritIDs) > 0 {
			newBlock += fmt.Sprintf("<li>Critiques : <code>%s</code></li>", joinCapped(newCritIDs, 10))
		}
		if len(newHighIDs) > 0 {
			newBlock += fmt.Sprintf("<li>Hautes : <code>%s</code></li>", joinCapped(newHighIDs, 10))
		}
		newBlock += "</ul>"
	}

	content := fmt.Sprintf(`
		<p>SafeDock a détecté de <strong>nouvelles vulnérabilités</strong> sur une image qui n'a pourtant pas changé.</p>
		<p>Cela signifie que des CVE récemment publiées affectent désormais ce conteneur.</p>
		<ul>
			<li>Conteneur : <strong>%s</strong></li>
			<li>Image : <code>%s</code></li>
			<li>Vulnérabilités critiques : <strong style="color:#e03e2f;">%d → %d</strong></li>
			<li>Vulnérabilités hautes : <strong>%d → %d</strong></li>
		</ul>
		%s
		<p>Vérifiez s'il existe une image corrigée et envisagez une mise à jour.</p>
	`, name, ref, prevCrit, curCrit, prevHigh, curHigh, newBlock)
	// Destinataires : gérés en phase 2 (abonnements aux alertes par utilisateur,
	// filtrés par portée RBAC). En attendant, aucun envoi global — la notification
	// in-app (WriteNotification) et l'audit restent en place.
	_ = notifier.SendEmail(&cfg.SMTP, recipientsForContainer(name), subject, notifier.BuildHTMLReport(subject, content, false))
}

// recipientsForContainer renvoie la liste des destinataires e-mail pour une alerte
// concernant un conteneur. Réservé à la phase « abonnements par utilisateur » :
// pour l'instant aucun destinataire (les alertes e-mail globales sont désactivées,
// seules les notifications in-app sont émises).
func recipientsForContainer(containerName string) []string {
	return nil
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
