package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/safedock/safedock/internal/api"
	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/crypto"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/docker"
	"github.com/safedock/safedock/internal/scheduler"
)

func main() {
	fmt.Println("==================================================")
	fmt.Println("🛡️  SafeDock - SecOps Gatekeeper & REST API Server")
	fmt.Println("==================================================")
	fmt.Println("Initialisation et audit de démarrage en cours...")

	// 1. Initialisation de la base de données SQLite (sans CGO)
	_, err := db.InitDB("")
	if err != nil {
		log.Fatalf("❌ ÉCHEC INITIALISATION BASE DE DONNÉES : %v\n", err)
	}

	// 1b. Initialisation du socle cryptographique (clé maître persistée à côté de la DB).
	// Doit précéder tout chiffrement de secret (config) et toute opération d'auth.
	if err := crypto.Init(db.DBDir()); err != nil {
		log.Fatalf("❌ ÉCHEC INITIALISATION CRYPTO : %v\n", err)
	}

	// 1c. Récupération d'urgence MFA : si SAFEDOCK_RESET_MFA=true, on réinitialise le
	// second facteur de l'admin (perte de l'authentificateur). Un lien d'activation
	// est ré-émis par le bootstrap ci-dessous.
	if v, _ := strconv.ParseBool(os.Getenv("SAFEDOCK_RESET_MFA")); v {
		if err := auth.ResetAdminMFA(); err != nil {
			log.Printf("⚠️  Réinitialisation MFA admin impossible : %v\n", err)
		} else {
			log.Println("🔓 MFA de l'admin réinitialisé (SAFEDOCK_RESET_MFA).")
		}
	}

	// 1d. Bootstrap admin (modèle invitation) : tant que l'admin n'est pas activé,
	// un lien d'activation (mot de passe + MFA) est journalisé. Aucun mot de passe
	// n'est écrit dans les logs. SAFEDOCK_AUTH_PASSWORD réinitialise un admin actif.
	adminBaseURL := db.GetBaseURL()
	if adminBaseURL == "" {
		adminBaseURL = os.Getenv("SAFEDOCK_BASE_URL")
	}
	if err := auth.EnsureAdminBootstrap(os.Getenv("SAFEDOCK_AUTH_PASSWORD"), adminBaseURL); err != nil {
		log.Fatalf("❌ ÉCHEC CONFIGURATION AUTHENTIFICATION : %v\n", err)
	}

	// 2. Chargement de la configuration
	cfg := config.LoadConfig()
	fmt.Println("\n⚙️  Configuration SecOps active :")
	fmt.Printf("   ├─ Seuil de tolérance CVE : %s\n", cfg.SecOps.MaxSeverityAllowed)
	fmt.Printf("   ├─ Autoriser Root         : %t\n", cfg.SecOps.AllowRoot)
	fmt.Printf("   ├─ Autoriser Privilégié   : %t\n", cfg.SecOps.AllowPrivileged)
	if cfg.SMTP.Host != "" {
		fmt.Printf("   └─ Notificateur Email     : Activé (Serveur: %s:%d, Dest: %s)\n", cfg.SMTP.Host, cfg.SMTP.Port, cfg.SMTP.To)
	} else {
		fmt.Printf("   └─ Notificateur Email     : Désactivé (SAFEDOCK_SMTP_HOST non configuré)\n")
	}

	// 2. Initialisation et test du client Docker
	fmt.Print("\n🔌 Connexion au démon Docker... ")
	auditor, err := docker.NewDockerAuditor()
	if err != nil {
		fmt.Printf("❌ ÉCHEC\nErreur : %v\n", err)
		fmt.Println("\n💡 Conseil de Sécurité :")
		fmt.Println("Assurez-vous que Docker tourne et que vos variables d'environnement")
		fmt.Println("(ex: DOCKER_HOST ou accès à /var/run/docker.sock) sont correctement configurées.")
		os.Exit(1)
	}
	
	// Test rapide d'accès
	startupCtx, startupCancel := context.WithTimeout(context.Background(), 10*time.Second)
	containers, err := auditor.AuditContainers(startupCtx)
	startupCancel()
	auditor.Close()

	if err != nil {
		fmt.Printf("❌ ÉCHEC DE L'AUDIT INITIAL\nErreur : %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ CONNECTÉ")
	fmt.Printf("📊 %d conteneurs trouvés lors de l'audit de démarrage.\n", len(containers))

	// Logs des conteneurs pour information
	for _, c := range containers {
		status := "✅ Sain"
		if c.IsPrivileged || c.IsRoot || len(c.SecretLeaks) > 0 || !c.TagPinned {
			status = "🚨 Risque Détecté"
		}
		fmt.Printf("   ├─ %s (Image: %s, Statut: %s)\n", c.Name, strings.Split(c.ImageName, "/")[len(strings.Split(c.ImageName, "/"))-1], status)
	}

	// 3. Configuration du Contexte pour Graceful Shutdown (Arrêt propre)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 3b. Supervision continue : re-scans périodiques + détection de dérive de vulnérabilités.
	scheduler.New().Start(ctx)

	// 4. Lancement du serveur API REST & Dashboard Web
	server := api.NewServer(cfg)

	fmt.Println("\n==================================================")
	fmt.Println("⚡ Démarrage du Démon Persistant SafeDock...")
	fmt.Println("==================================================")

	if err := server.Start(ctx); err != nil {
		log.Fatalf("❌ ÉCHEC CRITIQUE : Impossible de démarrer le serveur API REST : %v\n", err)
	}

	fmt.Println("\n==================================================")
	fmt.Println("🛡️  SafeDock s'est arrêté proprement. À bientôt !")
	fmt.Println("==================================================")
}
