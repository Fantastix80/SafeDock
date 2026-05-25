# ==========================================
# STAGE 1 : Build du binaire Go
# ==========================================
FROM golang:1.23-alpine AS builder

# Installation des certificats et outils de compilation indispensables
RUN apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

# Copie de tout le code source
COPY . .

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

# 3. Téléchargement et installation sécurisée de DOCKLE CLI
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
    && chown -R safedock:safedock /home/safedock

# 6. Copie du binaire SafeDock depuis le builder
COPY --from=builder /app/bin/safedock /usr/local/bin/safedock
RUN chmod +x /usr/local/bin/safedock

# Définition des variables d'environnement de cache
ENV TRIVY_CACHE_DIR="/home/safedock/.cache/trivy"

# Changement vers l'utilisateur non-root pour l'exécution
USER safedock
WORKDIR /home/safedock

# Point d'entrée par défaut
ENTRYPOINT ["/usr/local/bin/safedock"]
