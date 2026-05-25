package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
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

// HandleConfig lit (GET) ou écrit (POST) la configuration dynamique en DB.
// GET /api/config
// POST /api/config
func (s *Server) HandleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleGetConfig(w, r)
	case http.MethodPost:
		s.handlePostConfig(w, r)
	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// handleGetConfig renvoie la configuration filtrée (sans mot de passe SMTP en clair).
func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	safeConfig := struct {
		SMTP struct {
			Host          string `json:"Host"`
			Port          int    `json:"Port"`
			To            string `json:"To"`
			From          string `json:"From"`
			TLSSkipVerify bool   `json:"TLSSkipVerify"`
			User          string `json:"User"`
			HasPassword   bool   `json:"HasPassword"`
		} `json:"SMTP"`
		SecOps struct {
			MaxSeverityAllowed string `json:"MaxSeverityAllowed"`
			AllowRoot          bool   `json:"AllowRoot"`
			AllowPrivileged    bool   `json:"AllowPrivileged"`
		} `json:"SecOps"`
	}{}

	safeConfig.SMTP.Host = s.cfg.SMTP.Host
	safeConfig.SMTP.Port = s.cfg.SMTP.Port
	safeConfig.SMTP.User = s.cfg.SMTP.User
	safeConfig.SMTP.From = s.cfg.SMTP.From
	safeConfig.SMTP.To = s.cfg.SMTP.To
	safeConfig.SMTP.TLSSkipVerify = s.cfg.SMTP.TLSSkipVerify
	safeConfig.SMTP.HasPassword = s.cfg.SMTP.Password != ""

	safeConfig.SecOps.MaxSeverityAllowed = s.cfg.SecOps.MaxSeverityAllowed
	safeConfig.SecOps.AllowRoot = s.cfg.SecOps.AllowRoot
	safeConfig.SecOps.AllowPrivileged = s.cfg.SecOps.AllowPrivileged

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(safeConfig)
}

// handlePostConfig enregistre à chaud les paramètres en base de données et recharge en mémoire.
func (s *Server) handlePostConfig(w http.ResponseWriter, r *http.Request) {
	type updateConfigReq struct {
		SMTPHost            string `json:"smtp_host"`
		SMTPPort            int    `json:"smtp_port"`
		SMTPUser            string `json:"smtp_user"`
		SMTPPassword        string `json:"smtp_password"`
		SMTPFrom            string `json:"smtp_from"`
		SMTPTo              string `json:"smtp_to"`
		SMTPTLSSkipVerify   bool   `json:"smtp_tls_skip_verify"`
		SecOpsMaxSeverity   string `json:"secops_max_severity_allowed"`
		SecOpsAllowRoot      bool   `json:"secops_allow_root"`
		SecOpsAllowPrivileged bool   `json:"secops_allow_privileged"`
	}

	var req updateConfigReq
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Format JSON invalide : %v", err), http.StatusBadRequest)
		return
	}

	// Validation du seuil CVE
	maxSev := strings.ToUpper(req.SecOpsMaxSeverity)
	if maxSev != "LOW" && maxSev != "MEDIUM" && maxSev != "HIGH" && maxSev != "CRITICAL" && maxSev != "NONE" {
		http.Error(w, "Seuil de sévérité de tolérance CVE invalide", http.StatusBadRequest)
		return
	}

	// Enregistrement en base de données
	err = db.SaveSettings(
		req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.SMTPFrom, req.SMTPTo, req.SMTPTLSSkipVerify,
		maxSev, req.SecOpsAllowRoot, req.SecOpsAllowPrivileged,
	)
	if err != nil {
		log.Printf("[API CONFIG ERROR] Échec enregistrement paramètres DB : %v\n", err)
		http.Error(w, fmt.Sprintf("Impossible de sauvegarder la configuration : %v", err), http.StatusInternalServerError)
		return
	}

	// Rechargement à chaud en mémoire de l'application
	s.cfg = config.ReloadConfig()
	log.Println("⚡ Configuration dynamique SafeDock rechargée à chaud avec succès depuis SQLite.")

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Configuration enregistrée et appliquée à chaud !"))
}

// HandleRegistries gère la liste (GET) et la création/mise à jour (POST) de registres privés.
func (s *Server) HandleRegistries(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := db.GetRegistries()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		
		// On masque les mots de passe par sécurité
		type safeReg struct {
			ID            int    `json:"id"`
			ServerAddress string `json:"server_address"`
			Username      string `json:"username"`
		}
		
		safeList := make([]safeReg, 0)
		for _, cred := range list {
			safeList = append(safeList, safeReg{
				ID:            cred.ID,
				ServerAddress: cred.ServerAddress,
				Username:      cred.Username,
			})
		}
		
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(safeList)

	case http.MethodPost:
		var req struct {
			Server   string `json:"server"`
			Username string `json:"username"`
			Password string `json:"password"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		
		if req.Server == "" || req.Username == "" {
			http.Error(w, "Adresse serveur et Nom d'utilisateur obligatoires", http.StatusBadRequest)
			return
		}
		
		err := db.SaveRegistry(req.Server, req.Username, req.Password)
		if err != nil {
			http.Error(w, fmt.Sprintf("Erreur sauvegarde registre : %v", err), http.StatusInternalServerError)
			return
		}
		
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Registre enregistré avec succès !"))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleRegistriesDelete supprime un registre privé par son identifiant unique.
// POST /api/registries/delete
func (s *Server) HandleRegistriesDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID int `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	err := db.DeleteRegistry(req.ID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Erreur de suppression : %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Accès registre supprimé."))
}

// HandleAuditLogs extrait l'historique de sécurité SecOps et de rollouts.
// GET /api/audit-logs
func (s *Server) HandleAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	list, err := db.GetAuditLogs()
	if err != nil {
		http.Error(w, fmt.Sprintf("Erreur lecture logs DB : %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

// HandleSingleContainerSubRoutes distribue les sous-routes dynamiques pour un conteneur donné.
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

// HandleContainersSettings gère la liste (GET) et la création/mise à jour (POST) de surcharges pour conteneur.
func (s *Server) HandleContainersSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := db.GetAllContainerSettings()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		var req struct {
			ContainerName      string `json:"container_name"`
			MaxSeverityAllowed string `json:"secops_max_severity_allowed"`
			AllowRoot          *bool  `json:"secops_allow_root"`
			AllowPrivileged    *bool  `json:"secops_allow_privileged"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		
		if req.ContainerName == "" {
			http.Error(w, "Nom de conteneur obligatoire", http.StatusBadRequest)
			return
		}
		
		err := db.SaveContainerSettings(req.ContainerName, req.MaxSeverityAllowed, req.AllowRoot, req.AllowPrivileged)
		if err != nil {
			http.Error(w, fmt.Sprintf("Erreur sauvegarde surcharge : %v", err), http.StatusInternalServerError)
			return
		}
		
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Surcharge de sécurité enregistrée avec succès !"))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleContainersSettingsDelete supprime une surcharge pour conteneur.
// POST /api/containers/settings/delete
func (s *Server) HandleContainersSettingsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ContainerName string `json:"container_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	if req.ContainerName == "" {
		http.Error(w, "Nom de conteneur obligatoire", http.StatusBadRequest)
		return
	}

	err := db.DeleteContainerSettings(req.ContainerName)
	if err != nil {
		http.Error(w, fmt.Sprintf("Erreur suppression surcharge : %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Surcharge supprimée."))
}
