#!/bin/bash

# ==========================================================================
# SafeDock - Local Security & Code Quality Scanner
# Exécute golangci-lint (qualité) et gosec (sécurité) via des conteneurs éphémères.
# Prérequis : Docker fonctionnel.
# ==========================================================================

# Couleurs pour l'affichage console
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0;5m' # No Color
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${BOLD}==================================================${RESET}"
echo -e "${BOLD}🛡️  SafeDock - Audit Local de Qualité & SecOps${RESET}"
echo -e "${BOLD}==================================================${RESET}"

# 1. Vérification de la présence de Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Erreur : Docker n'est pas installé ou n'est pas dans le PATH.${RESET}"
    exit 1
fi

# 2. Exécution des tests unitaires locaux
echo -e "\n${BLUE}🧪 [1/3] Exécution de la suite de tests unitaires...${RESET}"
docker run --rm -v "$(pwd)":/app -w /app golang:1.23-alpine go test -v ./...
TEST_STATUS=$?
if [ $TEST_STATUS -ne 0 ]; then
    echo -e "${RED}❌ Échec des tests unitaires ! Corrigez les erreurs avant d'auditer le code.${RESET}"
    exit $TEST_STATUS
fi
echo -e "${GREEN}✅ Tests unitaires réussis avec succès !${RESET}"

# 3. Exécution du Linter de Qualité (golangci-lint)
echo -e "\n${BLUE}🔍 [2/3] Analyse de Qualité du Code avec golangci-lint...${RESET}"
echo -e "${YELLOW}Téléchargement et lancement du conteneur golangci-lint en cours (cela peut prendre quelques secondes)...${RESET}"

docker run --rm -v "$(pwd)":/app -w /app golangci/golangci-lint:v1.59-alpine golangci-lint run -v --timeout 5m
LINT_STATUS=$?

if [ $LINT_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ Code conforme aux standards de qualité golangci-lint !${RESET}"
else
    echo -e "${RED}❌ Des avertissements de qualité de code ont été détectés. Veuillez les corriger.${RESET}"
fi

# 4. Exécution du scanner de vulnérabilités SecOps (gosec)
echo -e "\n${BLUE}🔒 [3/3] Scan de Sécurité Statique (SAST) avec gosec...${RESET}"
echo -e "${YELLOW}Lancement du scanner AST gosec en cours...${RESET}"

# On exclut G104 (erreurs ignorées dans close/defer) et G304 (fichiers par variable pour la DB)
docker run --rm -v "$(pwd)":/app -w /app securego/gosec:2.19.0 -exclude=G104,G304 -fmt=text ./...
GOSEC_STATUS=$?

if [ $GOSEC_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ Aucune faille de sécurité détectée par gosec dans le code Go !${RESET}"
else
    echo -e "${RED}⚠️  Des vulnérabilités potentielles ont été détectées par gosec. Inspectez les rapports ci-dessus.${RESET}"
fi

echo -e "\n${BOLD}==================================================${RESET}"
if [ $TEST_STATUS -eq 0 ] && [ $LINT_STATUS -eq 0 ] && [ $GOSEC_STATUS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 TOUS LES FEUX SONT AU VERT ! Le code est prêt pour le push dev/master !${RESET}"
    exit 0
else
    echo -e "${RED}${BOLD}❌ ÉCHEC DE L'AUDIT DE QUALITÉ ! Corrigez les points listés ci-dessus.${RESET}"
    exit 1
fi
