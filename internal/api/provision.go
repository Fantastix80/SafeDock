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
		Platform     string `json:"platform"` // "linux" (défaut) ou "windows"
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

	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	var script, filename string
	if platform == "windows" {
		script = buildProvisionScriptWindows(strings.TrimSpace(pub), user, controllerIP)
		filename = "safedock-provision.ps1"
	} else {
		platform = "linux"
		script = buildProvisionScript(strings.TrimSpace(pub), user, controllerIP)
		filename = "safedock-provision.sh"
	}
	endpoint := fmt.Sprintf("ssh://%s@%s:%d", user, address, port)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"script":   script,
		"endpoint": endpoint,
		"platform": platform,
		"filename": filename,
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

// buildProvisionScriptWindows rend l'équivalent PowerShell pour un hôte Windows.
// À lancer dans une console PowerShell en Administrateur. Le script reste sans
// backtick (les guillemets sont construits via [char]34) pour rester lisible et
// robuste. controllerIP est injecté en chaîne PowerShell littérale (quotes simples).
func buildProvisionScriptWindows(pubKey, user, controllerIP string) string {
	fromValue := "''"
	descSuffix := ""
	if controllerIP != "" {
		fromValue = fmt.Sprintf("'%s'", controllerIP)
		descSuffix = fmt.Sprintf(", et uniquement depuis %s", controllerIP)
	}

	const tmpl = `#Requires -RunAsAdministrator
# SafeDock - provisionnement d'un acces SSH restreint sur cet hote Windows.
# A executer dans une console PowerShell EN ADMINISTRATEUR. Idempotent.
#
# Effet : cree l'utilisateur local '%[1]s' (NON administrateur, groupe
# docker-users) dont la cle SSH ne peut QUE relayer l'API Docker via
# "docker system dial-stdio"%[3]s.

$ErrorActionPreference = 'Stop'
$User   = '%[1]s'
$PubKey = '%[2]s'
$From   = %[4]s
$DQ     = [char]34   # guillemet double, evite tout probleme d'echappement

# 1. OpenSSH Server present et demarre (service automatique).
$cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Select-Object -First 1
if ($cap -and $cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# 2. Verification de Docker.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning 'Docker introuvable dans le PATH. Installez/demarrez Docker (Engine en service recommande, voir notes).'
}

# 3. Utilisateur local dedie (NON admin), mot de passe aleatoire, dans docker-users.
$bytes = New-Object 'System.Byte[]' 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pw  = [System.Convert]::ToBase64String($bytes)
$sec = ConvertTo-SecureString $pw -AsPlainText -Force
if (-not (Get-LocalUser -Name $User -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $User -Password $sec -FullName 'SafeDock agent' -Description 'Acces Docker restreint SafeDock' -PasswordNeverExpires | Out-Null
} else {
  Set-LocalUser -Name $User -Password $sec -PasswordNeverExpires $true
}
if (Get-LocalGroup -Name 'docker-users' -ErrorAction SilentlyContinue) {
  Add-LocalGroupMember -Group 'docker-users' -Member $User -ErrorAction SilentlyContinue
} else {
  Write-Warning 'Groupe docker-users absent (Docker Desktop non installe ?). L utilisateur doit pouvoir acceder au moteur Docker.'
}

# 4. authorized_keys par-utilisateur, verrouille au moindre privilege.
$sshDir = Join-Path "C:\Users\$User" '.ssh'
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
$auth = Join-Path $sshDir 'authorized_keys'
$dial = 'docker system dial-stdio'
if ([string]::IsNullOrEmpty($From)) {
  $opts = 'command=' + $DQ + $dial + $DQ + ',restrict'
} else {
  $opts = 'from=' + $DQ + $From + $DQ + ',command=' + $DQ + $dial + $DQ + ',restrict'
}
$line = $opts + ' ' + $PubKey
Set-Content -Path $auth -Value $line -Encoding ascii

# ACL stricte (sshd StrictModes) : seuls l'utilisateur, SYSTEM et Administrators.
icacls $auth /inheritance:r | Out-Null
icacls $auth /grant ($User + ':R') 'SYSTEM:F' 'Administrators:F' | Out-Null

# 5. Cle publique d'hote -- a coller dans SafeDock pour l'epinglage (anti-MITM).
Write-Host ''
Write-Host '============================================================'
Write-Host ' Hote pret pour SafeDock.'
Write-Host ' Copiez la ligne ci-dessous dans le champ'
Write-Host ' « Cle publique de l hote » (epinglage anti-MITM) :'
Write-Host '------------------------------------------------------------'
if (Test-Path 'C:\ProgramData\ssh\ssh_host_ed25519_key.pub') {
  Get-Content 'C:\ProgramData\ssh\ssh_host_ed25519_key.pub'
} else {
  Write-Host '(cle d hote ed25519 introuvable)'
}
Write-Host '============================================================'
Write-Host 'NB: si HKLM:\SOFTWARE\OpenSSH\DefaultShell pointe vers PowerShell,'
Write-Host '    repassez-le sur cmd.exe (defaut) -- PowerShell peut corrompre le flux binaire de dial-stdio.'
`
	return fmt.Sprintf(tmpl, user, pubKey, descSuffix, fromValue)
}
