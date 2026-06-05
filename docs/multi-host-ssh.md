# Supervision multi-hôtes & sécurisation de la connexion

SafeDock peut superviser plusieurs démons Docker depuis une seule console :
l'hôte local et des **hôtes distants**. Il n'y a **aucun agent à installer** sur
les hôtes distants : SafeDock se connecte directement à leur API Docker, via un
transport sécurisé.

## Deux transports possibles

| Transport | Endpoint | Principe | Recommandé |
|---|---|---|---|
| **SSH** | `ssh://user@hote[:port]` | Tunnel SSH vers le socket Docker **local** de l'hôte (rien n'est exposé sur le réseau). | ✅ Oui |
| TCP + TLS mutuel | `tcp://hote:2376` | Connexion directe à l'API Docker exposée en TLS mutuel. | Si SSH impossible |

> ⚠️ **Ne jamais exposer l'API Docker en clair.** L'accès au démon Docker équivaut
> à un accès **root** sur l'hôte.

---

## Transport SSH (recommandé) — pas-à-pas sécurisé

Avec SSH, **aucun port Docker n'est ouvert** : seul SSH (port 22, déjà présent et
durci) est utilisé. SafeDock ouvre une session SSH qui lance
`docker system dial-stdio` sur l'hôte, relayant le socket Docker local.

### 1. Récupérer la clé publique de SafeDock

SafeDock génère et conserve **en interne** sa propre paire de clés SSH (la clé
privée est chiffrée en base et **n'est jamais affichée**). Dans l'interface :
**Multi-hôtes → « Clé publique SSH de SafeDock »** → copier la clé. Elle peut être
**régénérée** par un administrateur (il faudra alors la réinstaller sur les hôtes).

### 2. Créer un utilisateur dédié et restreint sur l'hôte cible

Sur l'hôte distant, créer un utilisateur dédié, membre du groupe `docker`, sans
mot de passe (accès par clé uniquement) :

```bash
useradd -m -s /bin/bash -G docker safedock
passwd -l safedock          # verrouille le mot de passe (clé uniquement)
install -d -m 700 -o safedock -g safedock /home/safedock/.ssh
```

### 3. Installer la clé publique SafeDock — verrouillée à une seule commande

Dans `/home/safedock/.ssh/authorized_keys`, préfixer la clé publique SafeDock par
des options de restriction (remplacer `<IP_SAFEDOCK>` par l'adresse de l'hôte qui
exécute SafeDock, et coller la clé publique copiée à l'étape 1) :

```
from="<IP_SAFEDOCK>",command="docker system dial-stdio",restrict ssh-ed25519 AAAA... safedock
```

Effet de ces options — **principe du moindre privilège** :

- `command="docker system dial-stdio"` : la clé ne peut **que** relayer l'API
  Docker. Toute autre commande demandée est ignorée.
- `restrict` : désactive PTY, redirections de ports, agent-forwarding, etc.
- `from="<IP_SAFEDOCK>"` : la clé n'est utilisable **que depuis l'hôte SafeDock**.

Résultat : même si la clé privée fuitait, elle ne permettrait ni shell, ni
rebond, ni usage depuis une autre machine — uniquement un proxy de l'API Docker,
depuis l'hôte SafeDock.

```bash
chown -R safedock:safedock /home/safedock/.ssh
chmod 600 /home/safedock/.ssh/authorized_keys
```

### 4. (Recommandé) Épingler la clé d'hôte (anti-MITM)

Récupérer la clé publique d'hôte du serveur cible :

```bash
cat /etc/ssh/ssh_host_ed25519_key.pub
```

Elle sera collée dans le champ « Clé publique de l'hôte » au moment de l'ajout.
SafeDock l'épingle (vérification stricte de l'identité du serveur). Sans elle, la
connexion est acceptée à la première utilisation (type *accept-new*).

### 5. Ajouter l'hôte dans SafeDock

**Multi-hôtes → Ajouter un hôte distant** :

- Nom : libre (ex. `prod-node-02`)
- Endpoint : `ssh://safedock@<IP_HOTE>:22`
- Clé publique de l'hôte : (étape 4, optionnel mais recommandé)

Cliquer **Tester** (SafeDock ouvre la connexion et vérifie l'accès), puis
**Ajouter**. Les conteneurs de l'hôte apparaissent ensuite dans l'inventaire et le
tableau de bord, avec leur colonne « Hôte ».

---

## Transport TCP + TLS mutuel (alternative)

Si SSH n'est pas envisageable, exposer l'API Docker en **TLS mutuel** uniquement
(`dockerd --tlsverify`, certificats client + serveur), **filtrée par pare-feu**
vers la seule IP de SafeDock (idéalement via un VPN ou un proxy de socket
restreint type `tecnativa/docker-socket-proxy`). Fournir CA + certificat + clé
client dans le formulaire d'ajout d'hôte. Ne jamais exposer l'API sans TLS.

---

## Sous le capot (implémentation)

- `internal/docker/client.go` — `NewEngineClient` construit le client Docker
  (local / `tcp://`+TLS / `ssh://`). Pour SSH, chaque connexion ouvre une session
  qui exécute `docker system dial-stdio` (relais du socket) ; la clé d'hôte est
  épinglée et l'algorithme de clé d'hôte contraint à son type.
- Clé privée d'instance : générée par `crypto.GenerateSSHKeypair` (ed25519),
  stockée **chiffrée** (AES-256-GCM) dans `settings`. Un hôte `ssh://` sans clé
  propre utilise automatiquement cette clé (`db.injectSSHKey`).
- Le matériel sensible des hôtes (`tls_*`) est chiffré en base et marqué
  `json:"-"` (jamais renvoyé par l'API).
