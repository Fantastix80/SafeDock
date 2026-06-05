package api

import (
	"context"
	"crypto/tls"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/auth"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/tlsx"
	"github.com/safedock/safedock/internal/web"
)

// Server gère le cycle de vie du serveur web et de l'API REST de SafeDock.
type Server struct {
	cfg  *config.Config
	port int
}

// NewServer initialise le serveur HTTP d'API.
func NewServer(cfg *config.Config) *Server {
	// Récupère le port d'écoute (par défaut 8080)
	portStr := os.Getenv("SAFEDOCK_PORT")
	if portStr == "" {
		portStr = "8080"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 8080
	}

	return &Server{
		cfg:  cfg,
		port: port,
	}
}

// Start lance le serveur HTTP d'API REST.
func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()

	// 0. Routes d'authentification (publiques : indispensables à l'écran de connexion)
	mux.HandleFunc("/api/login", auth.HandleLogin)
	mux.HandleFunc("/api/login/verify", auth.HandleLoginVerify)
	mux.HandleFunc("/api/logout", auth.HandleLogout)
	mux.HandleFunc("/api/session", auth.HandleSession)
	mux.HandleFunc("/api/account/password", auth.HandleChangePassword)
	mux.HandleFunc("/api/account/profile", auth.HandleUpdateProfile)

	// 1. Enregistrement des routes de l'API REST (protégées par le middleware d'auth)
	mux.HandleFunc("/api/containers", s.HandleContainers)
	mux.HandleFunc("/api/containers/history", s.HandleContainerHistory)
	mux.HandleFunc("/api/containers/settings", s.HandleContainersSettings)
	mux.HandleFunc("/api/containers/settings/delete", s.HandleContainersSettingsDelete)
	mux.HandleFunc("/api/containers/", s.HandleSingleContainerSubRoutes)
	mux.HandleFunc("/api/config", s.HandleConfig)
	mux.HandleFunc("/api/registries", s.HandleRegistries)
	mux.HandleFunc("/api/registries/delete", s.HandleRegistriesDelete)
	mux.HandleFunc("/api/audit-logs", s.HandleAuditLogs)
	mux.HandleFunc("/api/audit/image", s.HandleAuditImage)
	mux.HandleFunc("/api/exceptions", s.HandleExceptions)
	mux.HandleFunc("/api/exceptions/delete", s.HandleExceptionsDelete)
	mux.HandleFunc("/api/hosts", s.HandleHosts)
	mux.HandleFunc("/api/hosts/delete", s.HandleHostsDelete)
	mux.HandleFunc("/api/hosts/test", s.HandleHostTest)
	mux.HandleFunc("/api/hosts/provision-script", s.HandleHostProvision)

	// Gestion des comptes (admin) et RBAC
	mux.HandleFunc("/api/users", s.HandleUsers)
	mux.HandleFunc("/api/users/delete", s.HandleUsersDelete)
	mux.HandleFunc("/api/users/password", s.HandleUserPassword)
	mux.HandleFunc("/api/users/reset-mfa", s.HandleUserResetMFA)
	mux.HandleFunc("/api/users/role", s.HandleUserRole)
	mux.HandleFunc("/api/users/scope", s.HandleUserScope)

	// Tags + associations conteneur
	mux.HandleFunc("/api/tags", s.HandleTags)
	mux.HandleFunc("/api/tags/delete", s.HandleTagsDelete)
	mux.HandleFunc("/api/tags/assignments", s.HandleTagAssignments)

	// Journal d'audit de sécurité + notifications applicatives
	mux.HandleFunc("/api/audit/security", s.HandleSecurityAudit)
	mux.HandleFunc("/api/notifications", s.HandleNotifications)

	// Identité SSH SafeDock (clé publique à installer sur les hôtes ssh://)
	mux.HandleFunc("/api/ssh-identity", s.HandleSSHIdentity)

	// Sauvegardes de la base (admin) : liste/création, config, suppression, téléchargement
	mux.HandleFunc("/api/backups", s.HandleBackups)
	mux.HandleFunc("/api/backups/config", s.HandleBackupsConfig)
	mux.HandleFunc("/api/backups/delete", s.HandleBackupsDelete)
	mux.HandleFunc("/api/backups/download", s.HandleBackupDownload)

	// 2. Enregistrement du point d'entrée pour les fichiers statiques de l'UI
	// On extrait le sous-répertoire "static" de notre système de fichiers embarqué
	staticSubFS, err := fs.Sub(web.StaticFiles, "static")
	if err != nil {
		return fmt.Errorf("impossible d'initialiser les fichiers statiques embarqués : %w", err)
	}
	
	// Montage du serveur de fichiers statiques à la racine '/' avec fallback pour SPA
	fileServer := http.FileServer(http.FS(staticSubFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Ne pas toucher aux requêtes d'API
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		// Nettoyer le chemin pour vérifier l'existence dans l'embedded FS
		filePath := strings.TrimPrefix(r.URL.Path, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		// Vérifier si le fichier existe
		f, err := staticSubFS.Open(filePath)
		if err != nil {
			// Si le fichier n'existe pas, on redirige vers index.html pour laisser le routeur React gérer le chemin
			r.URL.Path = "/"
		} else {
			f.Close()
		}

		fileServer.ServeHTTP(w, r)
	})

	// 3. Configuration et lancement du serveur HTTP
	addr := fmt.Sprintf(":%d", s.port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           securityMiddleware(auth.Middleware(mux)), // Auth + en-têtes de sécurité
		ReadHeaderTimeout: 10 * time.Second,                         // Protection contre les attaques Slowloris (G112)
	}

	// Gestion de l'arrêt propre
	go func() {
		<-ctx.Done()
		log.Println("🛑 Arrêt propre du serveur d'API REST en cours...")
		_ = srv.Shutdown(context.Background())
	}()

	// Activation optionnelle du TLS natif (HTTPS sans reverse-proxy).
	tlsEnabled, _ := strconv.ParseBool(os.Getenv("SAFEDOCK_TLS_ENABLED"))
	if tlsEnabled {
		auth.SetSecureCookies(true)
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}

		certFile := os.Getenv("SAFEDOCK_TLS_CERT")
		keyFile := os.Getenv("SAFEDOCK_TLS_KEY")

		log.Printf("🔒 Serveur SafeDock démarré en HTTPS sur https://localhost:%d\n", s.port)
		log.Println("🛡️  Tableau de bord de sécurité disponible sur votre navigateur !")

		// Certificat fourni par l'administrateur, sinon auto-signé persistant.
		if certFile != "" && keyFile != "" {
			if err := srv.ListenAndServeTLS(certFile, keyFile); err != http.ErrServerClosed {
				return fmt.Errorf("erreur d'exécution du serveur HTTPS : %w", err)
			}
			return nil
		}

		hosts := splitAndTrim(os.Getenv("SAFEDOCK_TLS_HOSTS"))
		cert, err := tlsx.EnsureSelfSigned(db.DBDir(), hosts)
		if err != nil {
			return fmt.Errorf("impossible d'initialiser le certificat TLS : %w", err)
		}
		srv.TLSConfig.Certificates = []tls.Certificate{cert}
		log.Println("ℹ️  Certificat auto-signé (acceptez l'exception dans le navigateur, ou fournissez SAFEDOCK_TLS_CERT/KEY).")

		if err := srv.ListenAndServeTLS("", ""); err != http.ErrServerClosed {
			return fmt.Errorf("erreur d'exécution du serveur HTTPS : %w", err)
		}
		return nil
	}

	log.Printf("🚀 Serveur d'API REST SafeDock démarré sur http://localhost:%d\n", s.port)
	log.Println("🛡️  Tableau de bord de sécurité disponible sur votre navigateur !")
	log.Println("⚠️  TLS désactivé : activez SAFEDOCK_TLS_ENABLED=true ou placez la console derrière un reverse-proxy TLS.")

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return fmt.Errorf("erreur d'exécution du serveur HTTP : %w", err)
	}

	return nil
}

// splitAndTrim découpe une liste séparée par des virgules en éléments nettoyés.
func splitAndTrim(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// securityMiddleware applique des en-têtes de sécurité et une politique same-origin.
// L'UI étant servie depuis la même origine que l'API, aucun CORS permissif n'est nécessaire :
// on supprime ainsi le risque CSRF lié à l'ancien Access-Control-Allow-Origin: *.
func securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Durcissement standard du navigateur.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")

		// Aucune en-tête CORS permissive : les requêtes cross-origin sont implicitement refusées
		// par la politique same-origin du navigateur. Les pré-vols OPTIONS éventuels reçoivent 204.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
