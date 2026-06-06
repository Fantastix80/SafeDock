package notifier

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

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
	// Couleur d'accent alignée sur la charte : orange de marque par défaut,
	// rouge sur fond sombre pour les alertes/blocages.
	accent := "#F7931A"
	if !isSuccess {
		accent = "#EF5350"
	}

	// Thème sombre cohérent avec l'application (fond #030304 / carte #0F1115,
	// accent orange, texte clair). Mise en page par table + styles inline pour la
	// compatibilité des clients de messagerie ; le bloc <style> ne fait qu'embellir
	// (code/liens) et dégrade proprement s'il est ignoré.
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark only">
<style>
  body { margin:0; padding:0; background:#030304; }
  .sd-body p { margin:0 0 14px; }
  .sd-body ul { margin:0 0 14px; padding-left:20px; }
  .sd-body li { margin:4px 0; }
  .sd-body strong { color:#FFFFFF; }
  .sd-body code { font-family:'JetBrains Mono',Consolas,Menlo,monospace; background:#0A0C10; border:1px solid rgba(255,255,255,0.10); border-radius:6px; padding:2px 6px; color:#F7931A; font-size:13px; }
  .sd-body a { color:#F7931A; }
</style>
</head>
<body style="margin:0;padding:0;background:#030304;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#030304;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%%;background:#0F1115;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;">
    <tr><td style="height:4px;line-height:4px;font-size:4px;background:%s;">&nbsp;</td></tr>
    <tr><td style="padding:24px 28px 0;">
      <span style="font-family:'Space Grotesk','Inter',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">&#128737;&#65039; SafeDock</span>
    </td></tr>
    <tr><td style="padding:16px 28px 8px;">
      <h2 style="margin:0 0 14px;font-family:'Space Grotesk','Inter',Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;color:%s;">%s</h2>
      <div class="sd-body" style="color:#C7D2DD;font-size:15px;line-height:1.6;">%s</div>
    </td></tr>
    <tr><td style="padding:18px 28px 24px;border-top:1px solid rgba(255,255,255,0.06);">
      <span style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:12px;color:#5B6776;">SafeDock - %d</span>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`, accent, accent, title, contentHTML, time.Now().Year())
}
