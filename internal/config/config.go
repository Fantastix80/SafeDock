package config

import (
	"database/sql"
	"log"
	"os"
	"strconv"

	"github.com/safedock/safedock/internal/db"
)

// SMTPConfig contient la configuration du serveur SMTP pour les alertes.
type SMTPConfig struct {
	Host          string
	Port          int
	User          string
	Password      string
	From          string
	To            string
	TLSSkipVerify bool
}

// SecOpsConfig contient les seuils de tolérance et les règles d'évaluation SecOps.
type SecOpsConfig struct {
	MaxSeverityAllowed string // LOW, MEDIUM, HIGH, CRITICAL, NONE (NONE = bloque sur n'importe quelle CVE)
	AllowRoot          bool   // Autoriser ou non le démarrage de conteneurs tournant en root
	AllowPrivileged    bool   // Autoriser ou non le démarrage de conteneurs en mode privilégié
	SecopsScanner      string // trivy, grype, hybrid
}

// Config regroupe l'ensemble des configurations de SafeDock.
type Config struct {
	SMTP   SMTPConfig
	SecOps SecOpsConfig
}

// Global active configuration reference
var activeConfig *Config

// LoadConfig charge les variables d'environnement ou les paramètres SQLite et applique des valeurs par défaut.
func LoadConfig() *Config {
	// Si SQLite est déjà initialisé et contient des paramètres, on charge depuis la DB
	if db.GetDB() != nil {
		host, port, user, pass, from, to, skip, maxSev, allowRoot, allowPriv, scanner, err := db.GetSettings()
		if err == nil {
			activeConfig = &Config{
				SMTP: SMTPConfig{
					Host:          host,
					Port:          port,
					User:          user,
					Password:      pass,
					From:          from,
					To:            to,
					TLSSkipVerify: skip,
				},
				SecOps: SecOpsConfig{
					MaxSeverityAllowed: maxSev,
					AllowRoot:          allowRoot,
					AllowPrivileged:    allowPriv,
					SecopsScanner:      scanner,
				},
			}
			return activeConfig
		} else if err != sql.ErrNoRows {
			log.Printf("[CONFIG WARNING] Erreur lecture DB settings : %v, repli vers les variables d'env\n", err)
		}
	}

	// Repli vers les variables d'environnement (Default Env fallback)
	cfg := &Config{
		SMTP: SMTPConfig{
			Host:          getEnv("SAFEDOCK_SMTP_HOST", ""),
			Port:          getEnvAsInt("SAFEDOCK_SMTP_PORT", 587),
			User:          getEnv("SAFEDOCK_SMTP_USER", ""),
			Password:      getEnv("SAFEDOCK_SMTP_PASSWORD", ""),
			From:          getEnv("SAFEDOCK_SMTP_FROM", "alerts@safedock.local"),
			To:            getEnv("SAFEDOCK_SMTP_TO", ""),
			TLSSkipVerify: getEnvAsBool("SAFEDOCK_SMTP_TLS_SKIP_VERIFY", false),
		},
		SecOps: SecOpsConfig{
			MaxSeverityAllowed: getEnv("SAFEDOCK_MAX_SEVERITY_ALLOWED", "HIGH"), // HIGH par défaut (bloque sur CRITICAL)
			AllowRoot:          getEnvAsBool("SAFEDOCK_ALLOW_ROOT", true),       // Root toléré par défaut
			AllowPrivileged:    getEnvAsBool("SAFEDOCK_ALLOW_PRIVILEGED", false), // Privilégié bloqué par défaut
			SecopsScanner:      getEnv("SAFEDOCK_SECOPS_SCANNER", "trivy"),
		},
	}

	// Si la DB est en ligne mais vide, on y insère les paramètres Env pour l'initialisation
	if db.GetDB() != nil {
		err := db.SaveSettings(
			cfg.SMTP.Host, cfg.SMTP.Port, cfg.SMTP.User, cfg.SMTP.Password, cfg.SMTP.From, cfg.SMTP.To, cfg.SMTP.TLSSkipVerify,
			cfg.SecOps.MaxSeverityAllowed, cfg.SecOps.AllowRoot, cfg.SecOps.AllowPrivileged, cfg.SecOps.SecopsScanner,
		)
		if err != nil {
			log.Printf("[CONFIG WARNING] Impossible d'enregistrer la config initiale en DB : %v\n", err)
		} else {
			log.Println("📝 Configuration par défaut persistée en base de données avec succès.")
		}
	}

	activeConfig = cfg
	return activeConfig
}

// ReloadConfig force le rechargement à chaud des configurations depuis la base de données.
func ReloadConfig() *Config {
	return LoadConfig()
}

// Fonctions utilitaires d'extraction
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := getEnv(key, "")
	if value, err := strconv.ParseBool(valueStr); err == nil {
		return value
	}
	return defaultValue
}
