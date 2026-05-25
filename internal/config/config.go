package config

import (
	"os"
	"strconv"
)

// SMTPConfig contient la configuration du serveur SMTP pour les alertes.
type SMTPConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	From            string
	To              string
	TLSSkipVerify   bool
}

// SecOpsConfig contient les seuils de tolérance et les règles d'évaluation SecOps.
type SecOpsConfig struct {
	MaxSeverityAllowed string // LOW, MEDIUM, HIGH, CRITICAL, NONE (NONE = bloque sur n'importe quelle CVE)
	AllowRoot          bool   // Autoriser ou non le démarrage de conteneurs tournant en root
	AllowPrivileged    bool   // Autoriser ou non le démarrage de conteneurs en mode privilégié
}

// Config regroupe l'ensemble des configurations de SafeDock.
type Config struct {
	SMTP   SMTPConfig
	SecOps SecOpsConfig
}

// LoadConfig charge les variables d'environnement et applique des valeurs par défaut sécurisées.
func LoadConfig() *Config {
	return &Config{
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
		},
	}
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
