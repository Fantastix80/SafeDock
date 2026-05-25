package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	// Pilote SQLite pure Go sans CGO
	_ "github.com/glebarez/go-sqlite"
)

var (
	globalDB   *sql.DB
	globalDBMu sync.Mutex
)

// AuditLog représente un enregistrement d'historique SecOps ou de rollout.
type AuditLog struct {
	ID            int       `json:"id"`
	Timestamp     time.Time `json:"timestamp"`
	ContainerName string    `json:"container_name"`
	ContainerID   string    `json:"container_id"`
	Image         string    `json:"image"`
	Status        string    `json:"status"` // SUCCESS, BLOCKED, FAILED
	Reason        string    `json:"reason"`
	CVECritical   int       `json:"cve_critical"`
	CVEHigh       int       `json:"cve_high"`
	CVEMedium     int       `json:"cve_medium"`
}

// RegistryCreds stocke les identifiants d'accès à un registre privé.
type RegistryCreds struct {
	ID            int    `json:"id"`
	ServerAddress string `json:"server_address"` // e.g. "registry.gitlab.com"
	Username      string `json:"username"`
	Password      string `json:"password"`
}

// InitDB initialise le fichier de base de données SQLite et crée les tables.
func InitDB(dbPath string) (*sql.DB, error) {
	globalDBMu.Lock()
	defer globalDBMu.Unlock()

	if globalDB != nil {
		return globalDB, nil
	}

	if dbPath == "" {
		dbPath = os.Getenv("SAFEDOCK_DB_PATH")
	}
	if dbPath == "" {
		// Par défaut dans le dossier de données de Docker, sinon localement
		if _, err := os.Stat("/var/lib/safedock"); err == nil {
			dbPath = "/var/lib/safedock/safedock.db"
		} else {
			dbPath = "./safedock.db"
		}
	}

	// Création des répertoires parents si nécessaire
	dir := filepath.Dir(dbPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("impossible de créer le dossier de base de données : %w", err)
		}
	}

	log.Printf("💾 Base de données SQLite : %s\n", dbPath)

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("erreur ouverture SQLite : %w", err)
	}

	// Configuration des limites de connexions concurrentes SQLite
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := runMigrations(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("erreur lors des migrations SQL : %w", err)
	}

	globalDB = db
	return globalDB, nil
}

// GetDB retourne la connexion globale active à la base de données.
func GetDB() *sql.DB {
	return globalDB
}

// runMigrations crée les tables requises si elles n'existent pas.
func runMigrations(db *sql.DB) error {
	// 1. Table settings (Configuration persistante à chaud)
	settingsTable := `
	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		smtp_host TEXT,
		smtp_port INTEGER,
		smtp_user TEXT,
		smtp_password TEXT,
		smtp_from TEXT,
		smtp_to TEXT,
		smtp_tls_skip_verify BOOLEAN,
		secops_max_severity_allowed TEXT,
		secops_allow_root BOOLEAN,
		secops_allow_privileged BOOLEAN
	);`

	// 2. Table registries (Identifiants registres privés)
	registriesTable := `
	CREATE TABLE IF NOT EXISTS registries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_address TEXT UNIQUE,
		username TEXT,
		password TEXT
	);`

	// 3. Table audit_logs (Historique SecOps d'audits et de pivots)
	auditLogsTable := `
	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		container_name TEXT,
		container_id TEXT,
		image TEXT,
		status TEXT,
		reason TEXT,
		cve_critical INTEGER,
		cve_high INTEGER,
		cve_medium INTEGER
	);`

	// 4. Table container_settings (Surcharges de sécurité par conteneur)
	containerSettingsTable := `
	CREATE TABLE IF NOT EXISTS container_settings (
		container_name TEXT PRIMARY KEY,
		secops_max_severity_allowed TEXT DEFAULT "",
		secops_allow_root INTEGER DEFAULT -1,
		secops_allow_privileged INTEGER DEFAULT -1
	);`

	tables := []string{settingsTable, registriesTable, auditLogsTable, containerSettingsTable}
	for _, sqlStmt := range tables {
		_, err := db.Exec(sqlStmt)
		if err != nil {
			return fmt.Errorf("échec exécution migration : %w | requete : %s", err, sqlStmt)
		}
	}

	return nil
}

// ==========================================================================
// Operations Table : Settings (Configuration)
// ==========================================================================

// SaveSettings insère ou met à jour la configuration en DB (ligne unique ID=1).
func SaveSettings(
	smtpHost string, smtpPort int, smtpUser, smtpPassword, smtpFrom, smtpTo string, smtpTlsSkip bool,
	secopsMaxSev string, secopsAllowRoot, secopsAllowPrivileged bool,
) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	query := `
	INSERT INTO settings (
		id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_to, smtp_tls_skip_verify,
		secops_max_severity_allowed, secops_allow_root, secops_allow_privileged
	) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		smtp_host=excluded.smtp_host,
		smtp_port=excluded.smtp_port,
		smtp_user=excluded.smtp_user,
		smtp_password=CASE WHEN excluded.smtp_password <> '' THEN excluded.smtp_password ELSE settings.smtp_password END,
		smtp_from=excluded.smtp_from,
		smtp_to=excluded.smtp_to,
		smtp_tls_skip_verify=excluded.smtp_tls_skip_verify,
		secops_max_severity_allowed=excluded.secops_max_severity_allowed,
		secops_allow_root=excluded.secops_allow_root,
		secops_allow_privileged=excluded.secops_allow_privileged;`

	_, err := db.Exec(query,
		smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, smtpTo, smtpTlsSkip,
		secopsMaxSev, secopsAllowRoot, secopsAllowPrivileged,
	)
	return err
}

// GetSettingsSettings charge la ligne de configuration depuis la base de données.
// Retourne sql.ErrNoRows s'il n'y a aucun enregistrement.
func GetSettings() (
	smtpHost string, smtpPort int, smtpUser, smtpPassword, smtpFrom, smtpTo string, smtpTlsSkip bool,
	secopsMaxSev string, secopsAllowRoot, secopsAllowPrivileged bool, err error,
) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}

	query := `
	SELECT 
		smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_to, smtp_tls_skip_verify,
		secops_max_severity_allowed, secops_allow_root, secops_allow_privileged
	FROM settings WHERE id = 1;`

	err = db.QueryRow(query).Scan(
		&smtpHost, &smtpPort, &smtpUser, &smtpPassword, &smtpFrom, &smtpTo, &smtpTlsSkip,
		&secopsMaxSev, &secopsAllowRoot, &secopsAllowPrivileged,
	)
	return
}

// ==========================================================================
// Operations Table : Registries (Registres Privés)
// ==========================================================================

// SaveRegistry enregistre ou écrase les accès d'un registre Docker privé.
func SaveRegistry(server, username, password string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	query := `
	INSERT INTO registries (server_address, username, password)
	VALUES (?, ?, ?)
	ON CONFLICT(server_address) DO UPDATE SET
		username=excluded.username,
		password=CASE WHEN excluded.password <> '' THEN excluded.password ELSE registries.password END;`

	_, err := db.Exec(query, server, username, password)
	return err
}

// GetRegistries liste tous les comptes de registres enregistrés.
func GetRegistries() ([]RegistryCreds, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}

	rows, err := db.Query("SELECT id, server_address, username, password FROM registries;")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []RegistryCreds
	for rows.Next() {
		var reg RegistryCreds
		if err := rows.Scan(&reg.ID, &reg.ServerAddress, &reg.Username, &reg.Password); err != nil {
			return nil, err
		}
		list = append(list, reg)
	}
	return list, nil
}

// DeleteRegistry supprime les accès à un registre d'adresses donné.
func DeleteRegistry(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	_, err := db.Exec("DELETE FROM registries WHERE id = ?;", id)
	return err
}

// ==========================================================================
// Operations Table : Audit Logs (Historique)
// ==========================================================================

// WriteAuditLog enregistre une trace SecOps de rollout ou d'évaluation de conteneur.
func WriteAuditLog(containerName, containerID, image, status, reason string, crit, high, med int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	query := `
	INSERT INTO audit_logs (
		container_name, container_id, image, status, reason, cve_critical, cve_high, cve_medium
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`

	_, err := db.Exec(query, containerName, containerID, image, status, reason, crit, high, med)
	return err
}

// GetAuditLogs extrait l'historique complet, du plus récent au plus ancien.
func GetAuditLogs() ([]AuditLog, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}

	query := `
	SELECT id, timestamp, container_name, container_id, image, status, reason, cve_critical, cve_high, cve_medium
	FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 100;`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []AuditLog
	for rows.Next() {
		var l AuditLog
		var ts string
		err := rows.Scan(&l.ID, &ts, &l.ContainerName, &l.ContainerID, &l.Image, &l.Status, &l.Reason, &l.CVECritical, &l.CVEHigh, &l.CVEMedium)
		if err != nil {
			return nil, err
		}
		
		// Parsing du timestamp SQLite TEXT
		if parsed, err := time.Parse("2006-01-02 15:04:05", ts); err == nil {
			l.Timestamp = parsed
		} else if parsed, err := time.Parse(time.RFC3339, ts); err == nil {
			l.Timestamp = parsed
		}
		
		logs = append(logs, l)
	}
	return logs, nil
}

// ContainerSettings représente les surcharges de configuration de sécurité pour un conteneur donné.
type ContainerSettings struct {
	ContainerName      string `json:"container_name"`
	MaxSeverityAllowed string `json:"secops_max_severity_allowed"` // "", "LOW", "MEDIUM", "HIGH", "CRITICAL", "NONE"
	AllowRoot          *bool  `json:"secops_allow_root"`           // nil pour utiliser global, sinon bool
	AllowPrivileged    *bool  `json:"secops_allow_privileged"`     // nil pour utiliser global, sinon bool
}

// SaveContainerSettings insère ou met à jour la configuration d'un conteneur spécifique.
func SaveContainerSettings(name string, maxSev string, allowRoot *bool, allowPrivilege *bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	rootVal := -1
	if allowRoot != nil {
		if *allowRoot {
			rootVal = 1
		} else {
			rootVal = 0
		}
	}

	privVal := -1
	if allowPrivilege != nil {
		if *allowPrivilege {
			privVal = 1
		} else {
			privVal = 0
		}
	}

	query := `
	INSERT INTO container_settings (
		container_name, secops_max_severity_allowed, secops_allow_root, secops_allow_privileged
	) VALUES (?, ?, ?, ?)
	ON CONFLICT(container_name) DO UPDATE SET
		secops_max_severity_allowed=excluded.secops_max_severity_allowed,
		secops_allow_root=excluded.secops_allow_root,
		secops_allow_privileged=excluded.secops_allow_privileged;`

	_, err := db.Exec(query, name, maxSev, rootVal, privVal)
	return err
}

// GetContainerSettings charge les surcharges de configuration pour un conteneur donné.
func GetContainerSettings(name string) (maxSev string, allowRoot *bool, allowPrivilege *bool, err error) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}

	query := `
	SELECT secops_max_severity_allowed, secops_allow_root, secops_allow_privileged
	FROM container_settings WHERE container_name = ?;`

	var maxS string
	var rootVal, privVal int
	err = db.QueryRow(query, name).Scan(&maxS, &rootVal, &privVal)
	if err == sql.ErrNoRows {
		// Pas de surcharge, on retourne des valeurs par défaut/nil
		return "", nil, nil, nil
	} else if err != nil {
		return "", nil, nil, err
	}

	maxSev = maxS
	if rootVal == 1 {
		b := true
		allowRoot = &b
	} else if rootVal == 0 {
		b := false
		allowRoot = &b
	}

	if privVal == 1 {
		b := true
		allowPrivilege = &b
	} else if privVal == 0 {
		b := false
		allowPrivilege = &b
	}

	return maxSev, allowRoot, allowPrivilege, nil
}

// GetAllContainerSettings renvoie toutes les surcharges actives sous forme de map.
func GetAllContainerSettings() (map[string]ContainerSettings, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}

	query := `
	SELECT container_name, secops_max_severity_allowed, secops_allow_root, secops_allow_privileged
	FROM container_settings;`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]ContainerSettings)
	for rows.Next() {
		var name, maxS string
		var rootVal, privVal int
		if err := rows.Scan(&name, &maxS, &rootVal, &privVal); err != nil {
			return nil, err
		}

		var rootBool *bool
		if rootVal == 1 {
			b := true
			rootBool = &b
		} else if rootVal == 0 {
			b := false
			rootBool = &b
		}

		var privBool *bool
		if privVal == 1 {
			b := true
			privBool = &b
		} else if privVal == 0 {
			b := false
			privBool = &b
		}

		settings[name] = ContainerSettings{
			ContainerName:      name,
			MaxSeverityAllowed: maxS,
			AllowRoot:          rootBool,
			AllowPrivileged:    privBool,
		}
	}
	return settings, nil
}

// DeleteContainerSettings supprime les surcharges pour un conteneur donné.
func DeleteContainerSettings(name string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	_, err := db.Exec("DELETE FROM container_settings WHERE container_name = ?;", name)
	return err
}
