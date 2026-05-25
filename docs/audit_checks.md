# Catalogue des Contrôles d'Audit de Sécurité de SafeDock 🛡️🔍

Ce document décrit en détail les tests de sécurité et de conformité SecOps effectués par SafeDock lors de l'audit continu (Module B) et du pipeline de staging (Module A). 

Pour chaque contrôle, vous trouverez le motif de menace, le mode de détection dans le code Go, et les recommandations de remédiation.

---

## 📌 Sommaire des Contrôles
1. [Immuabilité et Image Tag Pinning](#1-immuabilité-et-image-tag-pinning)
2. [Analyse des Privilèges d'Exécution (Privileged Mode)](#2-analyse-des-privilèges-dexécution-privileged-mode)
3. [Exécution sous l'Utilisateur Root](#3-exécution-sous-lutilisateur-root)
4. [Partages de Volumes et Répertoires Sensibles](#4-partages-de-volumes-et-répertoires-sensibles)
5. [Fuite de Secrets dans l'Environnement](#5-fuite-de-secrets-dans-lenvironnement)

---

## 1. Immuabilité et Image Tag Pinning

### 📝 Description du Test
SafeDock vérifie si l'image utilisée par un conteneur est figée sur une version précise (ex: `:1.25.1` ou via un Digest) ou si elle utilise un tag muable et dynamique (ex: `:latest`, `:dev`, `:main`, `:nightly`).

### 🚨 Risque SecOps & Menace
Les tags comme `:latest` sont **muables**. Si le registre distant est compromis ou si un attaquant parvient à pousser une image malveillante sur un tag existant (attaque par empoisonnement de tag), votre infrastructure téléchargera et exécutera ce code malveillant au prochain redémarrage.
De plus, l'utilisation de tags dynamiques rend les déploiements imprévisibles et non reproductibles.

### 🔍 Détection par SafeDock
Le client Go extrait le nom de l'image du conteneur et analyse le suffixe après le séparateur `:` :
* Si le tag est absent, égal à `latest`, `dev`, `master`, `main` ou `nightly`, SafeDock lève une **Alerte de Tag non Figé** 🚨.
* Si le conteneur tourne avec une version stable (ex: `1.25.1`), il est validé ✅.
* L'objectif ultime de SafeDock est de forcer l'immuabilité absolue en déployant via le **Digest SHA256 unique** (`image@sha256:...`).

### 💡 Recommandation Corrective
Figez systématiquement vos images sur des versions précises dans vos fichiers Docker Compose, et laissez le cycle de vie de SafeDock les migrer de manière transactionnelle vers des **Digests uniques** après validation SecOps.

---

## 2. Analyse des Privilèges d'Exécution (Privileged Mode)

### 📝 Description du Test
SafeDock inspecte les paramètres système du conteneur pour détecter si le drapeau `--privileged` a été activé au démarrage.

### 🚨 Risque SecOps & Menace
Le mode privilégié `--privileged` désactive toutes les barrières de sécurité et d'isolation de Docker. Le conteneur obtient un accès presque direct aux périphériques physiques de la machine hôte. Si un attaquant parvient à exécuter du code dans ce conteneur, **il peut s'échapper instantanément et prendre le contrôle total du serveur Proxmox / Hôte Linux**.

### 🔍 Détection par SafeDock
SafeDock interroge le paramètre `HostConfig.Privileged` retourné par l'API Docker :
```go
isPrivileged := inspect.HostConfig.Privileged
```
Si cette valeur est égale à `true`, SafeDock lève immédiatement une **Alerte Rouge Critique** 🚨.

### 💡 Recommandation Corrective
N'utilisez jamais le mode `--privileged` en production. Si votre conteneur a besoin d'accès spécifiques, accordez-lui uniquement les capacités Linux nécessaires via l'instruction `--cap-add` (ex: `--cap-add=NET_ADMIN` pour manipuler le réseau de manière restreinte).

---

## 3. Exécution sous l'Utilisateur Root

### 📝 Description du Test
SafeDock vérifie l'identité de l'utilisateur (UID) exécutant les processus à l'intérieur du conteneur.

### 🚨 Risque SecOps & Menace
Par défaut, si aucun utilisateur n'est spécifié dans le `Dockerfile` (via l'instruction `USER`) ou lors du démarrage, le conteneur s'exécute en tant que `root` (UID 0). Si un attaquant parvient à exploiter une faille applicative, il obtient les droits `root` dans le conteneur. Combiné avec un montage sensible ou une faille du noyau, cela rend l'échappement vers l'hôte extrêmement facile.

### 🔍 Détection par SafeDock
SafeDock analyse le champ `Config.User` retourné par l'inspection Docker :
* Si le champ est vide, égal à `root`, `0`, ou commence par `0:`, le conteneur est marqué comme s'exécutant en **Root** 🚨.
* Dans notre propre `Dockerfile`, nous résolvons cela en créant et en forçant l'utilisateur non-privilégié `safedock` (UID 10001) :
```dockerfile
USER safedock
```

### 💡 Recommandation Corrective
Ajoutez toujours une instruction `USER 10001:10001` (ou un utilisateur non-root dédié) à la fin de vos Dockerfiles pour respecter le principe du moindre privilège.

---

## 4. Partages de Volumes et Répertoires Sensibles

### 📝 Description du Test
SafeDock analyse tous les points de montage (volumes et liaisons de dossiers de l'hôte) configurés sur le conteneur.

### 🚨 Risque SecOps & Menace
Le montage de dossiers critiques de l'hôte (tels que `/etc`, `/var`, `/root`, `/` ou le socket Docker `/var/run/docker.sock`) dans un conteneur est extrêmement dangereux. 
* Un montage en écriture sur `/etc` permet à un conteneur de modifier les mots de passe de l'hôte.
* Un montage sur `/var/run/docker.sock` équivaut à donner les droits `root` complets sur l'hôte, car le conteneur peut alors piloter le démon Docker pour instancier d'autres conteneurs malveillants privilégiés.

### 🔍 Détection par SafeDock
SafeDock parse la liste `inspect.Mounts` et la compare à un dictionnaire de chemins système hautement sensibles de l'hôte. Si une correspondance est trouvée, il signale un **Partage Sensible Détecté** ⚠️ et indique si le partage est en écriture (`true`) ou en lecture seule (`false`).

### 💡 Recommandation Corrective
Isolez strictement vos conteneurs. Si l'accès au socket Docker est obligatoire, n'autorisez jamais son montage direct. **Utilisez notre Proxy de Socket Sécurisé (`tecnativa/docker-socket-proxy`)** configuré en lecture seule (`POST=0`) sur un sous-réseau isolé pour filtrer les requêtes.

---

## 5. Fuite de Secrets dans l'Environnement

### 📝 Description du Test
SafeDock effectue un scan statique de toutes les variables d'environnement actives dans la configuration d'exécution du conteneur.

### 🚨 Risque SecOps & Menace
Passer des mots de passe de base de données, des clés API ou des tokens d'authentification directement dans les variables d'environnement (`docker run -e PASSWORD=...`) est une faille SecOps majeure. Ces variables apparaissent en clair dans les logs d'orchestration, dans l'historique shell de l'hôte, et pour n'importe quel utilisateur ou processus capable d'exécuter un simple `docker inspect` sur la machine.

### 🔍 Détection par SafeDock
SafeDock parse la liste des variables d'environnement `inspect.Config.Env` à la recherche de clés contenant des motifs sensibles (tels que `PASSWORD`, `SECRET`, `API_KEY`, `TOKEN`). 
* Pour éviter d'exposer de nouveau ces données dans ses propres rapports de sécurité, **SafeDock masque la valeur** (obfuscation) en ne conservant que les 2 premiers caractères suivis d'astérisques (ex: `my***`).

### 💡 Recommandation Corrective
N'écrivez jamais de secrets en clair dans vos variables d'environnement. Utilisez des **Secrets Docker**, des fichiers de configuration montés en lecture seule à accès restreint (ex: `/run/secrets/db_password`) ou un coffre-fort de secrets (comme HashiCorp Vault) pour injecter les identifiants au démarrage du processus de manière sécurisée en mémoire.
