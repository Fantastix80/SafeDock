package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/backup"
	"github.com/safedock/safedock/internal/db"
)

// HandleBackups gère la configuration et la liste des sauvegardes, et la création
// à la demande. Réservé aux administrateurs.
//
//	GET  /api/backups        → { config:{enabled,keep}, backups:[...] }
//	POST /api/backups        → crée une sauvegarde immédiate (+ rotation)
func (s *Server) HandleBackups(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := backup.List()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"config":  db.GetBackupConfig(),
			"backups": list,
		})

	case http.MethodPost:
		info, err := backup.Create(time.Now())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if bc := db.GetBackupConfig(); bc.Keep > 0 {
			_, _ = backup.Prune(bc.Keep)
		}
		audit(r, "backup.create", info.Name, fmt.Sprintf("%d octets", info.Size))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(info)

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleBackupsConfig met à jour la configuration des sauvegardes.
// POST /api/backups/config {enabled, keep}
func (s *Server) HandleBackupsConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
		Keep    int  `json:"keep"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	// Valeurs proposées : 3/7/14/30 ou 0 (illimité).
	valid := map[int]bool{0: true, 3: true, 7: true, 14: true, 30: true}
	if !valid[req.Keep] {
		http.Error(w, "Nombre de sauvegardes à conserver invalide", http.StatusBadRequest)
		return
	}
	if err := db.SetBackupConfig(db.BackupConfig{Enabled: req.Enabled, Keep: req.Keep}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	audit(r, "backup.config", "", fmt.Sprintf("enabled=%v keep=%d", req.Enabled, req.Keep))
	w.WriteHeader(http.StatusOK)
}

// HandleBackupsDelete supprime une sauvegarde nommée.
// POST /api/backups/delete {name}
func (s *Server) HandleBackupsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if err := backup.Delete(req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	audit(r, "backup.delete", req.Name, "")
	w.WriteHeader(http.StatusOK)
}

// HandleBackupDownload sert un fichier de sauvegarde en téléchargement.
// GET /api/backups/download?name=safedock-AAAAMMJJ-HHMMSS.db
func (s *Server) HandleBackupDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	name := r.URL.Query().Get("name")
	path, err := backup.Path(name) // valide le nom (anti-traversée) et l'existence
	if err != nil {
		http.Error(w, "Sauvegarde introuvable", http.StatusNotFound)
		return
	}
	audit(r, "backup.download", name, "")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	http.ServeFile(w, r, path)
}
