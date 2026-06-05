# SafeDock 🛡️⚓

SafeDock est un orchestrateur de sécurité et de cycle de vie auto-hébergé pour les infrastructures Docker. 

Contrairement aux outils de mise à jour automatique aveugles, SafeDock agit comme un **pare-feu de déploiement (Gatekeeper)**. Il intercepte les nouvelles versions d'images, exécute des tests SecOps approfondis dans un environnement isolé (Staging), et n'autorise le déploiement en production que si les critères de sécurité et d'immuabilité (utilisation stricte du **Digest SHA256 unique**) sont validés.

---

## ✨ Fonctionnalités principales

* **Pare-feu de déploiement** : scan d'une nouvelle image en staging (CVE + conformité), déploiement transactionnel uniquement si les règles SecOps passent, sinon rollback automatique.
* **Suivi de sécurité dans la durée** : historisation des CVE par conteneur et **courbes de tendance** ; détection de **dérive** (nouvelles CVE sur une image inchangée) ; **diff de sécurité avant/après** chaque mise à jour.
* **Comptes & contrôle d'accès (IAM/RBAC)** : comptes multi-utilisateurs, rôles `admin` / `auditor` / `viewer`, **MFA TOTP obligatoire** + codes de secours, **portées** limitant la visibilité par **tags** et/ou par **hôte**.
* **Conformité par tag** : posture agrégée par environnement / équipe.
* **Multi-hôtes** : supervision de plusieurs démons Docker (local + endpoints TLS distants).
* **Journal d'audit de sécurité** (qui fait quoi) et **centre de notifications** (alertes CVE / déploiements bloqués), avec e-mail optionnel (SMTP).
* **Scanners** : Trivy et Grype (CVE), Dockle (conformité d'image).

---

## 🔒 Sécurité du Socket Docker & Architecture Proxy

Par défaut, de nombreux outils d'orchestration Docker nécessitent le montage direct du socket de l'hôte (`/var/run/docker.sock`). Ce montage comporte un risque majeur : **l'accès au socket équivaut à un accès root complet sur la machine hôte**. Si le conteneur applicatif est compromis, l'attaquant peut s'emparer de l'hôte.

### 🛡️ Solution recommandée : Le Proxy de Socket Sécurisé

Pour sécuriser l'accès, SafeDock recommande l'utilisation d'un **Proxy de Socket Docker** (comme `tecnativa/docker-socket-proxy`). 

Ce proxy (basé sur HAProxy) isole le socket réel et n'expose qu'un port TCP local (ex: `127.0.0.1:2375` ou réseau Docker privé) avec des règles d'accès extrêmement fines (via des variables d'environnement) et des restrictions d'API (ex: interdire les requêtes d'écriture ou de suppression si l'on souhaite un audit purement passif).

#### Schéma d'Architecture :
```text
                  +---------------------------------------------+
                  |                 Hôte Docker                 |
                  |                                             |
                  |  [ docker.sock ] (Fichier Socket Réel)      |
                  |         |                                   |
                  |         v (Montage local uniquement)        |
                  |  +------------------------------+           |
                  |  |  docker-socket-proxy         |           |
                  |  |  (HAProxy sécurisé)          |           |
                  |  +------------------------------+           |
                  |         |                                   |
                  |         v (Réseau privé / API restreinte)   |
                  |  +------------------------------+           |
                  |  |  SafeDock Backend            |           |
                  |  |  (Pas d'accès direct socket) |           |
                  |  +------------------------------+           |
                  +---------------------------------------------+
```

### ⚙️ Déploiement Sécurisé avec Docker Compose

Voici le fichier `docker-compose.yml` recommandé pour déployer SafeDock en production de manière hautement sécurisée :

```yaml
version: '3.8'

services:
  # 1. Le Proxy de Socket Docker (Isolateur et Filtrage API)
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    container_name: safedock-docker-proxy
    privileged: false
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Lecture seule sur le socket réel
    environment:
      # --- CONFIGURATION DU FILTRAGE API ---
      - CONTAINERS=1   # Autorise SafeDock à lister et inspecter les conteneurs
      - IMAGES=1       # Autorise SafeDock à inspecter et puller les images
      - NETWORKS=1     # Autorise la lecture des réseaux
      - VOLUMES=1      # Autorise la lecture des volumes
      - POST=0         # MVP : Bloque TOUTES les écritures/créations de conteneurs (Audit passif)
                       # Pour permettre le déploiement actif (Module A), passez à 1 temporairement
                       # en veillant à restreindre les accès réseau à SafeDock.
    networks:
      - safedock-net
    restart: unless-stopped
    # Rend le proxy inaccessible depuis l'extérieur de l'hôte
    ports:
      - "127.0.0.1:2375:2375"

  # 2. L'Application SafeDock (Aucun accès direct au socket hôte)
  safedock:
    image: safedock:latest
    container_name: safedock-app
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - DOCKER_HOST=tcp://docker-proxy:2375  # Se connecte via le proxy filtré
      - TRIVY_CACHE_DIR=/tmp/trivy-cache      # Cache de vulnérabilités
    depends_on:
      - docker-proxy
    networks:
      - safedock-net
    ports:
      - "8080:8080"
    restart: unless-stopped

networks:
  safedock-net:
    driver: bridge
    internal: true # Réseau isolé sans accès vers l'extérieur pour le proxy
```

---

## 🚀 Démarrage Rapide (MVP)

### Prérequis
- [Go (Golang)](https://golang.org/doc/install) v1.22+ installé localement.
- [Docker](https://docs.docker.com/get-docker/) opérationnel.

### Initialisation locale (sans Docker)
1. **Initialiser le module Go et télécharger les dépendances :**
   ```bash
   go mod tidy
   ```

2. **Lancer le backend de démonstration localement :**
   Le script va se connecter à votre socket local (ou via la variable `DOCKER_HOST` si définie), lister vos conteneurs actifs en analysant leur profil de sécurité, puis exécuter un scan de test Trivy.
   ```bash
   go run cmd/safedock/main.go
   ```

### Build et Exécution via Docker
1. **Construire l'image SafeDock :**
   ```bash
   docker build -t safedock:latest .
   ```
2. **Lancer l'environnement sécurisé :**
   ```bash
   docker compose up -d
   ```

---

## 🔐 Authentification & contrôle d'accès (IAM/RBAC)

* **Comptes multi-utilisateurs.** L'**adresse e-mail** sert d'identifiant de connexion ; identité affichée = prénom + nom.
* **Rôles** appliqués côté serveur :
  * `admin` — administration complète (comptes, hôtes, tags, configuration, mises à jour) ;
  * `auditor` — consultation + lancement de scans, sans mise à jour ni administration ;
  * `viewer` — lecture seule.
* **MFA TOTP obligatoire** pour chaque compte (compatible Google/Microsoft Authenticator) + **codes de secours** à usage unique.
* **Portées (scoping)** : on peut restreindre la visibilité d'un compte à un ensemble de **tags** et/ou d'**hôtes** ; un admin voit tout.
* **Premier démarrage** : si aucun mot de passe n'est fourni, un mot de passe administrateur aléatoire est **généré et affiché dans les logs** (`docker logs`).

### Variables d'environnement utiles
| Variable | Rôle |
|---|---|
| `SAFEDOCK_AUTH_PASSWORD` | Définit/réinitialise le mot de passe du compte `admin` (sinon généré aléatoirement au 1er démarrage). |
| `SAFEDOCK_RESET_MFA` | `true` → réinitialise le MFA de l'admin (récupération en cas de perte du téléphone). |
| `SAFEDOCK_TLS_ENABLED` | `true` → active le HTTPS natif (certificat fourni ou auto-signé persistant). |
| `SAFEDOCK_TLS_HOSTS` | Noms/IP inclus dans le certificat auto-signé. |
| `SAFEDOCK_SECRET_KEY` | Clé maître (base64, 32 octets) pour le chiffrement des secrets ; sinon persistée dans `secret.key`. |
| `SAFEDOCK_DB_PATH` | Emplacement de la base SQLite (par défaut `/var/lib/safedock/safedock.db`). |
| `SAFEDOCK_RESCAN_INTERVAL_HOURS` | Intervalle du re-scan complet (défaut : 24 h). |

> ⚠️ La base SQLite et la clé maître doivent être **persistées** (volume) : elles contiennent les comptes et permettent de vérifier les mots de passe. Sans volume, un nouveau compte admin est régénéré à chaque redéploiement.

---

## 🛠️ Stack Technique & Outils SecOps
* **Backend :** Go (Golang) + Docker SDK officiel, base **SQLite** (pure Go, sans CGO).
* **Frontend :** React + Vite (servi en statique, embarqué dans le binaire).
* **Sécurité :** chiffrement des secrets AES-256-GCM, sessions signées (HMAC), MFA TOTP, RBAC appliqué côté serveur.
* **Outils SecOps tiers embarqués dans l'image :**
  * **Trivy** et **Grype :** scanners de vulnérabilités (CVE).
  * **Dockle :** analyseur de conformité de structure d'image.

---

## ⚖️ Licence
Ce projet est sous licence [MIT](LICENSE).
