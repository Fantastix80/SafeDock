package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/safedock/safedock/internal/crypto"

	// Pilote SQLite pure Go sans CGO
	_ "github.com/glebarez/go-sqlite"
)

var (
	globalDB   *sql.DB
	globalDBMu sync.Mutex
	dbFilePath string // chemin résolu du fichier SQLite, pour dériver le dossier de données
)

// DBDir retourne le dossier contenant la base de données (et la clé maître).
func DBDir() string {
	if dbFilePath == "" {
		return "."
	}
	return filepath.Dir(dbFilePath)
}

// DBPath retourne le chemin résolu du fichier SQLite (vide tant que non initialisé).
func DBPath() string {
	return dbFilePath
}

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
		if err := os.MkdirAll(dir, 0750); err != nil {
			return nil, fmt.Errorf("impossible de créer le dossier de base de données : %w", err)
		}
	}

	dbFilePath = dbPath
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

	// Seed de l'hôte local de premier rang s'il n'existe aucun hôte.
	var hostCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM hosts;").Scan(&hostCount); err == nil && hostCount == 0 {
		_, _ = db.Exec("INSERT INTO hosts (name, endpoint, enabled) VALUES (?, '', 1);", "Hôte local")
	}

	// Migration : si aucun compte n'existe, on crée l'utilisateur "admin" de premier rang
	// à partir de l'ancien admin unique (mot de passe + MFA conservés).
	var userCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM users;").Scan(&userCount); err == nil && userCount == 0 {
		var pwHash, totpSecret sql.NullString
		var totpEnabled sql.NullInt64
		_ = db.QueryRow("SELECT auth_password_hash, totp_secret, totp_enabled FROM settings WHERE id = 1;").
			Scan(&pwHash, &totpSecret, &totpEnabled)
		// On ne migre l'ancien admin unique QUE s'il existait réellement un mot de
		// passe hérité. Sur une base vierge (aucun hash), on ne crée aucun compte :
		// l'assistant de configuration initiale (first-run) prendra le relais
		// (CountAdmins()==0 → jeton de setup journalisé au démarrage).
		if strings.TrimSpace(pwHash.String) != "" {
			res, ierr := db.Exec(
				`INSERT INTO users (username, password_hash, role, totp_secret, totp_enabled, scope_all)
				 VALUES ('admin', ?, 'admin', ?, ?, 1);`,
				pwHash.String, totpSecret.String, totpEnabled.Int64,
			)
			if ierr == nil {
				if adminID, lerr := res.LastInsertId(); lerr == nil {
					// Rattache d'éventuels codes de secours orphelins à l'admin.
					_, _ = db.Exec("UPDATE mfa_backup_codes SET user_id = ? WHERE user_id = 0;", adminID)
				}
				log.Println("👤 Migration : compte 'admin' créé à partir de la configuration existante.")
			}
		}
	}

	// Amorçage de l'historique CVE depuis les rapports existants (une seule fois).
	var histCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM cve_history;").Scan(&histCount); err == nil && histCount == 0 {
		backfillVulnHistory(db)
	}

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
		secops_allow_privileged BOOLEAN,
		secops_scanner TEXT DEFAULT 'trivy',
		retention_days INTEGER DEFAULT 90,
		retention_cve_days INTEGER DEFAULT -1,
		retention_notif_days INTEGER DEFAULT -1,
		retention_secaudit_days INTEGER DEFAULT -1,
		retention_seclogs_days INTEGER DEFAULT -1,
		backup_enabled INTEGER DEFAULT 1,
		backup_keep INTEGER DEFAULT 7,
		base_url TEXT DEFAULT '',
		setup_token_hash TEXT DEFAULT '',
		ssh_private_key TEXT DEFAULT '',
		ssh_public_key TEXT DEFAULT ''
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
		secops_allow_privileged INTEGER DEFAULT -1,
		secops_scanner TEXT DEFAULT ""
	);`

	// 8. Table mfa_backup_codes (codes de secours à usage unique pour le MFA)
	mfaBackupTable := `
	CREATE TABLE IF NOT EXISTS mfa_backup_codes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code_hash TEXT NOT NULL,
		used INTEGER NOT NULL DEFAULT 0
	);`

	// 7. Table hosts (Hôtes Docker fédérés : local + endpoints distants en TLS)
	hostsTable := `
	CREATE TABLE IF NOT EXISTS hosts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		endpoint TEXT NOT NULL DEFAULT '',
		tls_ca TEXT NOT NULL DEFAULT '',
		tls_cert TEXT NOT NULL DEFAULT '',
		tls_key TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	// 6. Table cve_exceptions (Risques acceptés : CVE tolérées, éventuellement avec expiration)
	cveExceptionsTable := `
	CREATE TABLE IF NOT EXISTS cve_exceptions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		cve_id TEXT NOT NULL,
		container_name TEXT NOT NULL DEFAULT '',
		reason TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		expires_at TEXT NOT NULL DEFAULT ''
	);`

	// 5. Table scan_reports (Cache persistant des rapports Trivy / Grype / Dockle)
	// Un seul rapport est conservé par couple (image_digest, scanner_type) :
	// le résultat ne change pas tant que le digest de l'image ne change pas.
	// La clé cache_key correspond exactement à la clé utilisée dans les maps
	// mémoire trivyCache / dockleCache.
	scanReportsTable := `
	CREATE TABLE IF NOT EXISTS scan_reports (
		cache_key    TEXT PRIMARY KEY,
		scanner_type TEXT NOT NULL DEFAULT '',
		container_name TEXT NOT NULL DEFAULT '',
		image_ref    TEXT NOT NULL DEFAULT '',
		report_json  TEXT NOT NULL,
		scanned_at   DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	// 9. Table users (comptes réels + rôles + MFA par utilisateur + portée)
	usersTable := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL DEFAULT '',
		role TEXT NOT NULL DEFAULT 'viewer',
		first_name TEXT NOT NULL DEFAULT '',
		last_name TEXT NOT NULL DEFAULT '',
		totp_secret TEXT NOT NULL DEFAULT '',
		totp_enabled INTEGER NOT NULL DEFAULT 0,
		must_change_password INTEGER NOT NULL DEFAULT 0,
		scope_all INTEGER NOT NULL DEFAULT 0,
		invite_hash TEXT NOT NULL DEFAULT '',
		invite_expires DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	// 10. Tags + associations conteneur (par hôte + nom)
	tagsTable := `
	CREATE TABLE IF NOT EXISTS tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		color TEXT NOT NULL DEFAULT ''
	);`
	containerTagsTable := `
	CREATE TABLE IF NOT EXISTS container_tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tag_id INTEGER NOT NULL,
		host_id INTEGER NOT NULL,
		container_name TEXT NOT NULL,
		UNIQUE(tag_id, host_id, container_name)
	);`

	// 13. Journal d'audit de sécurité (qui fait quoi : auth + administration)
	securityAuditTable := `
	CREATE TABLE IF NOT EXISTS security_audit (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		actor_id INTEGER NOT NULL DEFAULT 0,
		actor TEXT NOT NULL DEFAULT '',
		action TEXT NOT NULL DEFAULT '',
		target TEXT NOT NULL DEFAULT '',
		detail TEXT NOT NULL DEFAULT ''
	);`

	// 14. Notifications applicatives (alertes affichées dans le centre de notifications)
	notificationsTable := `
	CREATE TABLE IF NOT EXISTS notifications (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		level TEXT NOT NULL DEFAULT 'INFO',
		title TEXT NOT NULL DEFAULT '',
		body TEXT NOT NULL DEFAULT '',
		container_name TEXT NOT NULL DEFAULT '',
		host TEXT NOT NULL DEFAULT '',
		read INTEGER NOT NULL DEFAULT 0
	);`

	// 12. Historique des vulnérabilités (un point par scan → tendances dans la durée)
	cveHistoryTable := `
	CREATE TABLE IF NOT EXISTS cve_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		container_name TEXT NOT NULL,
		image_digest TEXT NOT NULL DEFAULT '',
		scanner TEXT NOT NULL DEFAULT '',
		critical INTEGER NOT NULL DEFAULT 0,
		high INTEGER NOT NULL DEFAULT 0,
		medium INTEGER NOT NULL DEFAULT 0,
		low INTEGER NOT NULL DEFAULT 0,
		scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	// 11. Portées utilisateur (tags et hôtes autorisés)
	userTagsTable := `
	CREATE TABLE IF NOT EXISTS user_allowed_tags (
		user_id INTEGER NOT NULL,
		tag_id INTEGER NOT NULL,
		UNIQUE(user_id, tag_id)
	);`
	userHostsTable := `
	CREATE TABLE IF NOT EXISTS user_allowed_hosts (
		user_id INTEGER NOT NULL,
		host_id INTEGER NOT NULL,
		UNIQUE(user_id, host_id)
	);`

	tables := []string{settingsTable, registriesTable, auditLogsTable, containerSettingsTable, scanReportsTable, cveExceptionsTable, hostsTable, mfaBackupTable, usersTable, tagsTable, containerTagsTable, userTagsTable, userHostsTable, cveHistoryTable, securityAuditTable, notificationsTable}
	for _, sqlStmt := range tables {
		_, err := db.Exec(sqlStmt)
		if err != nil {
			return fmt.Errorf("échec exécution migration : %w | requete : %s", err, sqlStmt)
		}
	}

	// On applique les migrations de colonnes supplémentaires s'il s'agit d'une DB existante
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN secops_scanner TEXT DEFAULT 'trivy';")
	_, _ = db.Exec("ALTER TABLE container_settings ADD COLUMN secops_scanner TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN auth_password_hash TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN totp_secret TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN totp_enabled INTEGER DEFAULT 0;")
	_, _ = db.Exec("ALTER TABLE mfa_backup_codes ADD COLUMN user_id INTEGER DEFAULT 0;")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';")
	// Modèle d'identité entreprise : identifiant = e-mail (colonne username),
	// identité affichée scindée en prénom + nom.
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT '';")
	// Rétention des données (journaux/historique), en jours. 0 = illimité.
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN retention_days INTEGER DEFAULT 90;")
	// Rétention par catégorie. -1 = hérite du défaut (retention_days) ; 0 = illimité ; n>0 = n jours.
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN retention_cve_days INTEGER DEFAULT -1;")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN retention_notif_days INTEGER DEFAULT -1;")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN retention_secaudit_days INTEGER DEFAULT -1;")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN retention_seclogs_days INTEGER DEFAULT -1;")
	// Sauvegardes planifiées de la base : activées par défaut, 7 dernières conservées.
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN backup_enabled INTEGER DEFAULT 1;")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN backup_keep INTEGER DEFAULT 7;")
	// Invitations par e-mail : jeton d'activation + URL publique pour les liens.
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN invite_hash TEXT NOT NULL DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN invite_expires DATETIME;")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN base_url TEXT DEFAULT '';")
	// Jeton d'amorçage (first-run) : empreinte HMAC du jeton de configuration initiale.
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN setup_token_hash TEXT DEFAULT '';")
	// Identité SSH SafeDock (clé privée chiffrée + clé publique) pour les hôtes ssh://.
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN ssh_private_key TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE settings ADD COLUMN ssh_public_key TEXT DEFAULT '';")

	return nil
}

// ==========================================================================
// Operations Table : Settings (Configuration)
// ==========================================================================

// SaveSettings insère ou met à jour la configuration en DB (ligne unique ID=1).
func SaveSettings(
	smtpHost string, smtpPort int, smtpUser, smtpPassword, smtpFrom, smtpTo string, smtpTlsSkip bool,
	secopsMaxSev string, secopsAllowRoot, secopsAllowPrivileged bool, secopsScanner string,
) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	// Chiffrement du secret SMTP avant stockage (vide reste vide → la clause CASE le préserve).
	encryptedPass, err := crypto.Encrypt(smtpPassword)
	if err != nil {
		return fmt.Errorf("échec du chiffrement du mot de passe SMTP : %w", err)
	}

	query := `
	INSERT INTO settings (
		id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_to, smtp_tls_skip_verify,
		secops_max_severity_allowed, secops_allow_root, secops_allow_privileged, secops_scanner
	) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		secops_allow_privileged=excluded.secops_allow_privileged,
		secops_scanner=excluded.secops_scanner;`

	_, err = db.Exec(query,
		smtpHost, smtpPort, smtpUser, encryptedPass, smtpFrom, smtpTo, smtpTlsSkip,
		secopsMaxSev, secopsAllowRoot, secopsAllowPrivileged, secopsScanner,
	)
	return err
}

// GetSettings charge la ligne de configuration depuis la base de données.
// Retourne sql.ErrNoRows s'il n'y a aucun enregistrement.
func GetSettings() (
	smtpHost string, smtpPort int, smtpUser, smtpPassword, smtpFrom, smtpTo string, smtpTlsSkip bool,
	secopsMaxSev string, secopsAllowRoot, secopsAllowPrivileged bool, secopsScanner string, err error,
) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}

	query := `
	SELECT 
		smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_to, smtp_tls_skip_verify,
		secops_max_severity_allowed, secops_allow_root, secops_allow_privileged, secops_scanner
	FROM settings WHERE id = 1;`

	err = db.QueryRow(query).Scan(
		&smtpHost, &smtpPort, &smtpUser, &smtpPassword, &smtpFrom, &smtpTo, &smtpTlsSkip,
		&secopsMaxSev, &secopsAllowRoot, &secopsAllowPrivileged, &secopsScanner,
	)
	if err != nil {
		return
	}

	// Déchiffrement transparent du secret SMTP (compatible avec les anciennes valeurs en clair).
	if dec, derr := crypto.Decrypt(smtpPassword); derr == nil {
		smtpPassword = dec
	} else {
		log.Printf("[DB WARNING] Impossible de déchiffrer le mot de passe SMTP : %v\n", derr)
	}
	return
}

// ==========================================================================
// Operations : Mot de passe administrateur (vérificateur HMAC)
// ==========================================================================

// SetAuthPasswordHash enregistre le vérificateur du mot de passe administrateur
// dans la ligne unique de settings (id=1), en la créant si nécessaire.
func SetAuthPasswordHash(hash string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	query := `
	INSERT INTO settings (id, auth_password_hash) VALUES (1, ?)
	ON CONFLICT(id) DO UPDATE SET auth_password_hash=excluded.auth_password_hash;`
	_, err := db.Exec(query, hash)
	return err
}

// GetAuthPasswordHash lit le vérificateur du mot de passe administrateur.
// Retourne une chaîne vide si aucun mot de passe n'est encore configuré.
func GetAuthPasswordHash() (string, error) {
	db := GetDB()
	if db == nil {
		return "", fmt.Errorf("base de données non initialisée")
	}
	var hash sql.NullString
	err := db.QueryRow("SELECT auth_password_hash FROM settings WHERE id = 1;").Scan(&hash)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return hash.String, nil
}

// ==========================================================================
// Operations : MFA (TOTP + codes de secours)
// ==========================================================================

// GetTOTP retourne le secret TOTP (déchiffré) et l'état d'activation du MFA.
func GetTOTP() (secret string, enabled bool, err error) {
	db := GetDB()
	if db == nil {
		return "", false, fmt.Errorf("base de données non initialisée")
	}
	var enc sql.NullString
	var en sql.NullInt64
	e := db.QueryRow("SELECT totp_secret, totp_enabled FROM settings WHERE id = 1;").Scan(&enc, &en)
	if e == sql.ErrNoRows {
		return "", false, nil
	}
	if e != nil {
		return "", false, e
	}
	if enc.Valid && enc.String != "" {
		if dec, derr := crypto.Decrypt(enc.String); derr == nil {
			secret = dec
		}
	}
	enabled = en.Int64 == 1
	return secret, enabled, nil
}

// SetTOTPSecret stocke (chiffré) un secret TOTP en attente, sans activer le MFA.
// L'activation n'a lieu qu'après vérification d'un premier code (EnableTOTP).
func SetTOTPSecret(secret string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	enc, err := crypto.Encrypt(secret)
	if err != nil {
		return err
	}
	query := `
	INSERT INTO settings (id, totp_secret, totp_enabled) VALUES (1, ?, 0)
	ON CONFLICT(id) DO UPDATE SET totp_secret=excluded.totp_secret, totp_enabled=0;`
	_, err = db.Exec(query, enc)
	return err
}

// EnableTOTP marque le MFA comme actif (après vérification réussie d'un code à l'enrôlement).
func EnableTOTP() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE settings SET totp_enabled = 1 WHERE id = 1;")
	return err
}

// ResetTOTP désactive le MFA et efface le secret + les codes de secours.
// Utilisé pour la récupération d'urgence (perte de l'authentificateur).
func ResetTOTP() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE settings SET totp_secret = '', totp_enabled = 0 WHERE id = 1;")
	if err != nil {
		return err
	}
	_, _ = db.Exec("DELETE FROM mfa_backup_codes;")
	return nil
}

// ReplaceBackupCodes remplace l'ensemble des codes de secours (hash HMAC, non réversibles).
func ReplaceBackupCodes(hashes []string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("DELETE FROM mfa_backup_codes;"); err != nil {
		return err
	}
	for _, h := range hashes {
		if _, err := db.Exec("INSERT INTO mfa_backup_codes (code_hash, used) VALUES (?, 0);", h); err != nil {
			return err
		}
	}
	return nil
}

// ConsumeBackupCode marque un code de secours comme utilisé s'il existe et n'a pas servi.
// Retourne true si le code était valide et vient d'être consommé.
func ConsumeBackupCode(hash string) bool {
	db := GetDB()
	if db == nil {
		return false
	}
	res, err := db.Exec("UPDATE mfa_backup_codes SET used = 1 WHERE code_hash = ? AND used = 0;", hash)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

// CountUnusedBackupCodes compte les codes de secours encore valides.
func CountUnusedBackupCodes() (int, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	var n int
	err := db.QueryRow("SELECT COUNT(*) FROM mfa_backup_codes WHERE used = 0;").Scan(&n)
	return n, err
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

	encryptedPass, err := crypto.Encrypt(password)
	if err != nil {
		return fmt.Errorf("échec du chiffrement du mot de passe de registre : %w", err)
	}

	query := `
	INSERT INTO registries (server_address, username, password)
	VALUES (?, ?, ?)
	ON CONFLICT(server_address) DO UPDATE SET
		username=excluded.username,
		password=CASE WHEN excluded.password <> '' THEN excluded.password ELSE registries.password END;`

	_, err = db.Exec(query, server, username, encryptedPass)
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
		// Déchiffrement transparent (compatible avec d'anciennes valeurs en clair).
		if dec, derr := crypto.Decrypt(reg.Password); derr == nil {
			reg.Password = dec
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
	SecopsScanner      string `json:"secops_scanner"`              // "", "trivy", "grype", "hybrid"
}

// SaveContainerSettings insère ou met à jour la configuration d'un conteneur spécifique.
func SaveContainerSettings(name string, maxSev string, allowRoot *bool, allowPrivilege *bool, secopsScanner string) error {
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
		container_name, secops_max_severity_allowed, secops_allow_root, secops_allow_privileged, secops_scanner
	) VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(container_name) DO UPDATE SET
		secops_max_severity_allowed=excluded.secops_max_severity_allowed,
		secops_allow_root=excluded.secops_allow_root,
		secops_allow_privileged=excluded.secops_allow_privileged,
		secops_scanner=excluded.secops_scanner;`

	_, err := db.Exec(query, name, maxSev, rootVal, privVal, secopsScanner)
	return err
}

// GetContainerSettings charge les surcharges de configuration pour un conteneur donné.
func GetContainerSettings(name string) (maxSev string, allowRoot *bool, allowPrivilege *bool, secopsScanner string, err error) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}

	query := `
	SELECT secops_max_severity_allowed, secops_allow_root, secops_allow_privileged, secops_scanner
	FROM container_settings WHERE container_name = ?;`

	var maxS, scanner string
	var rootVal, privVal int
	err = db.QueryRow(query, name).Scan(&maxS, &rootVal, &privVal, &scanner)
	if err == sql.ErrNoRows {
		// Pas de surcharge, on retourne des valeurs par défaut/nil
		return "", nil, nil, "", nil
	} else if err != nil {
		return "", nil, nil, "", err
	}

	maxSev = maxS
	secopsScanner = scanner
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

	return maxSev, allowRoot, allowPrivilege, secopsScanner, nil
}

// GetAllContainerSettings renvoie toutes les surcharges actives sous forme de map.
func GetAllContainerSettings() (map[string]ContainerSettings, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}

	query := `
	SELECT container_name, secops_max_severity_allowed, secops_allow_root, secops_allow_privileged, secops_scanner
	FROM container_settings;`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]ContainerSettings)
	for rows.Next() {
		var name, maxS, scanner string
		var rootVal, privVal int
		if err := rows.Scan(&name, &maxS, &rootVal, &privVal, &scanner); err != nil {
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
			SecopsScanner:      scanner,
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

// ==========================================================================
// Operations Table : Scan Reports (Cache persistant des rapports de scan)
// ==========================================================================

// SaveScanReport stocke ou écrase le rapport JSON d'un scan pour une clé de cache donnée.
// La clé est identique à celle utilisée dans les maps mémoire trivyCache / dockleCache,
// c'est-à-dire : image_digest + "_" + scanner_type (ex: "sha256:abc_trivy").
func SaveScanReport(cacheKey, scannerType, containerName, imageRef, reportJSON string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}

	query := `
	INSERT INTO scan_reports (cache_key, scanner_type, container_name, image_ref, report_json)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT(cache_key) DO UPDATE SET
		scanner_type=excluded.scanner_type,
		container_name=excluded.container_name,
		image_ref=excluded.image_ref,
		report_json=excluded.report_json,
		scanned_at=CURRENT_TIMESTAMP;`

	_, err := db.Exec(query, cacheKey, scannerType, containerName, imageRef, reportJSON)
	return err
}

// VulnHistoryPoint est un point de la courbe d'évolution des vulnérabilités d'un conteneur.
type VulnHistoryPoint struct {
	ScannedAt string `json:"scanned_at"`
	Scanner   string `json:"scanner"`
	Critical  int    `json:"critical"`
	High      int    `json:"high"`
	Medium    int    `json:"medium"`
	Low       int    `json:"low"`
}

// AppendVulnHistory ajoute un point à l'historique CVE d'un conteneur (suivi dans la durée).
func AppendVulnHistory(containerName, imageDigest, scanner string, critical, high, medium, low int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec(
		`INSERT INTO cve_history (container_name, image_digest, scanner, critical, high, medium, low)
		 VALUES (?, ?, ?, ?, ?, ?, ?);`,
		containerName, imageDigest, scanner, critical, high, medium, low)
	return err
}

// GetVulnHistory retourne l'historique CVE d'un conteneur, du plus ancien au plus récent.
func GetVulnHistory(containerName string, limit int) ([]VulnHistoryPoint, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	if limit <= 0 || limit > 2000 {
		limit = 365
	}
	rows, err := db.Query(
		`SELECT scanned_at, scanner, critical, high, medium, low
		 FROM cve_history WHERE container_name = ? ORDER BY scanned_at DESC, id DESC LIMIT ?;`,
		containerName, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pts := make([]VulnHistoryPoint, 0)
	for rows.Next() {
		var p VulnHistoryPoint
		if err := rows.Scan(&p.ScannedAt, &p.Scanner, &p.Critical, &p.High, &p.Medium, &p.Low); err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}
	// Inversion → ordre chronologique croissant (pratique pour tracer une courbe).
	for i, j := 0, len(pts)-1; i < j; i, j = i+1, j-1 {
		pts[i], pts[j] = pts[j], pts[i]
	}
	return pts, nil
}

// backfillVulnHistory amorce l'historique CVE à partir des rapports de scan déjà
// présents (une seule fois, quand la table d'historique est vide). Cela donne un
// premier point réel par conteneur sans attendre le prochain cycle de supervision.
func backfillVulnHistory(db *sql.DB) {
	rows, err := db.Query(
		`SELECT container_name, report_json, scanner_type, scanned_at
		 FROM scan_reports WHERE scanner_type != 'dockle' AND container_name != '';`)
	if err != nil {
		return
	}
	defer rows.Close()

	type summaryOnly struct {
		Summary struct {
			Critical int `json:"critical"`
			High     int `json:"high"`
			Medium   int `json:"medium"`
			Low      int `json:"low"`
		} `json:"summary"`
	}
	type entry struct {
		name, scanner, at        string
		crit, high, medium, low  int
	}
	var entries []entry
	for rows.Next() {
		var name, rj, scanner, at string
		if rows.Scan(&name, &rj, &scanner, &at) != nil {
			continue
		}
		var s summaryOnly
		if json.Unmarshal([]byte(rj), &s) != nil {
			continue
		}
		entries = append(entries, entry{name, scanner, at, s.Summary.Critical, s.Summary.High, s.Summary.Medium, s.Summary.Low})
	}
	for _, e := range entries {
		_, _ = db.Exec(
			`INSERT INTO cve_history (container_name, scanner, critical, high, medium, low, scanned_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?);`,
			e.name, e.scanner, e.crit, e.high, e.medium, e.low, e.at)
	}
}

// GetScanReport charge le rapport JSON d'un scan depuis la base de données.
// Retourne sql.ErrNoRows si aucun rapport n'est trouvé pour cette clé.
func GetScanReport(cacheKey string) (reportJSON string, scannedAt time.Time, err error) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}

	var ts string
	err = db.QueryRow(
		"SELECT report_json, scanned_at FROM scan_reports WHERE cache_key = ?;",
		cacheKey,
	).Scan(&reportJSON, &ts)
	if err != nil {
		return
	}

	// Parsing du timestamp SQLite (peut être au format "2006-01-02 15:04:05" ou RFC3339)
	if parsed, e := time.Parse("2006-01-02 15:04:05", ts); e == nil {
		scannedAt = parsed
	} else if parsed, e := time.Parse(time.RFC3339, ts); e == nil {
		scannedAt = parsed
	}
	return
}

// DeleteScanReport supprime le rapport en cache pour une clé donnée.
// Appelé implicitement par l'UPSERT, mais utile pour purger manuellement.
func DeleteScanReport(cacheKey string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("DELETE FROM scan_reports WHERE cache_key = ?;", cacheKey)
	return err
}

// GetLatestVulnScanByDigest retourne le rapport de vulnérabilités (Trivy/Grype/Hybrid,
// jamais Dockle) le plus récent pour un digest d'image donné. Sert à enrichir la liste
// des conteneurs avec des compteurs CVE réels issus du cache.
// Retourne sql.ErrNoRows si aucun scan n'existe pour ce digest.
func GetLatestVulnScanByDigest(imageDigest string) (reportJSON, scanner string, scannedAt time.Time, err error) {
	db := GetDB()
	if db == nil {
		err = fmt.Errorf("base de données non initialisée")
		return
	}
	var ts string
	err = db.QueryRow(`
		SELECT report_json, scanner_type, scanned_at
		FROM scan_reports
		WHERE cache_key LIKE ? AND scanner_type <> 'dockle'
		ORDER BY scanned_at DESC
		LIMIT 1;`, imageDigest+"_%").Scan(&reportJSON, &scanner, &ts)
	if err != nil {
		return
	}
	if parsed, e := time.Parse("2006-01-02 15:04:05", ts); e == nil {
		scannedAt = parsed
	} else if parsed, e := time.Parse(time.RFC3339, ts); e == nil {
		scannedAt = parsed
	}
	return
}

// PurgeScanReportsByDigest supprime tous les rapports de scan associés à un digest d'image.
// Les cache_keys suivent la convention "<digest>_<scanner>", donc on filtre par préfixe.
// Typiquement appelé après une MAJ réussie d'un conteneur pour nettoyer les rapports
// de l'ancienne version (désormais hors service et non pertinents).
// Retourne le nombre de lignes supprimées.
func PurgeScanReportsByDigest(imageDigest string) (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	result, err := db.Exec(
		"DELETE FROM scan_reports WHERE cache_key LIKE ?;",
		imageDigest+"_%",
	)
	if err != nil {
		return 0, err
	}
	n, _ := result.RowsAffected()
	return n, nil
}

// ==========================================================================
// Operations Table : CVE Exceptions (Risques acceptés)
// ==========================================================================

// CVEException représente une CVE explicitement tolérée par l'administrateur.
type CVEException struct {
	ID            int    `json:"id"`
	CVEID         string `json:"cve_id"`
	ContainerName string `json:"container_name"` // "" = exception globale
	Reason        string `json:"reason"`
	CreatedAt     string `json:"created_at"`
	ExpiresAt     string `json:"expires_at"` // "" = sans expiration (YYYY-MM-DD sinon)
	Active        bool   `json:"active"`
}

// AddCVEException enregistre un risque accepté. container_name vide = portée globale.
func AddCVEException(cveID, containerName, reason, expiresAt string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec(
		`INSERT INTO cve_exceptions (cve_id, container_name, reason, expires_at) VALUES (?, ?, ?, ?);`,
		cveID, containerName, reason, expiresAt,
	)
	return err
}

// DeleteCVEException supprime une exception par son identifiant.
func DeleteCVEException(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("DELETE FROM cve_exceptions WHERE id = ?;", id)
	return err
}

// GetCVEExceptions liste toutes les exceptions, avec un indicateur Active calculé.
func GetCVEExceptions() ([]CVEException, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query(`SELECT id, cve_id, container_name, reason, created_at, expires_at FROM cve_exceptions ORDER BY created_at DESC;`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]CVEException, 0)
	for rows.Next() {
		var e CVEException
		var created string
		if err := rows.Scan(&e.ID, &e.CVEID, &e.ContainerName, &e.Reason, &created, &e.ExpiresAt); err != nil {
			return nil, err
		}
		e.CreatedAt = created
		e.Active = isExceptionActive(e.ExpiresAt)
		list = append(list, e)
	}
	return list, nil
}

// GetActiveExceptedCVEs retourne l'ensemble des CVE actuellement tolérées (non expirées)
// applicables à un conteneur : exceptions globales + exceptions ciblant ce conteneur.
// Les identifiants de CVE sont normalisés en majuscules pour une comparaison fiable.
func GetActiveExceptedCVEs(containerName string) (map[string]bool, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query(
		`SELECT cve_id, expires_at FROM cve_exceptions WHERE container_name = '' OR container_name = ?;`,
		containerName,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	set := make(map[string]bool)
	for rows.Next() {
		var cveID, expires string
		if err := rows.Scan(&cveID, &expires); err != nil {
			return nil, err
		}
		if isExceptionActive(expires) {
			set[strings.ToUpper(strings.TrimSpace(cveID))] = true
		}
	}
	return set, nil
}

// isExceptionActive indique si une exception est encore valable (non expirée).
func isExceptionActive(expiresAt string) bool {
	if strings.TrimSpace(expiresAt) == "" {
		return true // sans expiration
	}
	exp, err := time.Parse("2006-01-02", strings.TrimSpace(expiresAt))
	if err != nil {
		return true // date illisible : on ne fait pas expirer par erreur
	}
	// Valable jusqu'à la fin du jour d'expiration.
	return time.Now().Before(exp.Add(24 * time.Hour))
}

// ==========================================================================
// Operations Table : Hosts (Hôtes Docker fédérés)
// ==========================================================================

// DockerHost représente un hôte Docker géré. Endpoint vide = socket local.
// Les champs TLS sont déchiffrés à la lecture via GetHosts/GetHost.
type DockerHost struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"` // "" = local ; sinon tcp://host:2376
	TLSCa     string `json:"-"`        // jamais exposé en clair par l'API
	TLSCert   string `json:"-"`
	TLSKey    string `json:"-"`
	Enabled   bool   `json:"enabled"`
	IsLocal   bool   `json:"is_local"`
	HasTLS    bool   `json:"has_tls"`
	CreatedAt string `json:"created_at"`
}

func scanHost(rowScan func(...any) error) (DockerHost, error) {
	var h DockerHost
	var enabled int
	if err := rowScan(&h.ID, &h.Name, &h.Endpoint, &h.TLSCa, &h.TLSCert, &h.TLSKey, &enabled, &h.CreatedAt); err != nil {
		return h, err
	}
	h.Enabled = enabled == 1
	h.IsLocal = h.Endpoint == ""
	h.HasTLS = h.TLSCert != "" && h.TLSKey != ""
	// Déchiffrement transparent du matériel TLS (stocké chiffré).
	if dec, e := crypto.Decrypt(h.TLSCa); e == nil {
		h.TLSCa = dec
	}
	if dec, e := crypto.Decrypt(h.TLSCert); e == nil {
		h.TLSCert = dec
	}
	if dec, e := crypto.Decrypt(h.TLSKey); e == nil {
		h.TLSKey = dec
	}
	return h, nil
}

// injectSSHKey : un hôte ssh:// sans clé propre utilise la clé privée d'instance
// SafeDock. À n'appeler que lorsqu'aucun *sql.Rows n'est ouvert (requête imbriquée).
func injectSSHKey(h *DockerHost) {
	if strings.HasPrefix(h.Endpoint, "ssh://") && h.TLSKey == "" {
		if priv, err := GetSSHPrivateKey(); err == nil {
			h.TLSKey = priv
		}
	}
}

// GetHosts liste tous les hôtes (matériel TLS déchiffré).
func GetHosts() ([]DockerHost, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query("SELECT id, name, endpoint, tls_ca, tls_cert, tls_key, enabled, created_at FROM hosts ORDER BY id ASC;")
	if err != nil {
		return nil, err
	}
	list := make([]DockerHost, 0)
	for rows.Next() {
		h, serr := scanHost(rows.Scan)
		if serr != nil {
			_ = rows.Close()
			return nil, serr
		}
		list = append(list, h)
	}
	_ = rows.Close() // libère la connexion AVANT injectSSHKey (connexion unique)
	for i := range list {
		injectSSHKey(&list[i])
	}
	return list, nil
}

// GetEnabledHosts ne retourne que les hôtes activés.
func GetEnabledHosts() ([]DockerHost, error) {
	all, err := GetHosts()
	if err != nil {
		return nil, err
	}
	enabled := make([]DockerHost, 0, len(all))
	for _, h := range all {
		if h.Enabled {
			enabled = append(enabled, h)
		}
	}
	return enabled, nil
}

// GetHost récupère un hôte par identifiant (matériel TLS déchiffré).
func GetHost(id int) (DockerHost, error) {
	db := GetDB()
	if db == nil {
		return DockerHost{}, fmt.Errorf("base de données non initialisée")
	}
	row := db.QueryRow("SELECT id, name, endpoint, tls_ca, tls_cert, tls_key, enabled, created_at FROM hosts WHERE id = ?;", id)
	h, err := scanHost(row.Scan)
	if err != nil {
		return h, err
	}
	injectSSHKey(&h) // sûr : QueryRow.Scan a déjà libéré la connexion
	return h, nil
}

// AddHost enregistre un nouvel hôte distant. Le matériel TLS est chiffré avant stockage.
func AddHost(name, endpoint, tlsCa, tlsCert, tlsKey string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	encCa, err := crypto.Encrypt(tlsCa)
	if err != nil {
		return err
	}
	encCert, err := crypto.Encrypt(tlsCert)
	if err != nil {
		return err
	}
	encKey, err := crypto.Encrypt(tlsKey)
	if err != nil {
		return err
	}
	_, err = db.Exec(
		"INSERT INTO hosts (name, endpoint, tls_ca, tls_cert, tls_key, enabled) VALUES (?, ?, ?, ?, ?, 1);",
		name, endpoint, encCa, encCert, encKey,
	)
	return err
}

// DeleteHost supprime un hôte. L'hôte local (endpoint vide) ne peut pas être supprimé.
func DeleteHost(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	h, err := GetHost(id)
	if err != nil {
		return err
	}
	if h.IsLocal {
		return fmt.Errorf("l'hôte local ne peut pas être supprimé")
	}
	_, err = db.Exec("DELETE FROM hosts WHERE id = ?;", id)
	return err
}

// SetHostEnabled active ou désactive un hôte.
func SetHostEnabled(id int, enabled bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	v := 0
	if enabled {
		v = 1
	}
	_, err := db.Exec("UPDATE hosts SET enabled = ? WHERE id = ?;", v, id)
	return err
}

// ==========================================================================
// Operations : Users (comptes, rôles, MFA par utilisateur, portée)
// ==========================================================================

// Rôles reconnus, par ordre croissant de privilège.
const (
	RoleViewer  = "viewer"
	RoleAuditor = "auditor"
	RoleAdmin   = "admin"
)

// User est la vue publique d'un compte (sans secret ni hash).
type User struct {
	ID                 int    `json:"id"`
	Username           string `json:"username"` // identifiant de connexion = adresse e-mail
	Role               string `json:"role"`
	FirstName          string `json:"first_name"`
	LastName           string `json:"last_name"`
	TOTPEnabled        bool   `json:"totp_enabled"`
	MustChangePassword bool   `json:"must_change_password"`
	ScopeAll           bool   `json:"scope_all"`
	CreatedAt          string `json:"created_at"`
	AllowedTags        []int  `json:"allowed_tags"`
	AllowedHosts       []int  `json:"allowed_hosts"`
}

// UserAuth porte les éléments sensibles nécessaires à l'authentification.
type UserAuth struct {
	ID                 int
	Username           string
	PasswordHash       string
	Role               string
	TOTPSecret         string // déchiffré
	TOTPEnabled        bool
	MustChangePassword bool
	Found              bool
}

// ValidRole indique si un rôle est reconnu.
func ValidRole(r string) bool {
	return r == RoleViewer || r == RoleAuditor || r == RoleAdmin
}

// GetUserAuth charge les données d'authentification d'un compte par nom d'utilisateur.
func GetUserAuth(username string) (UserAuth, error) {
	db := GetDB()
	if db == nil {
		return UserAuth{}, fmt.Errorf("base de données non initialisée")
	}
	var u UserAuth
	var totpEnc sql.NullString
	var totpEn, mustChange sql.NullInt64
	err := db.QueryRow(
		`SELECT id, username, password_hash, role, totp_secret, totp_enabled, must_change_password
		 FROM users WHERE username = ?;`, username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &totpEnc, &totpEn, &mustChange)
	if err == sql.ErrNoRows {
		return UserAuth{Found: false}, nil
	}
	if err != nil {
		return UserAuth{}, err
	}
	if totpEnc.Valid && totpEnc.String != "" {
		if dec, derr := crypto.Decrypt(totpEnc.String); derr == nil {
			u.TOTPSecret = dec
		}
	}
	u.TOTPEnabled = totpEn.Int64 == 1
	u.MustChangePassword = mustChange.Int64 == 1
	u.Found = true
	return u, nil
}

// scanUserRow ne lit QUE les colonnes de la ligne (pas de requête imbriquée) :
// charger les portées (tags/hôtes) doit se faire APRÈS fermeture des `rows`, car
// la connexion SQLite est unique (SetMaxOpenConns(1)) — sinon interblocage.
func scanUserRow(rowScan func(...any) error) (User, error) {
	var u User
	var totpEn, mustChange, scopeAll int
	if err := rowScan(&u.ID, &u.Username, &u.Role, &u.FirstName, &u.LastName, &totpEn, &mustChange, &scopeAll, &u.CreatedAt); err != nil {
		return u, err
	}
	u.TOTPEnabled = totpEn == 1
	u.MustChangePassword = mustChange == 1
	u.ScopeAll = scopeAll == 1
	return u, nil
}

// loadUserScopes complète un utilisateur avec ses tags/hôtes autorisés.
// À n'appeler que lorsqu'aucun *sql.Rows n'est ouvert.
func loadUserScopes(u *User) {
	u.AllowedTags, _ = GetUserAllowedTags(u.ID)
	u.AllowedHosts, _ = GetUserAllowedHosts(u.ID)
}

// GetUserByID retourne la vue publique d'un compte.
func GetUserByID(id int) (User, error) {
	db := GetDB()
	if db == nil {
		return User{}, fmt.Errorf("base de données non initialisée")
	}
	row := db.QueryRow(
		`SELECT id, username, role, first_name, last_name, totp_enabled, must_change_password, scope_all, created_at
		 FROM users WHERE id = ?;`, id)
	u, err := scanUserRow(row.Scan)
	if err != nil {
		return u, err
	}
	loadUserScopes(&u) // sûr : QueryRow.Scan a déjà libéré la connexion
	return u, nil
}

// ListUsers retourne tous les comptes (vue publique).
func ListUsers() ([]User, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query(
		`SELECT id, username, role, first_name, last_name, totp_enabled, must_change_password, scope_all, created_at
		 FROM users ORDER BY id ASC;`)
	if err != nil {
		return nil, err
	}
	list := make([]User, 0)
	for rows.Next() {
		u, serr := scanUserRow(rows.Scan)
		if serr != nil {
			_ = rows.Close()
			return nil, serr
		}
		list = append(list, u)
	}
	_ = rows.Close() // libère la connexion AVANT de charger les portées (connexion unique)
	for i := range list {
		loadUserScopes(&list[i])
	}
	return list, nil
}

// CountAdmins compte les comptes administrateurs (pour éviter de supprimer le dernier).
func CountAdmins() (int, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	var n int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin';").Scan(&n)
	return n, err
}

// CreateUser crée un compte. L'username sert d'identifiant de connexion (= adresse
// e-mail en entreprise). mustChange impose un changement de mot de passe au 1er login.
func CreateUser(username, passwordHash, role, firstName, lastName string, scopeAll, mustChange bool) (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	res, err := db.Exec(
		`INSERT INTO users (username, password_hash, role, first_name, last_name, scope_all, must_change_password)
		 VALUES (?, ?, ?, ?, ?, ?, ?);`,
		username, passwordHash, role, firstName, lastName, boolToInt(scopeAll), boolToInt(mustChange),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// CreateInvitedUser crée un compte en attente d'activation : sans mot de passe ni
// MFA, porteur d'une empreinte de jeton d'invitation et de son expiration.
func CreateInvitedUser(username, role, firstName, lastName string, scopeAll bool, inviteHash string, expires time.Time) (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	res, err := db.Exec(
		`INSERT INTO users (username, password_hash, role, first_name, last_name, scope_all, must_change_password, invite_hash, invite_expires)
		 VALUES (?, '', ?, ?, ?, ?, 0, ?, ?);`,
		username, role, firstName, lastName, boolToInt(scopeAll), inviteHash, expires.Unix(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// SetUserInvite (ré)assigne un jeton d'invitation à un compte (renvoi d'invitation).
func SetUserInvite(id int, inviteHash string, expires time.Time) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET invite_hash = ?, invite_expires = ? WHERE id = ?;",
		inviteHash, expires.Unix(), id)
	return err
}

// GetUserByInviteHash retourne le compte porteur de l'empreinte d'invitation, si
// elle existe et n'est pas expirée.
func GetUserByInviteHash(hash string) (User, bool) {
	db := GetDB()
	if db == nil || hash == "" {
		return User{}, false
	}
	var u User
	var totpEnabled, scopeAll int
	var expires sql.NullInt64
	err := db.QueryRow(
		`SELECT id, username, role, first_name, last_name, totp_enabled, scope_all, invite_expires
		 FROM users WHERE invite_hash = ?;`, hash).
		Scan(&u.ID, &u.Username, &u.Role, &u.FirstName, &u.LastName, &totpEnabled, &scopeAll, &expires)
	if err != nil {
		return User{}, false
	}
	// Expiration stockée en epoch Unix (sans ambiguïté de format DATETIME).
	if expires.Valid && time.Now().Unix() > expires.Int64 {
		return User{}, false
	}
	u.TOTPEnabled = totpEnabled == 1
	u.ScopeAll = scopeAll == 1
	return u, true
}

// HasPendingInvite indique si un compte porte encore un jeton d'invitation non
// consommé (compte créé par invitation et pas encore finalisé). Sert à n'autoriser
// la finalisation via /api/login (mot de passe + MFA) qu'aux comptes amorcés
// localement (administrateur de premier rang), jamais aux comptes invités.
func HasPendingInvite(id int) bool {
	db := GetDB()
	if db == nil {
		return false
	}
	var h sql.NullString
	if err := db.QueryRow("SELECT invite_hash FROM users WHERE id = ?;", id).Scan(&h); err != nil {
		return false
	}
	return strings.TrimSpace(h.String) != ""
}

// ClearUserInvite efface le jeton d'invitation après activation du compte.
func ClearUserInvite(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET invite_hash = '', invite_expires = NULL WHERE id = ?;", id)
	return err
}

// GetBaseURL retourne l'URL publique de SafeDock (pour bâtir les liens d'invitation).
func GetBaseURL() string {
	db := GetDB()
	if db == nil {
		return ""
	}
	var v sql.NullString
	_ = db.QueryRow("SELECT base_url FROM settings WHERE id = 1;").Scan(&v)
	return strings.TrimSpace(v.String)
}

// SetBaseURL persiste l'URL publique de SafeDock.
func SetBaseURL(u string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	res, err := db.Exec("UPDATE settings SET base_url = ? WHERE id = 1;", u)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = db.Exec("INSERT INTO settings (id, base_url) VALUES (1, ?);", u)
	}
	return err
}

// ── Jeton d'amorçage (assistant de configuration initiale) ───────────────────

// SetSetupTokenHash persiste l'empreinte du jeton de configuration initiale.
func SetSetupTokenHash(hash string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec(
		`INSERT INTO settings (id, setup_token_hash) VALUES (1, ?)
		 ON CONFLICT(id) DO UPDATE SET setup_token_hash=excluded.setup_token_hash;`, hash)
	return err
}

// GetSetupTokenHash lit l'empreinte du jeton de configuration initiale ("" si absente).
func GetSetupTokenHash() (string, error) {
	db := GetDB()
	if db == nil {
		return "", fmt.Errorf("base de données non initialisée")
	}
	var h sql.NullString
	err := db.QueryRow("SELECT setup_token_hash FROM settings WHERE id = 1;").Scan(&h)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(h.String), nil
}

// ClearSetupTokenHash efface le jeton d'amorçage (configuration initiale terminée).
func ClearSetupTokenHash() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE settings SET setup_token_hash = '' WHERE id = 1;")
	return err
}

// GetFirstAdmin retourne le compte administrateur le plus ancien (par id). Utilisé
// par les chemins de récupération (reset MFA / mot de passe par variable d'env)
// désormais que l'identifiant n'est plus forcément le littéral « admin ».
func GetFirstAdmin() (UserAuth, error) {
	db := GetDB()
	if db == nil {
		return UserAuth{}, fmt.Errorf("base de données non initialisée")
	}
	var u UserAuth
	var totpEnc sql.NullString
	var totpEn, mustChange sql.NullInt64
	err := db.QueryRow(
		`SELECT id, username, password_hash, role, totp_secret, totp_enabled, must_change_password
		 FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1;`,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &totpEnc, &totpEn, &mustChange)
	if err == sql.ErrNoRows {
		return UserAuth{Found: false}, nil
	}
	if err != nil {
		return UserAuth{}, err
	}
	if totpEnc.Valid && totpEnc.String != "" {
		if dec, derr := crypto.Decrypt(totpEnc.String); derr == nil {
			u.TOTPSecret = dec
		}
	}
	u.TOTPEnabled = totpEn.Int64 == 1
	u.MustChangePassword = mustChange.Int64 == 1
	u.Found = true
	return u, nil
}

// SetUserProfile met à jour l'identité affichée d'un compte (prénom + nom).
func SetUserProfile(id int, firstName, lastName string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?;", firstName, lastName, id)
	return err
}

// DeleteUser supprime un compte et ses dépendances (codes de secours, portées).
func DeleteUser(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("DELETE FROM users WHERE id = ?;", id); err != nil {
		return err
	}
	_, _ = db.Exec("DELETE FROM mfa_backup_codes WHERE user_id = ?;", id)
	_, _ = db.Exec("DELETE FROM user_allowed_tags WHERE user_id = ?;", id)
	_, _ = db.Exec("DELETE FROM user_allowed_hosts WHERE user_id = ?;", id)
	return nil
}

// SetUserPassword fixe le hash du mot de passe et le drapeau de changement obligatoire.
func SetUserPassword(id int, passwordHash string, mustChange bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?;",
		passwordHash, boolToInt(mustChange), id)
	return err
}

// UpdateUserPasswordHash met à jour uniquement le vérificateur de mot de passe
// (sans toucher au flag must_change_password). Sert à migrer de façon transparente
// un ancien vérificateur HMAC vers argon2id lors d'une connexion réussie.
func UpdateUserPasswordHash(id int, passwordHash string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET password_hash = ? WHERE id = ?;", passwordHash, id)
	return err
}

// SetUserRole change le rôle d'un compte.
func SetUserRole(id int, role string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET role = ? WHERE id = ?;", role, id)
	return err
}

// SetUserScopeAll définit si l'utilisateur voit tout le parc.
func SetUserScopeAll(id int, all bool) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET scope_all = ? WHERE id = ?;", boolToInt(all), id)
	return err
}

// ── MFA par utilisateur ──────────────────────────────────────────────────

// GetUserTOTP retourne le secret TOTP (déchiffré) et l'état d'activation d'un compte.
func GetUserTOTP(id int) (secret string, enabled bool, err error) {
	db := GetDB()
	if db == nil {
		return "", false, fmt.Errorf("base de données non initialisée")
	}
	var enc sql.NullString
	var en sql.NullInt64
	e := db.QueryRow("SELECT totp_secret, totp_enabled FROM users WHERE id = ?;", id).Scan(&enc, &en)
	if e != nil {
		return "", false, e
	}
	if enc.Valid && enc.String != "" {
		if dec, derr := crypto.Decrypt(enc.String); derr == nil {
			secret = dec
		}
	}
	return secret, en.Int64 == 1, nil
}

// SetUserTOTPSecret stocke (chiffré) un secret TOTP en attente d'activation.
func SetUserTOTPSecret(id int, secret string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	enc, err := crypto.Encrypt(secret)
	if err != nil {
		return err
	}
	_, err = db.Exec("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?;", enc, id)
	return err
}

// EnableUserTOTP active le MFA d'un compte après vérification du premier code.
func EnableUserTOTP(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE users SET totp_enabled = 1 WHERE id = ?;", id)
	return err
}

// ResetUserMFA efface le MFA d'un compte (récupération admin : perte du téléphone).
func ResetUserMFA(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("UPDATE users SET totp_secret = '', totp_enabled = 0 WHERE id = ?;", id); err != nil {
		return err
	}
	_, _ = db.Exec("DELETE FROM mfa_backup_codes WHERE user_id = ?;", id)
	return nil
}

// ReplaceUserBackupCodes remplace les codes de secours d'un compte.
func ReplaceUserBackupCodes(userID int, hashes []string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("DELETE FROM mfa_backup_codes WHERE user_id = ?;", userID); err != nil {
		return err
	}
	for _, h := range hashes {
		if _, err := db.Exec("INSERT INTO mfa_backup_codes (user_id, code_hash, used) VALUES (?, ?, 0);", userID, h); err != nil {
			return err
		}
	}
	return nil
}

// ConsumeUserBackupCode consomme un code de secours d'un compte (usage unique),
// par correspondance exacte du hash (format historique HMAC déterministe).
func ConsumeUserBackupCode(userID int, hash string) bool {
	db := GetDB()
	if db == nil {
		return false
	}
	res, err := db.Exec("UPDATE mfa_backup_codes SET used = 1 WHERE user_id = ? AND code_hash = ? AND used = 0;", userID, hash)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

// ConsumeUserBackupCodeMatch consomme le premier code inutilisé du compte dont le
// hash satisfait `matches` (vérification argon2 côté appelant). Nécessaire car les
// hash salés ne peuvent pas être retrouvés par égalité SQL. Usage unique garanti
// par l'UPDATE conditionnel `used = 0`.
func ConsumeUserBackupCodeMatch(userID int, matches func(storedHash string) bool) bool {
	db := GetDB()
	if db == nil {
		return false
	}
	rows, err := db.Query("SELECT id, code_hash FROM mfa_backup_codes WHERE user_id = ? AND used = 0;", userID)
	if err != nil {
		return false
	}
	type rec struct {
		id   int
		hash string
	}
	var recs []rec
	for rows.Next() {
		var r rec
		if rows.Scan(&r.id, &r.hash) == nil {
			recs = append(recs, r)
		}
	}
	rows.Close() // fermer AVANT tout Exec (SQLite MaxOpenConns(1) → éviter l'interblocage)

	for _, r := range recs {
		if !matches(r.hash) {
			continue
		}
		res, uerr := db.Exec("UPDATE mfa_backup_codes SET used = 1 WHERE id = ? AND used = 0;", r.id)
		if uerr == nil {
			if n, _ := res.RowsAffected(); n == 1 {
				return true
			}
		}
	}
	return false
}

// ==========================================================================
// Operations : Tags + associations conteneur
// ==========================================================================

// Tag est une étiquette d'organisation logique du parc.
type Tag struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// ContainerTagAssignment lie un tag à un conteneur précis sur un hôte précis.
type ContainerTagAssignment struct {
	TagID         int    `json:"tag_id"`
	HostID        int    `json:"host_id"`
	ContainerName string `json:"container_name"`
}

// CreateTag crée un tag.
func CreateTag(name, color string) (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	res, err := db.Exec("INSERT INTO tags (name, color) VALUES (?, ?);", name, color)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ListTags liste les tags.
func ListTags() ([]Tag, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query("SELECT id, name, color FROM tags ORDER BY name ASC;")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]Tag, 0)
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, nil
}

// DeleteTag supprime un tag et ses associations/portées dépendantes.
func DeleteTag(id int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("DELETE FROM tags WHERE id = ?;", id); err != nil {
		return err
	}
	_, _ = db.Exec("DELETE FROM container_tags WHERE tag_id = ?;", id)
	_, _ = db.Exec("DELETE FROM user_allowed_tags WHERE tag_id = ?;", id)
	return nil
}

// AssignContainerTag associe un tag à un conteneur (idempotent).
func AssignContainerTag(tagID, hostID int, containerName string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec(
		`INSERT OR IGNORE INTO container_tags (tag_id, host_id, container_name) VALUES (?, ?, ?);`,
		tagID, hostID, containerName)
	return err
}

// UnassignContainerTag retire l'association d'un tag à un conteneur.
func UnassignContainerTag(tagID, hostID int, containerName string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec(
		"DELETE FROM container_tags WHERE tag_id = ? AND host_id = ? AND container_name = ?;",
		tagID, hostID, containerName)
	return err
}

// ListContainerTagAssignments retourne toutes les associations tag↔conteneur.
func ListContainerTagAssignments() ([]ContainerTagAssignment, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query("SELECT tag_id, host_id, container_name FROM container_tags;")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]ContainerTagAssignment, 0)
	for rows.Next() {
		var a ContainerTagAssignment
		if err := rows.Scan(&a.TagID, &a.HostID, &a.ContainerName); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

// TagIDsForContainer retourne l'ensemble des identifiants de tags d'un conteneur donné.
func TagIDsForContainer(hostID int, containerName string) (map[int]bool, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query("SELECT tag_id FROM container_tags WHERE host_id = ? AND container_name = ?;", hostID, containerName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	set := make(map[int]bool)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		set[id] = true
	}
	return set, nil
}

// ==========================================================================
// Operations : Portées utilisateur (tags + hôtes autorisés)
// ==========================================================================

// GetUserAllowedTags retourne les tags autorisés d'un utilisateur.
func GetUserAllowedTags(userID int) ([]int, error) {
	return queryIntList("SELECT tag_id FROM user_allowed_tags WHERE user_id = ?;", userID)
}

// GetUserAllowedHosts retourne les hôtes autorisés d'un utilisateur.
func GetUserAllowedHosts(userID int) ([]int, error) {
	return queryIntList("SELECT host_id FROM user_allowed_hosts WHERE user_id = ?;", userID)
}

// SetUserAllowedTags remplace l'ensemble des tags autorisés.
func SetUserAllowedTags(userID int, tagIDs []int) error {
	return replaceScope("user_allowed_tags", "tag_id", userID, tagIDs)
}

// SetUserAllowedHosts remplace l'ensemble des hôtes autorisés.
func SetUserAllowedHosts(userID int, hostIDs []int) error {
	return replaceScope("user_allowed_hosts", "host_id", userID, hostIDs)
}

func replaceScope(table, col string, userID int, ids []int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if _, err := db.Exec("DELETE FROM "+table+" WHERE user_id = ?;", userID); err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := db.Exec("INSERT OR IGNORE INTO "+table+" (user_id, "+col+") VALUES (?, ?);", userID, id); err != nil {
			return err
		}
	}
	return nil
}

func queryIntList(query string, arg int) ([]int, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	rows, err := db.Query(query, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]int, 0)
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ==========================================================================
// Operations : Journal d'audit de sécurité (qui fait quoi)
// ==========================================================================

// SecurityAuditEntry est une entrée du journal d'audit (action sensible tracée).
type SecurityAuditEntry struct {
	ID        int    `json:"id"`
	Timestamp string `json:"timestamp"`
	Actor     string `json:"actor"`
	Action    string `json:"action"`
	Target    string `json:"target"`
	Detail    string `json:"detail"`
}

// WriteSecurityAudit enregistre une action sensible (best-effort, n'échoue jamais bruyamment).
func WriteSecurityAudit(actorID int, actor, action, target, detail string) {
	db := GetDB()
	if db == nil {
		return
	}
	_, _ = db.Exec(
		`INSERT INTO security_audit (actor_id, actor, action, target, detail) VALUES (?, ?, ?, ?, ?);`,
		actorID, actor, action, target, detail)
}

// GetSecurityAudit retourne les dernières entrées du journal (du plus récent au plus ancien).
func GetSecurityAudit(limit int) ([]SecurityAuditEntry, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	rows, err := db.Query(
		`SELECT id, timestamp, actor, action, target, detail
		 FROM security_audit ORDER BY id DESC LIMIT ?;`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]SecurityAuditEntry, 0)
	for rows.Next() {
		var e SecurityAuditEntry
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.Actor, &e.Action, &e.Target, &e.Detail); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, nil
}

// ==========================================================================
// Operations : Notifications applicatives (centre de notifications)
// ==========================================================================

// Notification est une alerte affichée dans le centre de notifications.
type Notification struct {
	ID            int    `json:"id"`
	Timestamp     string `json:"timestamp"`
	Level         string `json:"level"` // CRITICAL | WARNING | INFO
	Title         string `json:"title"`
	Body          string `json:"body"`
	ContainerName string `json:"container_name"`
	Host          string `json:"host"`
	Read          bool   `json:"read"`
}

// WriteNotification ajoute une notification (best-effort).
func WriteNotification(level, title, body, containerName, host string) {
	db := GetDB()
	if db == nil {
		return
	}
	_, _ = db.Exec(
		`INSERT INTO notifications (level, title, body, container_name, host) VALUES (?, ?, ?, ?, ?);`,
		level, title, body, containerName, host)
}

// GetNotifications retourne les notifications les plus récentes.
func GetNotifications(limit int) ([]Notification, error) {
	db := GetDB()
	if db == nil {
		return nil, fmt.Errorf("base de données non initialisée")
	}
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	rows, err := db.Query(
		`SELECT id, timestamp, level, title, body, container_name, host, read
		 FROM notifications ORDER BY id DESC LIMIT ?;`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		var read int
		if err := rows.Scan(&n.ID, &n.Timestamp, &n.Level, &n.Title, &n.Body, &n.ContainerName, &n.Host, &read); err != nil {
			return nil, err
		}
		n.Read = read == 1
		list = append(list, n)
	}
	return list, nil
}

// MarkNotificationsRead marque toutes les notifications comme lues.
func MarkNotificationsRead() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	_, err := db.Exec("UPDATE notifications SET read = 1 WHERE read = 0;")
	return err
}

// ==========================================================================
// Operations : Rétention des données (purge des journaux/historique)
// ==========================================================================

// GetRetentionDays retourne la durée de rétention des journaux (en jours). 0 = illimité.
func GetRetentionDays() int {
	db := GetDB()
	if db == nil {
		return 90
	}
	var d sql.NullInt64
	if err := db.QueryRow("SELECT retention_days FROM settings WHERE id = 1;").Scan(&d); err != nil || !d.Valid {
		return 90
	}
	return int(d.Int64)
}

// SetRetentionDays définit la durée de rétention (jours, 0 = illimité).
func SetRetentionDays(days int) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if days < 0 {
		days = 0
	}
	res, err := db.Exec("UPDATE settings SET retention_days = ? WHERE id = 1;", days)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = db.Exec("INSERT INTO settings (id, retention_days) VALUES (1, ?);", days)
	}
	return err
}

// PurgeOldData supprime les enregistrements horodatés plus vieux que `days` jours
// des tables de journaux/historique (historique CVE, notifications, audit de sécurité,
// audit SecOps). days <= 0 → aucune purge. Retourne le nombre total de lignes supprimées.
func PurgeOldData(days int) (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	if days <= 0 {
		return 0, nil
	}
	cutoff := fmt.Sprintf("-%d days", days)
	targets := []struct{ table, col string }{
		{"cve_history", "scanned_at"},
		{"notifications", "timestamp"},
		{"security_audit", "timestamp"},
		{"audit_logs", "timestamp"},
	}
	var total int64
	for _, t := range targets {
		res, err := db.Exec("DELETE FROM "+t.table+" WHERE "+t.col+" < datetime('now', ?);", cutoff)
		if err != nil {
			continue
		}
		n, _ := res.RowsAffected()
		total += n
	}
	return total, nil
}

// RetentionConfig regroupe la rétention par défaut et les surcharges par catégorie.
// Convention par catégorie : -1 = hériter du défaut, 0 = illimité, n>0 = n jours.
type RetentionConfig struct {
	Default       int `json:"default"`        // défaut global (jamais -1)
	CVE           int `json:"cve"`            // historique CVE / tendances
	Notifications int `json:"notifications"`  // notifications applicatives
	SecurityAudit int `json:"security_audit"` // journal d'audit RBAC
	AuditLogs     int `json:"audit_logs"`     // journal SecOps (déploiements)
}

// effective résout l'héritage d'une catégorie vers le défaut.
func (rc RetentionConfig) effective(cat int) int {
	if cat < 0 {
		return rc.Default
	}
	return cat
}

// GetRetentionConfig lit la rétention par défaut et les surcharges par catégorie.
func GetRetentionConfig() RetentionConfig {
	rc := RetentionConfig{Default: 90, CVE: -1, Notifications: -1, SecurityAudit: -1, AuditLogs: -1}
	db := GetDB()
	if db == nil {
		return rc
	}
	var def, cve, notif, secaudit, seclogs sql.NullInt64
	err := db.QueryRow(`SELECT retention_days, retention_cve_days, retention_notif_days,
		retention_secaudit_days, retention_seclogs_days FROM settings WHERE id = 1;`).
		Scan(&def, &cve, &notif, &secaudit, &seclogs)
	if err != nil {
		return rc
	}
	if def.Valid {
		rc.Default = int(def.Int64)
	}
	if cve.Valid {
		rc.CVE = int(cve.Int64)
	}
	if notif.Valid {
		rc.Notifications = int(notif.Int64)
	}
	if secaudit.Valid {
		rc.SecurityAudit = int(secaudit.Int64)
	}
	if seclogs.Valid {
		rc.AuditLogs = int(seclogs.Int64)
	}
	return rc
}

// SetRetentionConfig persiste la rétention par défaut et les surcharges par catégorie.
func SetRetentionConfig(rc RetentionConfig) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if rc.Default < 0 {
		rc.Default = 0
	}
	normCat := func(v int) int {
		if v < -1 {
			return -1
		}
		return v
	}
	res, err := db.Exec(`UPDATE settings SET retention_days=?, retention_cve_days=?, retention_notif_days=?,
		retention_secaudit_days=?, retention_seclogs_days=? WHERE id=1;`,
		rc.Default, normCat(rc.CVE), normCat(rc.Notifications), normCat(rc.SecurityAudit), normCat(rc.AuditLogs))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = db.Exec(`INSERT INTO settings (id, retention_days, retention_cve_days, retention_notif_days,
			retention_secaudit_days, retention_seclogs_days) VALUES (1,?,?,?,?,?);`,
			rc.Default, normCat(rc.CVE), normCat(rc.Notifications), normCat(rc.SecurityAudit), normCat(rc.AuditLogs))
	}
	return err
}

// PurgeWithConfig purge chaque catégorie selon sa rétention effective (héritage résolu).
// 0 (ou hérité de 0) = illimité → aucune purge pour cette catégorie. Retourne le total supprimé.
func PurgeWithConfig() (int64, error) {
	db := GetDB()
	if db == nil {
		return 0, fmt.Errorf("base de données non initialisée")
	}
	rc := GetRetentionConfig()
	targets := []struct {
		table, col string
		days       int
	}{
		{"cve_history", "scanned_at", rc.effective(rc.CVE)},
		{"notifications", "timestamp", rc.effective(rc.Notifications)},
		{"security_audit", "timestamp", rc.effective(rc.SecurityAudit)},
		{"audit_logs", "timestamp", rc.effective(rc.AuditLogs)},
	}
	var total int64
	for _, t := range targets {
		if t.days <= 0 {
			continue // illimité
		}
		cutoff := fmt.Sprintf("-%d days", t.days)
		res, err := db.Exec("DELETE FROM "+t.table+" WHERE "+t.col+" < datetime('now', ?);", cutoff)
		if err != nil {
			continue
		}
		n, _ := res.RowsAffected()
		total += n
	}
	return total, nil
}

// BackupConfig regroupe l'activation des sauvegardes planifiées et le nombre
// de sauvegardes à conserver (0 = illimité).
type BackupConfig struct {
	Enabled bool `json:"enabled"`
	Keep    int  `json:"keep"`
}

// GetBackupConfig lit la configuration des sauvegardes (défaut : activé, 7).
func GetBackupConfig() BackupConfig {
	bc := BackupConfig{Enabled: true, Keep: 7}
	db := GetDB()
	if db == nil {
		return bc
	}
	var enabled, keep sql.NullInt64
	if err := db.QueryRow("SELECT backup_enabled, backup_keep FROM settings WHERE id = 1;").Scan(&enabled, &keep); err != nil {
		return bc
	}
	if enabled.Valid {
		bc.Enabled = enabled.Int64 != 0
	}
	if keep.Valid {
		bc.Keep = int(keep.Int64)
	}
	return bc
}

// SetBackupConfig persiste la configuration des sauvegardes.
func SetBackupConfig(bc BackupConfig) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	if bc.Keep < 0 {
		bc.Keep = 0
	}
	enabled := 0
	if bc.Enabled {
		enabled = 1
	}
	res, err := db.Exec("UPDATE settings SET backup_enabled = ?, backup_keep = ? WHERE id = 1;", enabled, bc.Keep)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = db.Exec("INSERT INTO settings (id, backup_enabled, backup_keep) VALUES (1, ?, ?);", enabled, bc.Keep)
	}
	return err
}

// ==========================================================================
// Operations : Identité SSH SafeDock (pour les hôtes ssh://)
// ==========================================================================

// ensureSSHIdentity retourne (clé privée déchiffrée, clé publique). Si aucune
// identité n'existe encore, elle est générée et persistée (privée chiffrée).
func ensureSSHIdentity() (priv, pub string, err error) {
	db := GetDB()
	if db == nil {
		return "", "", fmt.Errorf("base de données non initialisée")
	}
	var encPriv, pubKey sql.NullString
	_ = db.QueryRow("SELECT ssh_private_key, ssh_public_key FROM settings WHERE id = 1;").Scan(&encPriv, &pubKey)
	if encPriv.Valid && encPriv.String != "" && pubKey.Valid && pubKey.String != "" {
		if dec, derr := crypto.Decrypt(encPriv.String); derr == nil && dec != "" {
			return dec, pubKey.String, nil
		}
	}
	// Génération initiale.
	newPriv, newPub, gerr := crypto.GenerateSSHKeypair()
	if gerr != nil {
		return "", "", gerr
	}
	if serr := storeSSHIdentity(newPriv, newPub); serr != nil {
		return "", "", serr
	}
	return newPriv, newPub, nil
}

// storeSSHIdentity chiffre et persiste la paire (ligne settings unique id=1).
func storeSSHIdentity(priv, pub string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("base de données non initialisée")
	}
	enc, err := crypto.Encrypt(priv)
	if err != nil {
		return err
	}
	res, err := db.Exec("UPDATE settings SET ssh_private_key = ?, ssh_public_key = ? WHERE id = 1;", enc, pub)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_, err = db.Exec("INSERT INTO settings (id, ssh_private_key, ssh_public_key) VALUES (1, ?, ?);", enc, pub)
	}
	return err
}

// GetSSHPublicKey retourne la clé publique SSH de SafeDock (génère l'identité au besoin).
func GetSSHPublicKey() (string, error) {
	_, pub, err := ensureSSHIdentity()
	return pub, err
}

// GetSSHPrivateKey retourne la clé privée SSH (déchiffrée) de SafeDock.
func GetSSHPrivateKey() (string, error) {
	priv, _, err := ensureSSHIdentity()
	return priv, err
}

// RegenerateSSHIdentity génère une nouvelle paire et retourne la nouvelle clé publique.
// Les hôtes ssh:// existants ne seront de nouveau joignables qu'une fois la nouvelle
// clé publique réinstallée sur leurs serveurs.
func RegenerateSSHIdentity() (string, error) {
	newPriv, newPub, err := crypto.GenerateSSHKeypair()
	if err != nil {
		return "", err
	}
	if err := storeSSHIdentity(newPriv, newPub); err != nil {
		return "", err
	}
	return newPub, nil
}
