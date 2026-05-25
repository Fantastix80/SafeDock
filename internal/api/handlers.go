package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/safedock/safedock/internal/deployer"
	"github.com/safedock/safedock/internal/docker"
	"github.com/safedock/safedock/internal/secops"
)

// Système de cache en mémoire pour éviter de relancer les scans CLI lourds de Trivy et Dockle à chaque clic
var (
	trivyCache    = make(map[string]*secops.TrivyReport)
	trivyCacheMu  sync.RWMutex
	dockleCache   = make(map[string]*secops.DockleReport)
	dockleCacheMu sync.RWMutex
)

// HandleContainers liste et inspecte tous les conteneurs pour retourner le JSON.
// GET /api/containers
func (s *Server) HandleContainers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	auditor, err := docker.NewDockerAuditor()
	if err != nil {
		log.Printf("[API ERROR] Connexion Docker échouée : %v\n", err)
		http.Error(w, fmt.Sprintf("Impossible de se connecter au démon Docker : %v", err), http.StatusInternalServerError)
		return
	}
	defer auditor.Close()

	containers, err := auditor.AuditContainers(r.Context())
	if err != nil {
		log.Printf("[API ERROR] Échec de l'audit de sécurité : %v\n", err)
		http.Error(w, fmt.Sprintf("Erreur lors de l'audit SecOps : %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(containers)
}

// HandleConfig retourne les variables SecOps et de SMTP (secrets masqués).
// GET /api/config
func (s *Server) HandleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	// On masque le mot de passe SMTP par sécurité
	safeConfig := struct {
		SMTP struct {
			Host string `json:"Host"`
			Port int    `json:"Port"`
			To   string `json:"To"`
		} `json:"SMTP"`
		SecOps struct {
			MaxSeverityAllowed string `json:"MaxSeverityAllowed"`
			AllowRoot          bool   `json:"AllowRoot"`
			AllowPrivileged    bool   `json:"AllowPrivileged"`
		} `json:"SecOps"`
	}{}

	safeConfig.SMTP.Host = s.cfg.SMTP.Host
	safeConfig.SMTP.Port = s.cfg.SMTP.Port
	safeConfig.SMTP.To = s.cfg.SMTP.To
	safeConfig.SecOps.MaxSeverityAllowed = s.cfg.SecOps.MaxSeverityAllowed
	safeConfig.SecOps.AllowRoot = s.cfg.SecOps.AllowRoot
	safeConfig.SecOps.AllowPrivileged = s.cfg.SecOps.AllowPrivileged

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(safeConfig)
}

// HandleSingleContainerSubRoutes distribue les sous-routes dynamiques pour un conteneur donné.
// Routes gérées :
// GET  /api/containers/{id}/trivy
// GET  /api/containers/{id}/dockle
// POST /api/containers/{id}/update
func (s *Server) HandleSingleContainerSubRoutes(w http.ResponseWriter, r *http.Request) {
	suffix := strings.TrimPrefix(r.URL.Path, "/api/containers/")
	parts := strings.Split(suffix, "/")

	if len(parts) < 2 {
		http.Error(w, "ID de conteneur ou action manquante", http.StatusBadRequest)
		return
	}

	containerID := parts[0]
	action := parts[1]

	switch action {
	case "trivy":
		if r.Method != http.MethodGet {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}
		s.getTrivyReport(w, r, containerID)

	case "dockle":
		if r.Method != http.MethodGet {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}
		s.getDockleReport(w, r, containerID)

	case "update":
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}
		s.triggerRolloutUpdate(w, r, containerID)

	default:
		http.Error(w, "Action inconnue ou non implémentée", http.StatusNotFound)
	}
}

// getTrivyReport gère le scan de sécurité ou le retour depuis le cache pour Trivy.
func (s *Server) getTrivyReport(w http.ResponseWriter, r *http.Request, containerID string) {
	auditor, err := docker.NewDockerAuditor()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer auditor.Close()

	c, err := auditor.AuditSingleContainer(r.Context(), containerID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Conteneur introuvable : %v", err), http.StatusNotFound)
		return
	}

	// On cherche d'abord dans le cache par Digest ou image ID
	trivyCacheMu.RLock()
	cachedReport, exists := trivyCache[c.CurrentDigest]
	trivyCacheMu.RUnlock()

	if exists {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cachedReport)
		return
	}

	// Sinon, on lance le scan
	log.Printf("🔍 [TRIVY SCAN] Lancement du scan de vulnérabilités pour l'image '%s'...\n", c.ImageName)
	report, err := secops.ScanImage(r.Context(), c.ImageName+":"+c.ImageTag)
	if err != nil {
		log.Printf("❌ [TRIVY ERROR] Échec du scan : %v\n", err)
		http.Error(w, fmt.Sprintf("Échec du scan Trivy : %v", err), http.StatusInternalServerError)
		return
	}

	// Sauvegarde en cache
	trivyCacheMu.Lock()
	trivyCache[c.CurrentDigest] = report
	trivyCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

// getDockleReport gère le scan de structure ou le retour depuis le cache pour Dockle.
func (s *Server) getDockleReport(w http.ResponseWriter, r *http.Request, containerID string) {
	auditor, err := docker.NewDockerAuditor()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer auditor.Close()

	c, err := auditor.AuditSingleContainer(r.Context(), containerID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Conteneur introuvable : %v", err), http.StatusNotFound)
		return
	}

	// On cherche dans le cache
	dockleCacheMu.RLock()
	cachedReport, exists := dockleCache[c.CurrentDigest]
	dockleCacheMu.RUnlock()

	if exists {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cachedReport)
		return
	}

	// Sinon, on lance le scan
	log.Printf("🔍 [DOCKLE LINTER] Lancement du scan de conformité pour l'image '%s'...\n", c.ImageName)
	report, err := secops.ScanCompliance(r.Context(), c.ImageName+":"+c.ImageTag)
	if err != nil {
		log.Printf("❌ [DOCKLE ERROR] Échec du linter : %v\n", err)
		http.Error(w, fmt.Sprintf("Échec du scan de conformité Dockle : %v", err), http.StatusInternalServerError)
		return
	}

	// Sauvegarde en cache
	dockleCacheMu.Lock()
	dockleCache[c.CurrentDigest] = report
	dockleCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

// triggerRolloutUpdate déclenche la vérification et le déploiement transactionnel sécurisé.
func (s *Server) triggerRolloutUpdate(w http.ResponseWriter, r *http.Request, containerID string) {
	orchestrator, err := deployer.NewLifecycleOrchestrator(s.cfg)
	if err != nil {
		http.Error(w, fmt.Sprintf("Impossible d'initialiser l'orchestrateur : %v", err), http.StatusInternalServerError)
		return
	}
	defer orchestrator.Close()

	log.Printf("🔄 [API LIFECYCLE] Déclenchement de la mise à jour pour le conteneur '%s'...\n", containerID[:12])
	err = orchestrator.CheckAndUpdateContainer(r.Context(), containerID)
	if err != nil {
		log.Printf("❌ [API LIFECYCLE ERROR] Échec de la mise à jour : %v\n", err)
		w.WriteHeader(http.StatusConflict) // 409 Conflict pour marquer le rejet SecOps ou d'exécution
		_, _ = w.Write([]byte(err.Error()))
		return
	}

	// En cas de succès de rollout, nous invalidons le cache de ce conteneur spécifique
	// car le Digest de l'image a changé.
	trivyCacheMu.Lock()
	delete(trivyCache, containerID)
	trivyCacheMu.Unlock()

	dockleCacheMu.Lock()
	delete(dockleCache, containerID)
	dockleCacheMu.Unlock()

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Mise à jour et pivotement de cycle de vie effectués avec succès !"))
}
