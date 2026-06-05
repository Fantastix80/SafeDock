package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
)

// audit enregistre une action sensible au nom de l'utilisateur courant.
func audit(r *http.Request, action, target, detail string) {
	if u, ok := currentUser(r); ok {
		db.WriteSecurityAudit(u.ID, u.Username, action, target, detail)
	}
}

// currentUser charge le compte associé à la session courante.
func currentUser(r *http.Request) (db.User, bool) {
	claims, ok := auth.ClaimsFrom(r)
	if !ok {
		return db.User{}, false
	}
	u, err := db.GetUserByID(claims.UserID)
	if err != nil {
		return db.User{}, false
	}
	return u, true
}

// canSeeContainer applique la portée d'un utilisateur à un conteneur donné.
// Admin ou scope_all → tout. Sinon : (hôte autorisé) ET (tag autorisé) selon les
// restrictions définies ; un utilisateur sans aucune portée ne voit rien.
func canSeeContainer(u db.User, hostID int, containerTagIDs map[int]bool) bool {
	if u.Role == db.RoleAdmin || u.ScopeAll {
		return true
	}
	if len(u.AllowedHosts) == 0 && len(u.AllowedTags) == 0 {
		return false
	}

	hostOK := len(u.AllowedHosts) == 0
	for _, h := range u.AllowedHosts {
		if h == hostID {
			hostOK = true
			break
		}
	}

	tagOK := len(u.AllowedTags) == 0
	for _, t := range u.AllowedTags {
		if containerTagIDs[t] {
			tagOK = true
			break
		}
	}
	return hostOK && tagOK
}

// ── Gestion des utilisateurs (admin) ────────────────────────────────────────

// HandleUsers : GET liste, POST création (admin uniquement).
func (s *Server) HandleUsers(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := db.ListUsers()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		var req struct {
			Email     string `json:"email"` // identifiant de connexion
			Password  string `json:"password"`
			Role      string `json:"role"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			ScopeAll  bool   `json:"scope_all"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		username := strings.TrimSpace(req.Email) // l'adresse e-mail sert d'identifiant
		if username == "" || len(req.Password) < 10 {
			http.Error(w, "Adresse e-mail requise et mot de passe d'au moins 10 caractères", http.StatusBadRequest)
			return
		}
		if !db.ValidRole(req.Role) {
			http.Error(w, "Rôle invalide (admin, auditor ou viewer)", http.StatusBadRequest)
			return
		}
		// Compte créé avec changement de mot de passe imposé au premier login.
		if _, err := db.CreateUser(username, crypto.PasswordVerifier(req.Password), req.Role,
			strings.TrimSpace(req.FirstName), strings.TrimSpace(req.LastName), req.ScopeAll, true); err != nil {
			http.Error(w, fmt.Sprintf("Création impossible (e-mail déjà utilisé ?) : %v", err), http.StatusConflict)
			return
		}
		audit(r, "user.create", username, fmt.Sprintf("rôle=%s, voit-tout=%t", req.Role, req.ScopeAll))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Utilisateur créé."))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleUsersDelete supprime un compte (admin). Refuse de supprimer le dernier admin.
func (s *Server) HandleUsersDelete(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	id, ok := decodeID(w, r)
	if !ok {
		return
	}
	target, err := db.GetUserByID(id)
	if err != nil {
		http.Error(w, "Utilisateur introuvable", http.StatusNotFound)
		return
	}
	if target.Role == db.RoleAdmin {
		if n, _ := db.CountAdmins(); n <= 1 {
			http.Error(w, "Impossible de supprimer le dernier administrateur", http.StatusBadRequest)
			return
		}
	}
	if err := db.DeleteUser(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	audit(r, "user.delete", target.Username, "")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Utilisateur supprimé."))
}

// HandleUserPassword : un admin réinitialise le mot de passe d'un compte (changement forcé ensuite).
func (s *Server) HandleUserPassword(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID          int    `json:"id"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 10 {
		http.Error(w, "Mot de passe d'au moins 10 caractères requis", http.StatusBadRequest)
		return
	}
	if err := db.SetUserPassword(req.ID, crypto.PasswordVerifier(req.NewPassword), true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if u, err := db.GetUserByID(req.ID); err == nil {
		audit(r, "user.reset_password", u.Username, "changement imposé au prochain login")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Mot de passe réinitialisé (changement imposé à la prochaine connexion)."))
}

// HandleUserResetMFA : un admin réinitialise le MFA d'un compte (perte du téléphone).
func (s *Server) HandleUserResetMFA(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	id, ok := decodeID(w, r)
	if !ok {
		return
	}
	if err := db.ResetUserMFA(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if u, err := db.GetUserByID(id); err == nil {
		audit(r, "user.reset_mfa", u.Username, "ré-enrôlement requis")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("MFA réinitialisé : un nouvel enrôlement sera demandé à la prochaine connexion."))
}

// HandleUserRole change le rôle d'un compte (admin). Empêche de rétrograder le dernier admin.
func (s *Server) HandleUserRole(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID   int    `json:"id"`
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	if !db.ValidRole(req.Role) {
		http.Error(w, "Rôle invalide", http.StatusBadRequest)
		return
	}
	target, err := db.GetUserByID(req.ID)
	if err != nil {
		http.Error(w, "Utilisateur introuvable", http.StatusNotFound)
		return
	}
	if target.Role == db.RoleAdmin && req.Role != db.RoleAdmin {
		if n, _ := db.CountAdmins(); n <= 1 {
			http.Error(w, "Impossible de rétrograder le dernier administrateur", http.StatusBadRequest)
			return
		}
	}
	if err := db.SetUserRole(req.ID, req.Role); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	audit(r, "user.set_role", target.Username, fmt.Sprintf("%s → %s", target.Role, req.Role))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Rôle mis à jour."))
}

// HandleUserScope définit la portée de visibilité d'un compte (admin).
func (s *Server) HandleUserScope(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	var req struct {
		ID           int   `json:"id"`
		ScopeAll     bool  `json:"scope_all"`
		AllowedTags  []int `json:"allowed_tags"`
		AllowedHosts []int `json:"allowed_hosts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}
	_ = db.SetUserScopeAll(req.ID, req.ScopeAll)
	_ = db.SetUserAllowedTags(req.ID, req.AllowedTags)
	_ = db.SetUserAllowedHosts(req.ID, req.AllowedHosts)
	if u, err := db.GetUserByID(req.ID); err == nil {
		audit(r, "user.set_scope", u.Username, fmt.Sprintf("voit-tout=%t, %d tag(s), %d hôte(s)", req.ScopeAll, len(req.AllowedTags), len(req.AllowedHosts)))
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Portée mise à jour."))
}

// ── Gestion des tags ────────────────────────────────────────────────────────

// HandleTags : GET liste (tout compte authentifié), POST création (admin).
func (s *Server) HandleTags(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := db.ListTags()
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
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(req.Name)
		if name == "" {
			http.Error(w, "Nom de tag requis", http.StatusBadRequest)
			return
		}
		if _, err := db.CreateTag(name, strings.TrimSpace(req.Color)); err != nil {
			http.Error(w, fmt.Sprintf("Création impossible (déjà existant ?) : %v", err), http.StatusConflict)
			return
		}
		audit(r, "tag.create", name, "")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Tag créé."))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleTagsDelete supprime un tag (admin).
func (s *Server) HandleTagsDelete(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	id, ok := decodeID(w, r)
	if !ok {
		return
	}
	if err := db.DeleteTag(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	audit(r, "tag.delete", fmt.Sprintf("tag#%d", id), "")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("Tag supprimé."))
}

// HandleTagAssignments : GET liste des associations (authentifié),
// POST associe/désassocie un tag à un conteneur (admin).
func (s *Server) HandleTagAssignments(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := db.ListContainerTagAssignments()
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
			Action        string `json:"action"` // "assign" | "unassign"
			TagID         int    `json:"tag_id"`
			HostID        int    `json:"host_id"`
			ContainerName string `json:"container_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Format JSON invalide", http.StatusBadRequest)
			return
		}
		if req.ContainerName == "" || req.TagID == 0 {
			http.Error(w, "tag_id et container_name requis", http.StatusBadRequest)
			return
		}
		var err error
		if req.Action == "unassign" {
			err = db.UnassignContainerTag(req.TagID, req.HostID, req.ContainerName)
		} else {
			err = db.AssignContainerTag(req.TagID, req.HostID, req.ContainerName)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		action := "tag.assign"
		if req.Action == "unassign" {
			action = "tag.unassign"
		}
		audit(r, action, req.ContainerName, fmt.Sprintf("tag#%d (hôte %d)", req.TagID, req.HostID))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Association mise à jour."))

	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

// HandleSecurityAudit renvoie le journal d'audit de sécurité (admin uniquement).
func (s *Server) HandleSecurityAudit(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}
	entries, err := db.GetSecurityAudit(200)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(entries)
}

// HandleNotifications : GET liste les notifications, POST les marque comme lues.
// Réservé aux auditeurs et admins (alertes portant sur tout le parc).
func (s *Server) HandleNotifications(w http.ResponseWriter, r *http.Request) {
	if !auth.RequireRole(w, r, db.RoleAuditor) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := db.GetNotifications(200)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)
	case http.MethodPost:
		if err := db.MarkNotificationsRead(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Notifications marquées comme lues."))
	default:
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
	}
}

func decodeID(w http.ResponseWriter, r *http.Request) (int, bool) {
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		http.Error(w, "Identifiant invalide", http.StatusBadRequest)
		return 0, false
	}
	return req.ID, true
}
