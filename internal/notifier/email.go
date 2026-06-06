package notifier

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"

	"github.com/safedock/safedock/internal/config"
)

// SendEmail envoie un e-mail HTML sécurisé à un ou plusieurs destinataires
// explicites, en gérant TLS et STARTTLS automatiquement. Le destinataire n'est
// plus une valeur globale de configuration : chaque appelant fournit la liste des
// adresses (ex. l'invité pour une invitation ; à terme, les abonnés d'une alerte).
func SendEmail(cfg *config.SMTPConfig, to []string, subject, htmlBody string) error {
	// Fallback si SMTP n'est pas configuré
	if cfg.Host == "" {
		fmt.Println("[SMTP WARNING] Serveur SMTP non configuré. Envoi d'e-mail ignoré.")
		return nil
	}

	// Nettoyage des destinataires (vides ignorés). Sans destinataire → rien à envoyer.
	recipients := make([]string, 0, len(to))
	for _, addr := range to {
		if a := strings.TrimSpace(addr); a != "" {
			recipients = append(recipients, a)
		}
	}
	if len(recipients) == 0 {
		fmt.Println("[SMTP] Aucun destinataire pour cet e-mail. Envoi ignoré.")
		return nil
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	// Construction du message de type MIME (HTML + UTF-8)
	headers := make(map[string]string)
	headers["From"] = cfg.From
	headers["To"] = strings.Join(recipients, ", ")
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = `text/html; charset="UTF-8"`

	message := ""
	for k, v := range headers {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + htmlBody

	// Configuration TLS
	tlsConfig := &tls.Config{
		InsecureSkipVerify: cfg.TLSSkipVerify,
		ServerName:         cfg.Host,
	}

	var auth smtp.Auth
	if cfg.User != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.User, cfg.Password, cfg.Host)
	}

	// 1. Gestion du chiffrement Direct TLS (port standard 465)
	if cfg.Port == 465 {
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("impossible de se connecter via SSL/TLS au port 465 : %w", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return fmt.Errorf("impossible de créer le client SMTP SSL : %w", err)
		}
		defer client.Close()

		if auth != nil {
			if err = client.Auth(auth); err != nil {
				return fmt.Errorf("authentification SMTP SSL échouée : %w", err)
			}
		}

		if err = sendMailViaClient(client, cfg.From, strings.Join(recipients, ","), message); err != nil {
			return err
		}

		fmt.Printf("📩 E-mail SafeDock envoyé avec succès (SSL/TLS) à %s !\n", strings.Join(recipients, ", "))
		return nil
	}

	// 2. Gestion du chiffrement Standard / STARTTLS (ports standards 587, 25)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("impossible de se connecter au port %d : %w", cfg.Port, err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return fmt.Errorf("impossible d'initialiser STARTTLS client : %w", err)
	}
	defer client.Close()

	// Envoi de la commande STARTTLS si supportée par le serveur
	if hasStartTLS, _ := client.Extension("STARTTLS"); hasStartTLS {
		if err = client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("échec de la négociation STARTTLS : %w", err)
		}
	}

	if auth != nil {
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("authentification STARTTLS échouée : %w", err)
		}
	}

	if err = sendMailViaClient(client, cfg.From, strings.Join(recipients, ","), message); err != nil {
		return err
	}

	fmt.Printf("📩 E-mail SafeDock envoyé avec succès (STARTTLS) à %s !\n", strings.Join(recipients, ", "))
	return nil
}

// sendMailViaClient envoie le message via un client SMTP actif.
func sendMailViaClient(c *smtp.Client, from, to, message string) error {
	if err := c.Mail(from); err != nil {
		return err
	}
	// Permet d'envoyer à plusieurs destinataires si séparés par des virgules
	for _, addr := range strings.Split(to, ",") {
		if err := c.Rcpt(strings.TrimSpace(addr)); err != nil {
			return err
		}
	}
	
	w, err := c.Data()
	if err != nil {
		return err
	}
	
	_, err = w.Write([]byte(message))
	if err != nil {
		return err
	}
	
	err = w.Close()
	if err != nil {
		return err
	}
	
	return c.Quit()
}

// BuildHTMLReport génère un template HTML esthétique et haut de gamme pour l'e-mail.
func BuildHTMLReport(title string, contentHTML string, isSuccess bool) string {
	colorHeader := "#e03e2f" // Rouge/Orange pour alertes/blocages
	if isSuccess {
		colorHeader = "#00b16a" // Vert pour succès
	}

	return fmt.Sprintf(`
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="utf-8">
		<style>
			body { font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; color: #333; margin: 0; padding: 20px; }
			.container { max-width: 650px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin: 0 auto; }
			.header { background-color: %s; color: #ffffff; padding: 25px; text-align: center; font-size: 24px; font-weight: bold; }
			.content { padding: 30px; line-height: 1.6; }
			.footer { background-color: #fafbfc; border-top: 1px solid #ededed; color: #777; font-size: 12px; text-align: center; padding: 20px; }
			.badge { display: inline-block; padding: 5px 12px; font-weight: bold; border-radius: 4px; font-size: 12px; }
			.badge-fail { background-color: #ffe6e2; color: #e03e2f; }
			.badge-pass { background-color: #e6f9f0; color: #00b16a; }
		</style>
	</head>
	<body>
		<div class="container">
			<div class="header">
				🛡️ SafeDock SecOps Alert
			</div>
			<div class="content">
				<h2>%s</h2>
				%s
			</div>
			<div class="footer">
				SafeDock - Pare-feu de Déploiement Conteneurisé Automatique<br>
				Généré de manière sécurisée en conditions isolées.
			</div>
		</div>
	</body>
	</html>
	`, colorHeader, title, contentHTML)
}
