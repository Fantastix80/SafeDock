package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/db"
)

// Validation stricte des entrées : le script généré est exécuté EN ROOT sur
// l'hôte cible, on refuse donc tout caractère susceptible d'altérer le shell.
var (
	reHostAddr = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,253}$`)
	reUnixUser = regexp.MustCompile(`^[a-z_][a-z0-9_-]{0,31}$`)
	reIPish    = regexp.MustCompile(`^[A-Za-z0-9_.:*-]{1,253}$`)
)

// HandleHostProvision génère un script bash, à lancer en root sur l'hôte cible,
// qui crée un accès SSH restreint dédié à SafeDock : utilisateur sans mot de
// passe, membre du groupe docker, dont la clé publique d'instance est verrouillée
// à `command="docker system dial-stdio",restrict` (et éventuellement `from=`).
// L'admin n'a donc aucune commande à composer à la main.
//
// POST /api/hosts/provision-script {address, port?, user?, controller_ip?}
func (s *Server) HandleHostProvision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	if !auth.RequireRole(w, r, db.RoleAdmin) {
		return
	}

	var req struct {
		Address      string `json:"address"`
		Port         int    `json:"port"`
		User         string `json:"user"`
		ControllerIP string `json:"controller_ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Format JSON invalide", http.StatusBadRequest)
		return
	}

	address := strings.TrimSpace(req.Address)
	user := strings.TrimSpace(req.User)
	if user == "" {
		user = "safedock"
	}
	port := req.Port
	if port == 0 {
		port = 22
	}
	controllerIP := strings.TrimSpace(req.ControllerIP)

	if !reHostAddr.MatchString(address) {
		http.Error(w, "Adresse de l'hôte invalide (IP ou nom DNS attendu)", http.StatusBadRequest)
		return
	}
	if !reUnixUser.MatchString(user) {
		http.Error(w, "Nom d'utilisateur Unix invalide", http.StatusBadRequest)
		return
	}
	if port < 1 || port > 65535 {
		http.Error(w, "Port SSH invalide", http.StatusBadRequest)
		return
	}
	if controllerIP != "" && !reIPish.MatchString(controllerIP) {
		http.Error(w, "IP source SafeDock invalide", http.StatusBadRequest)
		return
	}

	pub, err := db.GetSSHPublicKey()
	if err != nil || strings.TrimSpace(pub) == "" {
		http.Error(w, "Clé publique SafeDock indisponible", http.StatusInternalServerError)
		return
	}

	script := buildProvisionScript(strings.TrimSpace(pub), user, controllerIP)
	endpoint := fmt.Sprintf("ssh://%s@%s:%d", user, address, port)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"script":   script,
		"endpoint": endpoint,
	})
}

// buildProvisionScript rend le script d'installation. Les valeurs dynamiques
// sont injectées dans des chaînes shell en quotes simples (donc littérales) :
// pubKey est du base64+espaces et controllerIP est validé sans quote, aucune
// échappée n'est donc nécessaire.
func buildProvisionScript(pubKey, user, controllerIP string) string {
	// Jeton shell pour l'option from= (défense en profondeur, optionnelle).
	fromToken := "''"
	descSuffix := ""
	if controllerIP != "" {
		fromToken = fmt.Sprintf("'from=\"%s\",'", controllerIP)
		descSuffix = fmt.Sprintf(", et uniquement depuis %s", controllerIP)
	}

	const tmpl = `#!/usr/bin/env bash
#
# SafeDock — provisionnement d'un acces SSH restreint sur cet hote.
# A executer EN ROOT sur la machine cible. Idempotent (re-executable sans risque).
#
# Effet : cree l'utilisateur '%[1]s' (sans mot de passe, groupe docker) dont la
# cle SSH ne peut QUE relayer l'API Docker via "docker system dial-stdio"%[3]s.
# Aucun shell, aucun rebond, aucune redirection ne sont possibles avec cette cle.
#
set -euo pipefail

SAFEDOCK_USER='%[1]s'
PUBKEY='%[2]s'
FROM=%[4]s

if [ "$(id -u)" -ne 0 ]; then
  echo "Erreur : ce script doit etre lance en root." >&2; exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Erreur : Docker ne semble pas installe sur cet hote." >&2; exit 1
fi

# 1. Utilisateur dedie (cree si absent), mot de passe verrouille (cle uniquement).
if ! id "$SAFEDOCK_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$SAFEDOCK_USER"
fi
usermod -aG docker "$SAFEDOCK_USER"
passwd -l "$SAFEDOCK_USER" >/dev/null

# 2. authorized_keys verrouille au moindre privilege.
SSH_DIR="$(getent passwd "$SAFEDOCK_USER" | cut -d: -f6)/.ssh"
install -d -m 700 -o "$SAFEDOCK_USER" -g "$SAFEDOCK_USER" "$SSH_DIR"
AUTH="$SSH_DIR/authorized_keys"
OPTS='command="docker system dial-stdio",restrict'
LINE="${FROM}${OPTS} ${PUBKEY}"
touch "$AUTH"
# Retire toute ancienne ligne SafeDock avant de reecrire (idempotence).
grep -vF 'command="docker system dial-stdio"' "$AUTH" > "$AUTH.tmp" 2>/dev/null || true
mv "$AUTH.tmp" "$AUTH"
printf '%%s\n' "$LINE" >> "$AUTH"
chown -R "$SAFEDOCK_USER:$SAFEDOCK_USER" "$SSH_DIR"
chmod 600 "$AUTH"

# 3. Cle publique d'hote — a coller dans SafeDock pour l'epinglage (anti-MITM).
echo
echo "============================================================"
echo " Hote pret pour SafeDock."
echo " Copiez la ligne ci-dessous dans le champ"
echo " « Cle publique de l'hote » (epinglage anti-MITM) :"
echo "------------------------------------------------------------"
cat /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null || echo "(cle d'hote ed25519 introuvable)"
echo "============================================================"
`
	return fmt.Sprintf(tmpl, user, pubKey, descSuffix, fromToken)
}
