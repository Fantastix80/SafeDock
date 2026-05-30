// Package cleanup gère le nettoyage automatique des images Docker accumulées
// lors des scans SecOps (trivy, grype, dockle tirent les images pour les analyser
// et ne les suppriment pas ensuite).
package cleanup

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
)

const (
	defaultIntervalHours = 6
	initialDelay         = 2 * time.Minute // Laisse les scans de démarrage se terminer
)

// Manager gère le cycle de vie du nettoyage Docker.
type Manager struct {
	cli      *client.Client
	interval time.Duration
}

// New crée un Manager prêt à l'emploi.
// L'intervalle peut être surchargé via la variable d'environnement
// SAFEDOCK_CLEANUP_INTERVAL_HOURS (entier, défaut : 6).
func New() (*Manager, error) {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("impossible de créer le client Docker pour le nettoyage : %w", err)
	}

	interval := resolveInterval()

	return &Manager{
		cli:      cli,
		interval: interval,
	}, nil
}

// Close libère les ressources du client Docker.
func (m *Manager) Close() error {
	return m.cli.Close()
}

// RunOnce exécute un cycle complet de nettoyage (dangling + inutilisées) et
// retourne l'espace récupéré en octets.
func (m *Manager) RunOnce(ctx context.Context) (uint64, error) {
	// 1. Images "dangling" (sans tag, non référencées) — toujours sûr.
	danglingArgs := filters.NewArgs(filters.Arg("dangling", "true"))
	rDangling, err := m.cli.ImagesPrune(ctx, danglingArgs)
	if err != nil {
		return 0, fmt.Errorf("nettoyage dangling échoué : %w", err)
	}

	// 2. Toutes les images non référencées par un conteneur (running ou stopped).
	// Équivalent à `docker image prune -a`.
	// Docker refuse de supprimer les images effectivement utilisées,
	// donc l'appel est sans risque même si un scan est en cours.
	unusedArgs := filters.NewArgs(filters.Arg("dangling", "false"))
	rUnused, err := m.cli.ImagesPrune(ctx, unusedArgs)
	if err != nil {
		// Non fatal : on retourne ce qu'on a déjà récupéré.
		log.Printf("[CLEANUP WARNING] Nettoyage images inutilisées échoué : %v\n", err)
		return rDangling.SpaceReclaimed, nil
	}

	return rDangling.SpaceReclaimed + rUnused.SpaceReclaimed, nil
}

// StartPeriodicCleanup démarre une goroutine de nettoyage automatique.
// Elle s'arrête dès que ctx est annulé (graceful shutdown).
func (m *Manager) StartPeriodicCleanup(ctx context.Context) {
	go func() {
		log.Printf(
			"🧹 Nettoyage automatique Docker activé (premier passage dans %s, puis toutes les %s)\n",
			initialDelay, m.interval,
		)

		// Délai initial pour laisser les scans de démarrage se terminer.
		select {
		case <-ctx.Done():
			return
		case <-time.After(initialDelay):
		}

		m.runAndLog(ctx)

		ticker := time.NewTicker(m.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("🧹 Nettoyage automatique Docker arrêté proprement.")
				return
			case <-ticker.C:
				m.runAndLog(ctx)
			}
		}
	}()
}

// runAndLog exécute RunOnce et journalise le résultat.
func (m *Manager) runAndLog(ctx context.Context) {
	reclaimed, err := m.RunOnce(ctx)
	if err != nil {
		log.Printf("[CLEANUP ERROR] Échec du cycle de nettoyage : %v\n", err)
		return
	}
	if reclaimed > 0 {
		log.Printf("🧹 Nettoyage Docker : %.1f Mo récupérés sur le disque.\n",
			float64(reclaimed)/1024/1024)
	} else {
		log.Println("🧹 Nettoyage Docker : aucune image inutilisée à supprimer.")
	}
}

// resolveInterval lit SAFEDOCK_CLEANUP_INTERVAL_HOURS et retourne la durée correspondante.
func resolveInterval() time.Duration {
	raw := os.Getenv("SAFEDOCK_CLEANUP_INTERVAL_HOURS")
	if raw != "" {
		if h, err := strconv.Atoi(raw); err == nil && h > 0 {
			return time.Duration(h) * time.Hour
		}
		log.Printf("[CLEANUP WARNING] Valeur SAFEDOCK_CLEANUP_INTERVAL_HOURS invalide (%q), utilisation du défaut %dh\n",
			raw, defaultIntervalHours)
	}
	return defaultIntervalHours * time.Hour
}
