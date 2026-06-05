package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/deployer"
	"github.com/safedock/safedock/internal/docker"
	"github.com/safedock/safedock/internal/registry"
	"github.com/safedock/safedock/internal/secops"
)

// Validation stricte des entrées d'audit pour empêcher toute injection d'argument
// vers les binaires trivy/grype (ex: un nom commençant par '-', des métacaractères, etc.).
var (
	imageNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._/-]{0,199}$`)
	imageTagRe  = regexp.MustCompile(`^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$`)
)

// Système de cache en mémoire pour éviter de relancer les scans CLI lourds de Trivy et Dockle à chaque clic
var (
	trivyCache    = make(map[string]*secops.TrivyReport)
	trivyCacheMu  sync.RWMutex
	dockleCache   = make(map[string]*secops.DockleReport)
	dockleCacheMu sync.RWMutex
)

// resolveHost détermine l'hôte Docker ciblé par une requête via le paramètre ?host=<id>.
// En l'absence de paramètre ou en cas d'erreur, on retombe sur l'hôte local (endpoint vide).
func resolveHost(r *http.Request) db.DockerHost {
	idStr := r.URL.Query().Get("host")
	if idStr == "" {
		return db.DockerHost{Endpoint: ""}
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return db.DockerHost{Endpoint: ""}
	}
	h, err := db.GetHost(id)
	if err != nil {
		return db.DockerHost{Endpoint: ""}
	}
	return h
}

// HandleContainers liste et inspecte tous les conteneurs pour retourner le JSON.
// GET /api/containers
func (s *Server) HandleContainers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	// Agrégation multi-hôte : on interroge chaque hôte Docker activé et on attribue
	// à chaque conteneur son hôte réel (host_id / host_name).
	hosts, err := db.GetEnabledHosts()
	if err != nil || len(hosts) == 0 {
		// Repli sur l'hôte local si le registre est indisponible.
		hosts = []db.DockerHost{{ID: 0, Name: "Hôte local", Endpoint: ""}}
	}

	var containers []docker.ContainerAuditInfo
	for _, h := range hosts {
		auditor, aerr := docker.NewDockerAuditorFor(h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey)
		if aerr != nil {
			log.Printf("[API WARNING] Connexion à l'hôte '%s' échouée : %v\n", h.Name, aerr)
			continue
		}
		hostContainers, cerr := auditor.AuditContainers(r.Context())
		auditor.Close()
		if cerr != nil {
			log.Printf("[API WARNING] Audit de l'hôte '%s' échoué : %v\n", h.Name, cerr)
			continue
		}
		for i := range hostContainers {
			hostContainers[i].HostID = h.ID
			hostContainers[i].HostName = h.Name
		}
		containers = append(containers, hostContainers...)
	}

	// Contexte d'autorisation : portée de l'utilisateur courant + tables de tags.
	user, _ := currentUser(r)
	assignments, _ := db.ListContainerTagAssignments()
	tags, _ := db.ListTags()
	tagName := make(map[int]string, len(tags))
	for _, t := range tags {
		tagName[t.ID] = t.Name
	}
	// Index : (hostID, containerName) → ensemble de tag IDs.
	ctagIndex := make(map[string]map[int]bool)
	for _, a := range assignments {
		key := fmt.Sprintf("%d|%s", a.HostID, a.ContainerName)
		if ctagIndex[key] == nil {
			ctagIndex[key] = make(map[int]bool)
		}
		ctagIndex[key][a.TagID] = true
	}

	// Enrichissement (CVE réelles + tags réels) et filtrage par portée RBAC.
	enriched := make([]containerWithCVE, 0, len(containers))
	for _, c := range containers {
		ctags := ctagIndex[fmt.Sprintf("%d|%s", c.HostID, c.Name)]
		if !canSeeContainer(user, c.HostID, ctags) {
			continue // hors périmètre de l'utilisateur
		}

		item := containerWithCVE{ContainerAuditInfo: c}
		for id := range ctags {
			if n := tagName[id]; n != "" {
				item.Tags = append(item.Tags, n)
			}
		}
		if reportJSON, scanner, scannedAt, qErr := db.GetLatestVulnScanByDigest(c.CurrentDigest); qErr == nil {
			var rep secops.TrivyReport
			if json.Unmarshal([]byte(reportJSON), &rep) == nil {
				item.Scanned = true
				item.CVECritical = rep.Summary.Critical
				item.CVEHigh = rep.Summary.High
				item.CVEMedium = rep.Summary.Medium
				item.CVELow = rep.Summary.Low
				item.ScannerUsed = scanner
				item.ScannedAt = scannedAt.Format("2006-01-02T15:04:05Z07:00")
			}
		}
		enriched = append(enriched, item)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(enriched)
}

// containerWithCVE enrichit les métadonnées de conteneur avec les compteurs CVE réels
// issus du dernier scan en cache. Les champs sont aplatis dans le JSON via l'embedding.
type containerWithCVE struct {
	docker.ContainerAuditInfo
	Scanned     bool     `json:"scanned"`
	CVECritical int      `json:"cve_critical"`
	CVEHigh     int      `json:"cve_high"`
	CVEMedium   int      `json:"cve_medium"`
	CVELow      int      `json:"cve_low"`
	ScannerUsed string   `json:"scanner_used,omitempty"`
	ScannedAt   string   `json:"scanned_at,omitempty"`
	Tags        []string `json:"tags"`
}

// ensureScope vérifie que l'utilisateur courant peut agir sur un conteneur (hôte+nom).
// Retourne false et écrit 403 sinon. Admin/scope_all passent toujours.
func (s *Server) ensureScope(w http.ResponseWriter, r *http.Request, hostID int, containerName string) bool {
	user, ok := currentUser(r)
	if !ok {
		http.Error(w, "Authentification requise", http.StatusUnauthorized)
		return false
	}
	if user.Role == db.RoleAdmin || user.ScopeAll {
		return true
	}
	ctags, _ := db.TagIDsForContainer(hostID, containerName)
	if !canSeeContainer(user, hostID, ctags) {
		http.Error(w, "Conteneur hors de votre périmètre", http.StatusForbidden)
		return false
	}
	return true
}

// HandleContainerHistory renvoie l'historique des vulnérabilités d'un conteneur
// (un point par scan), pour tracer l'évolution dans la durée. Filtré par portée RBAC.
// GET /api/containers/history?name=<nom>&host=<id>
func (s *Server) HandleContainerHistory(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		http.Error(w, "paramètre 'name' requis", http.StatusBadRequest)
		return
	}
	hostID, _ := strconv.Atoi(r.URL.Query().Get("host"))
	if !s.ensureScope(w, r, hostID, name) {
		return
	}
	points, err := db.GetVulnHistory(name, 365)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(points)
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
			SecopsScanner      string `json:"SecopsScanner"`
		} `json:"SecOps"`
		RetentionDays int                 `json:"RetentionDays"`
		Retention     db.RetentionConfig  `json:"Retention"`
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
	safeConfig.SecOps.SecopsScanner = s.cfg.SecOps.SecopsScanner
	safeConfig.Retention = db.GetRetentionConfig()
	safeConfig.RetentionDays = safeConfig.Retention.Default // rétrocompat

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(safeConfig)
}

// handlePostConfig enregistre à chaud les paramètres en base de données et recharge en mémoire.
func (s *Server) handlePostConfig(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
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
		SecopsScanner       string `json:"secops_scanner"`
		RetentionDays       int    `json:"retention_days"`
		Retention           *struct {
			Default       int `json:"default"`
			CVE           int `json:"cve"`
			Notifications int `json:"notifications"`
			SecurityAudit int `json:"security_audit"`
			AuditLogs     int `json:"audit_logs"`
		} `json:"retention"`
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

	// Validation du scanner
	scanner := strings.ToLower(req.SecopsScanner)
	if scanner != "trivy" && scanner != "grype" && scanner != "hybrid" {
		scanner = "trivy"
	}

	// Enregistrement en base de données
	err = db.SaveSettings(
		req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.SMTPFrom, req.SMTPTo, req.SMTPTLSSkipVerify,
		maxSev, req.SecOpsAllowRoot, req.SecOpsAllowPrivileged, scanner,
	)
	if err != nil {
		log.Printf("[API CONFIG ERROR] Échec enregistrement paramètres DB : %v\n", err)
		http.Error(w, fmt.Sprintf("Impossible de sauvegarder la configuration : %v", err), http.StatusInternalServerError)
		return
	}

	// Rétention des données. Défaut : 0/30/90/180/365 jours (0 = illimité).
	// Par catégorie : idem + -1 = hériter du défaut.
	validDefault := map[int]bool{0: true, 30: true, 90: true, 180: true, 365: true}
	validCat := map[int]bool{-1: true, 0: true, 30: true, 90: true, 180: true, 365: true}
	if req.Retention != nil {
		rc := db.RetentionConfig{
			Default:       req.Retention.Default,
			CVE:           req.Retention.CVE,
			Notifications: req.Retention.Notifications,
			SecurityAudit: req.Retention.SecurityAudit,
			AuditLogs:     req.Retention.AuditLogs,
		}
		if !validDefault[rc.Default] || !validCat[rc.CVE] || !validCat[rc.Notifications] ||
			!validCat[rc.SecurityAudit] || !validCat[rc.AuditLogs] {
			http.Error(w, "Valeur de rétention invalide", http.StatusBadRequest)
			return
		}
		if err := db.SetRetentionConfig(rc); err != nil {
			http.Error(w, fmt.Sprintf("Impossible d'enregistrer la rétention : %v", err), http.StatusInternalServerError)
			return
		}
	} else if validDefault[req.RetentionDays] {
		_ = db.SetRetentionDays(req.RetentionDays)
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
		if !auth.RequireRole(w, r, db.RoleAdmin) {
			return
		}
		var req struct {
			ServerAddress string `json:"server_address"`
			Username      string `json:"username"`
			Password      string `json:"password"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		
		if req.ServerAddress == "" || req.Username == "" {
			http.Error(w, "Adresse serveur et Nom d'utilisateur obligatoires", http.StatusBadRequest)
			return
		}
		
		err := db.SaveRegistry(req.ServerAddress, req.Username, req.Password)
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
	if !auth.RequireRole(w, r, db.RoleAdmin) {
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
	// Historique de déploiement de tout le parc : réservé aux auditeurs et admins
	// (un lecteur restreint ne doit pas voir l'activité hors de son périmètre).
	if !auth.RequireRole(w, r, db.RoleAuditor) {
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

// getTrivyReport gère le scan de vulnérabilités ou le retour depuis le cache.
// Stratégie de cache à 3 niveaux :
//  1. Mémoire        — réponse instantanée, perdue au redémarrage
//  2. SQLite         — persistant entre redémarrages, chargé en mémoire au hit
//  3. Scan réel      — lancé uniquement si aucun cache disponible, puis sauvegardé aux deux niveaux
func (s *Server) getTrivyReport(w http.ResponseWriter, r *http.Request, containerID string) {
	h := resolveHost(r)
	auditor, err := docker.NewDockerAuditorFor(h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey)
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
	if !s.ensureScope(w, r, h.ID, c.Name) {
		return
	}

	// Détection du type de scanner (paramètre URL > surcharge conteneur > config globale)
	scannerType := strings.ToLower(r.URL.Query().Get("scanner"))
	if scannerType == "" {
		_, _, _, containerScanner, errO := db.GetContainerSettings(c.Name)
		if errO == nil && containerScanner != "" {
			scannerType = strings.ToLower(containerScanner)
		}
	}
	if scannerType == "" {
		scannerType = strings.ToLower(s.cfg.SecOps.SecopsScanner)
	}
	if scannerType == "" {
		scannerType = "trivy"
	}

	cacheKey := c.CurrentDigest + "_" + scannerType

	// Niveau 1 : cache mémoire (le plus rapide)
	trivyCacheMu.RLock()
	cachedReport, exists := trivyCache[cacheKey]
	trivyCacheMu.RUnlock()
	if exists {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cachedReport)
		return
	}

	// Niveau 2 : cache SQLite (survit aux redémarrages du conteneur SafeDock)
	if reportJSON, _, dbErr := db.GetScanReport(cacheKey); dbErr == nil {
		var report secops.TrivyReport
		if jsonErr := json.Unmarshal([]byte(reportJSON), &report); jsonErr == nil {
			log.Printf("📦 [%s CACHE] Rapport chargé depuis SQLite pour '%s'\n", strings.ToUpper(scannerType), c.Name)
			trivyCacheMu.Lock()
			trivyCache[cacheKey] = &report
			trivyCacheMu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&report)
			return
		}
	}

	// Niveau 3 : scan réel (lent — trivy/grype/hybrid CLI)
	var report *secops.TrivyReport
	var errScan error

	switch scannerType {
	case "grype":
		log.Printf("🔍 [GRYPE SCAN] Lancement du scan pour l'image '%s'...\n", c.ImageName)
		report, errScan = secops.ScanImageGrype(r.Context(), c.ImageName+":"+c.ImageTag)
	case "hybrid":
		log.Printf("🔍 [HYBRID SCAN] Lancement du scan double (Trivy + Grype) pour '%s'...\n", c.ImageName)
		report, errScan = secops.ScanImageHybrid(r.Context(), c.ImageName+":"+c.ImageTag)
	default: // "trivy"
		log.Printf("🔍 [TRIVY SCAN] Lancement du scan pour l'image '%s'...\n", c.ImageName)
		report, errScan = secops.ScanImage(r.Context(), c.ImageName+":"+c.ImageTag)
	}

	if errScan != nil {
		log.Printf("❌ [%s ERROR] Échec du scan : %v\n", strings.ToUpper(scannerType), errScan)
		http.Error(w, fmt.Sprintf("Échec du scan %s : %v", scannerType, errScan), http.StatusInternalServerError)
		return
	}

	// Persistance dans SQLite (survit aux redémarrages)
	if reportBytes, marshErr := json.Marshal(report); marshErr == nil {
		if saveErr := db.SaveScanReport(cacheKey, scannerType, c.Name, c.ImageName+":"+c.ImageTag, string(reportBytes)); saveErr != nil {
			log.Printf("[SCAN CACHE WARNING] Impossible de sauvegarder le rapport %s en DB : %v\n", scannerType, saveErr)
		}
	}

	// Mise en cache mémoire
	trivyCacheMu.Lock()
	trivyCache[cacheKey] = report
	trivyCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

// getDockleReport gère le scan de conformité ou le retour depuis le cache pour Dockle.
// Même stratégie de cache à 3 niveaux que getTrivyReport.
func (s *Server) getDockleReport(w http.ResponseWriter, r *http.Request, containerID string) {
	h := resolveHost(r)
	auditor, err := docker.NewDockerAuditorFor(h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey)
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
	if !s.ensureScope(w, r, h.ID, c.Name) {
		return
	}

	// Clé unifiée : digest + "_dockle" (cohérent avec la convention Trivy)
	cacheKey := c.CurrentDigest + "_dockle"

	// Niveau 1 : cache mémoire
	dockleCacheMu.RLock()
	cachedReport, exists := dockleCache[cacheKey]
	dockleCacheMu.RUnlock()
	if exists {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cachedReport)
		return
	}

	// Niveau 2 : cache SQLite
	if reportJSON, _, dbErr := db.GetScanReport(cacheKey); dbErr == nil {
		var report secops.DockleReport
		if jsonErr := json.Unmarshal([]byte(reportJSON), &report); jsonErr == nil {
			log.Printf("📦 [DOCKLE CACHE] Rapport chargé depuis SQLite pour '%s'\n", c.Name)
			dockleCacheMu.Lock()
			dockleCache[cacheKey] = &report
			dockleCacheMu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&report)
			return
		}
	}

	// Niveau 3 : scan réel
	log.Printf("🔍 [DOCKLE LINTER] Lancement du scan de conformité pour l'image '%s'...\n", c.ImageName)
	report, err := secops.ScanCompliance(r.Context(), c.ImageName+":"+c.ImageTag)
	if err != nil {
		log.Printf("❌ [DOCKLE ERROR] Échec du linter : %v\n", err)
		http.Error(w, fmt.Sprintf("Échec du scan de conformité Dockle : %v", err), http.StatusInternalServerError)
		return
	}

	// Persistance dans SQLite
	if reportBytes, marshErr := json.Marshal(report); marshErr == nil {
		if saveErr := db.SaveScanReport(cacheKey, "dockle", c.Name, c.ImageName+":"+c.ImageTag, string(reportBytes)); saveErr != nil {
			log.Printf("[SCAN CACHE WARNING] Impossible de sauvegarder le rapport Dockle en DB : %v\n", saveErr)
		}
	}

	// Mise en cache mémoire
	dockleCacheMu.Lock()
	dockleCache[cacheKey] = report
	dockleCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

// HandleAuditImage scanne une image Docker arbitraire (indépendamment des conteneurs).
// POST /api/audit/image  body: {"image":"nginx","tag":"latest"}
//
// Stratégie : on résout d'abord le digest distant (HEAD léger) pour interroger le
// cache SQLite par digest — si l'image a déjà été auditée, on renvoie le rapport
// existant sans relancer de scan. Sinon on scanne, on persiste par digest, et on
// nettoie l'image si l'audit l'a tirée (pas d'accumulation disque).
func (s *Server) HandleAuditImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAuditor) {
		return
	}

	var req struct {
		Image string `json:"image"`
		Tag   string `json:"tag"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	// Validation stricte (anti-injection d'argument vers les binaires de scan).
	image := strings.TrimSpace(strings.ToLower(req.Image))
	tag := strings.TrimSpace(req.Tag)
	if tag == "" {
		tag = "latest"
	}
	if strings.ContainsAny(image, ":@ \t") || !imageNameRe.MatchString(image) {
		http.Error(w, "Nom d'image invalide (caractères autorisés : a-z, 0-9, . _ - /, sans tag intégré)", http.StatusBadRequest)
		return
	}
	if !imageTagRe.MatchString(tag) {
		http.Error(w, "Tag invalide", http.StatusBadRequest)
		return
	}
	ref := image + ":" + tag

	scanner := strings.ToLower(s.cfg.SecOps.SecopsScanner)
	if scanner != "grype" && scanner != "hybrid" {
		scanner = "trivy"
	}

	// 1. Tentative de résolution du digest distant pour interroger le cache.
	regCli := registry.NewRegistryClient()
	var cacheKey string
	if digest, derr := regCli.FetchRemoteDigest(r.Context(), ref); derr == nil && digest != "" {
		cacheKey = digest + "_" + scanner
		if reportJSON, _, cerr := db.GetScanReport(cacheKey); cerr == nil && reportJSON != "" {
			log.Printf("📦 [AUDIT CACHE] '%s' déjà audité (digest connu) — rapport servi depuis SQLite.\n", ref)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(reportJSON))
			return
		}
	}

	// 2. Pas en cache : on scanne. On note si l'image était déjà locale (pour le nettoyage).
	auditor, err := docker.NewDockerAuditor()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer auditor.Close()
	wasLocal := auditor.ImageExistsLocally(r.Context(), ref)

	log.Printf("🔍 [AUDIT IMAGE] Scan %s de '%s'...\n", strings.ToUpper(scanner), ref)
	var report *secops.TrivyReport
	var errScan error
	switch scanner {
	case "grype":
		report, errScan = secops.ScanImageGrype(r.Context(), ref)
	case "hybrid":
		report, errScan = secops.ScanImageHybrid(r.Context(), ref)
	default:
		report, errScan = secops.ScanImage(r.Context(), ref)
	}
	if errScan != nil {
		log.Printf("❌ [AUDIT IMAGE ERROR] %v\n", errScan)
		http.Error(w, fmt.Sprintf("Échec de l'audit de l'image : %v", errScan), http.StatusInternalServerError)
		return
	}

	// 3. Persistance du rapport (par digest si connu, sinon clé de repli sur la référence).
	if cacheKey == "" {
		cacheKey = "adhoc_" + ref + "_" + scanner
	}
	if reportBytes, mErr := json.Marshal(report); mErr == nil {
		if sErr := db.SaveScanReport(cacheKey, scanner, "", ref, string(reportBytes)); sErr != nil {
			log.Printf("[AUDIT CACHE WARNING] Sauvegarde du rapport échouée : %v\n", sErr)
		}
	}

	// 4. Nettoyage : si l'audit a tiré l'image, on la retire (sauf si un conteneur l'utilise).
	if !wasLocal {
		if rmErr := auditor.RemoveImageIfUnused(r.Context(), ref); rmErr == nil {
			log.Printf("🧹 [AUDIT] Image '%s' tirée pour l'audit puis supprimée (aucun conteneur ne l'utilise).\n", ref)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(report)
}

// triggerRolloutUpdate déclenche la vérification et le déploiement transactionnel sécurisé.
func (s *Server) triggerRolloutUpdate(w http.ResponseWriter, r *http.Request, containerID string) {
	// La mise à jour modifie la production : réservée aux administrateurs.
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	h := resolveHost(r)
	orchestrator, err := deployer.NewLifecycleOrchestratorFor(s.cfg, h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey)
	if err != nil {
		http.Error(w, fmt.Sprintf("Impossible d'initialiser l'orchestrateur : %v", err), http.StatusInternalServerError)
		return
	}
	defer orchestrator.Close()

	log.Printf("🔄 [API LIFECYCLE] Déclenchement de la mise à jour pour le conteneur '%s'...\n", containerID[:12])
	updated, err := orchestrator.CheckAndUpdateContainer(r.Context(), containerID)
	if err != nil {
		log.Printf("❌ [API LIFECYCLE ERROR] Échec de la mise à jour : %v\n", err)
		w.WriteHeader(http.StatusConflict) // 409 Conflict pour marquer le rejet SecOps ou d'exécution
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// La purge du cache (SQLite + mémoire) est gérée directement par le deployer
	// dans CheckAndUpdateContainer : il supprime les rapports de l'ancienne image
	// et pré-charge le rapport Trivy de la nouvelle. Rien à faire ici.

	message := "Conteneur déjà à jour : aucune nouvelle version disponible sur le registre."
	if updated {
		message = "Mise à jour validée par SecOps et déployée. Évolution des CVE (avant/après) disponible dans le centre de notifications."
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"updated": updated,
		"message": message,
	})
}

// HandleHosts gère le registre des hôtes Docker fédérés.
// GET  /api/hosts → liste (matériel TLS masqué)
// POST /api/hosts → ajout {name, endpoint, tls_ca?, tls_cert?, tls_key?}
func (s *Server) HandleHosts(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := db.GetHosts()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		var req struct {
			Name     string `json:"name"`
			Endpoint string `json:"endpoint"`
			TLSCa    string `json:"tls_ca"`
			TLSCert  string `json:"tls_cert"`
			TLSKey   string `json:"tls_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(req.Name)
		endpoint := strings.TrimSpace(req.Endpoint)
		if name == "" || endpoint == "" {
			http.Error(w, "Nom et endpoint obligatoires (ex: tcp://10.0.0.5:2376)", http.StatusBadRequest)
			return
		}
		if !strings.HasPrefix(endpoint, "tcp://") && !strings.HasPrefix(endpoint, "ssh://") {
			http.Error(w, "Endpoint distant invalide (préfixe attendu : tcp:// ou ssh://)", http.StatusBadRequest)
			return
		}
		if err := db.AddHost(name, endpoint, req.TLSCa, req.TLSCert, req.TLSKey); err != nil {
			http.Error(w, fmt.Sprintf("Erreur d'enregistrement : %v", err), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Hôte enregistré."))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleHostsDelete supprime un hôte (sauf l'hôte local).
// POST /api/hosts/delete {id}
func (s *Server) HandleHostsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := db.DeleteHost(req.ID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Hôte supprimé."))
}

// HandleHostTest teste la connectivité d'un hôte sans l'enregistrer.
// POST /api/hosts/test {endpoint, tls_ca?, tls_cert?, tls_key?} ou {id}
func (s *Server) HandleHostTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID       int    `json:"id"`
		Endpoint string `json:"endpoint"`
		TLSCa    string `json:"tls_ca"`
		TLSCert  string `json:"tls_cert"`
		TLSKey   string `json:"tls_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	endpoint, ca, cert, key := req.Endpoint, req.TLSCa, req.TLSCert, req.TLSKey
	// Si un id est fourni, on teste l'hôte enregistré (avec ses certs déchiffrés).
	if req.ID > 0 {
		if h, err := db.GetHost(req.ID); err == nil {
			endpoint, ca, cert, key = h.Endpoint, h.TLSCa, h.TLSCert, h.TLSKey
		}
	}

	auditor, err := docker.NewDockerAuditorFor(endpoint, ca, cert, key)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	defer auditor.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	if perr := auditor.Ping(ctx); perr != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": perr.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// HandleExceptions gère les exceptions CVE (risques acceptés).
// GET  /api/exceptions       → liste
// POST /api/exceptions       → ajout {cve_id, container_name?, reason?, expires_at?}
func (s *Server) HandleExceptions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		if !auth.RequireRole(w, r, db.RoleAuditor) {
			return
		}
		list, err := db.GetCVEExceptions()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		if !auth.RequireRole(w, r, db.RoleAdmin) {
			return
		}
		var req struct {
			CVEID         string `json:"cve_id"`
			ContainerName string `json:"container_name"`
			Reason        string `json:"reason"`
			ExpiresAt     string `json:"expires_at"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		cve := strings.ToUpper(strings.TrimSpace(req.CVEID))
		if cve == "" {
			http.Error(w, "Identifiant de CVE obligatoire", http.StatusBadRequest)
			return
		}
		// Validation légère du format de date si fourni.
		if req.ExpiresAt != "" {
			if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(req.ExpiresAt) {
				http.Error(w, "Date d'expiration invalide (format attendu : AAAA-MM-JJ)", http.StatusBadRequest)
				return
			}
		}
		if err := db.AddCVEException(cve, strings.TrimSpace(req.ContainerName), strings.TrimSpace(req.Reason), req.ExpiresAt); err != nil {
			http.Error(w, fmt.Sprintf("Erreur d'enregistrement : %v", err), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Exception enregistrée."))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleExceptionsDelete supprime une exception CVE par son identifiant.
// POST /api/exceptions/delete  {id}
func (s *Server) HandleExceptionsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := db.DeleteCVEException(req.ID); err != nil {
		http.Error(w, fmt.Sprintf("Erreur de suppression : %v", err), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Exception supprimée."))
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
		if !auth.RequireRole(w, r, db.RoleAdmin) {
			return
		}
		var req struct {
			ContainerName      string `json:"container_name"`
			MaxSeverityAllowed string `json:"secops_max_severity_allowed"`
			AllowRoot          *bool  `json:"secops_allow_root"`
			AllowPrivileged    *bool  `json:"secops_allow_privileged"`
			SecopsScanner      string `json:"secops_scanner"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		
		if req.ContainerName == "" {
			http.Error(w, "Nom de conteneur obligatoire", http.StatusBadRequest)
			return
		}
		
		err := db.SaveContainerSettings(req.ContainerName, req.MaxSeverityAllowed, req.AllowRoot, req.AllowPrivileged, req.SecopsScanner)
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
	if !auth.RequireRole(w, r, db.RoleAdmin) {
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
