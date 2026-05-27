# ==========================================
# STAGE 0 : Build du frontend React/Vite
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/internal/web/frontend

# Copie des manifestes de dépendances en premier (cache Docker optimisé)
COPY internal/web/frontend/package*.json ./

# Installation des dépendances npm
RUN npm install --no-audit

# Copie du reste des sources frontend
COPY internal/web/frontend/ ./

# Build Vite → output dans ../static (= internal/web/static, configuré dans vite.config.js)
RUN npm run build

# ==========================================
# STAGE 1 : Build du binaire Go
# ==========================================
FROM golang:1.23-alpine AS builder

# Installation des certificats et outils de compilation indispensables
RUN apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

# Copie de tout le code source
COPY . .

# Injection des assets frontend fraîchement buildés dans le répertoire embed Go
COPY --from=frontend-builder /app/internal/web/static/ ./internal/web/static/

# Résolution des dépendances et téléchargement (avec tous les fichiers .go présents)
RUN go mod tidy

# Compilation statique du binaire Go pour maximiser la sécurité et la portabilité
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o bin/safedock \
    cmd/safedock/main.go

# ==========================================
# STAGE 2 : Image finale sécurisée (SecOps)
# ==========================================
FROM alpine:3.19

# Définition des versions des outils SecOps pour la reproductibilité et la sécurité
ENV DOCKLE_VERSION="0.4.14"

# 1. Installation des dépendances systèmes légères
RUN apk add --no-cache \
    ca-certificates \
    curl \
    bash \
    tar \
    git \
    && update-ca-certificates

# 2. Installation de TRIVY depuis le dépôt officiel de test d'Alpine Edge
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing trivy

# 3. Téléchargement et installation de GRYPE CLI (Anchore)
RUN curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

# 3b. Téléchargement et installation sécurisée de DOCKLE CLI
RUN wget -O dockle.tar.gz https://github.com/goodwithtech/dockle/releases/download/v${DOCKLE_VERSION}/dockle_${DOCKLE_VERSION}_Linux-64bit.tar.gz \
    && tar zxf dockle.tar.gz \
    && mv dockle /usr/local/bin/dockle \
    && chmod +x /usr/local/bin/dockle \
    && rm -rf dockle.tar.gz

# 4. Création d'un utilisateur d'exécution non-root (sécurité de l'hôte)
# UID 10001 est utilisé pour éviter les conflits standards
RUN addgroup -g 10001 safedock \
    && adduser -u 10001 -G safedock -h /home/safedock -D safedock

# 5. Configuration des répertoires et permissions de cache SecOps
RUN mkdir -p /home/safedock/.cache/trivy \
    && mkdir -p /home/safedock/.cache/dockle \
    && mkdir -p /home/safedock/.cache/grype \
    && chown -R safedock:safedock /home/safedock

# 6. Copie du binaire SafeDock depuis le builder
COPY --from=builder /app/bin/safedock /usr/local/bin/safedock
RUN chmod +x /usr/local/bin/safedock

# Définition des variables d'environnement de cache
ENV TRIVY_CACHE_DIR="/home/safedock/.cache/trivy"
ENV GRYPE_DB_CACHE_DIR="/home/safedock/.cache/grype/db"

# Exposition du port d'API REST & Dashboard Web
EXPOSE 8080

# Changement vers l'utilisateur non-root pour l'exécution
USER safedock
WORKDIR /home/safedock

# Point d'entrée par défaut
ENTRYPOINT ["/usr/local/bin/safedock"]
