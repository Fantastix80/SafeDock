package api

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/safedock/safedock/internal/config"
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

	// 1. Enregistrement des routes de l'API REST
	mux.HandleFunc("/api/containers", s.HandleContainers)
	mux.HandleFunc("/api/containers/settings", s.HandleContainersSettings)
	mux.HandleFunc("/api/containers/settings/delete", s.HandleContainersSettingsDelete)
	mux.HandleFunc("/api/containers/", s.HandleSingleContainerSubRoutes)
	mux.HandleFunc("/api/config", s.HandleConfig)
	mux.HandleFunc("/api/registries", s.HandleRegistries)
	mux.HandleFunc("/api/registries/delete", s.HandleRegistriesDelete)
	mux.HandleFunc("/api/audit-logs", s.HandleAuditLogs)

	// 2. Enregistrement du point d'entrée pour les fichiers statiques de l'UI
	// On extrait le sous-répertoire "static" de notre système de fichiers embarqué
	staticSubFS, err := fs.Sub(web.StaticFiles, "static")
	if err != nil {
		return fmt.Errorf("impossible d'initialiser les fichiers statiques embarqués : %w", err)
	}
	
	// Montage du serveur de fichiers statiques à la racine '/'
	fileServer := http.FileServer(http.FS(staticSubFS))
	mux.Handle("/", fileServer)

	// 3. Configuration et lancement du serveur HTTP
	addr := fmt.Sprintf(":%d", s.port)
	srv := &http.Server{
		Addr:    addr,
		Handler: corsMiddleware(mux), // Activation du middleware CORS pour faciliter le dev local
	}

	// Gestion de l'arrêt propre
	go func() {
		<-ctx.Done()
		log.Println("🛑 Arrêt propre du serveur HTTP d'API REST en cours...")
		_ = srv.Shutdown(context.Background())
	}()

	log.Printf("🚀 Serveur d'API REST SafeDock démarré sur http://localhost:%d\n", s.port)
	log.Println("🛡️  Tableau de bord de sécurité disponible sur votre navigateur !")
	
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return fmt.Errorf("erreur d'exécution du serveur HTTP : %w", err)
	}

	return nil
}

// corsMiddleware ajoute les en-têtes CORS nécessaires aux réponses HTTP.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
