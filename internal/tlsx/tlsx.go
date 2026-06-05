// Package tlsx fournit le certificat TLS de SafeDock pour servir le tableau de bord
// en HTTPS sans dépendre d'un reverse-proxy. Deux modes :
//   - certificat/clé fournis par l'administrateur (fichiers PEM) ;
//   - sinon, génération automatique d'un certificat auto-signé ECDSA, persisté
//     dans le dossier de données pour rester stable entre redémarrages
//     (évite que le navigateur ré-alerte à chaque boot).
package tlsx

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// EnsureSelfSigned charge le certificat auto-signé persistant de <dir>/tls,
// ou le génère s'il est absent. hosts = noms DNS / IP supplémentaires pour les SAN.
func EnsureSelfSigned(dir string, hosts []string) (tls.Certificate, error) {
	tlsDir := filepath.Join(dir, "tls")
	certPath := filepath.Join(tlsDir, "cert.pem")
	keyPath := filepath.Join(tlsDir, "key.pem")

	// Réutilisation si déjà présent (on resserre les permissions de la clé au cas où).
	if fileExists(certPath) && fileExists(keyPath) {
		_ = os.Chmod(keyPath, 0o600)
		return tls.LoadX509KeyPair(certPath, keyPath)
	}

	// Génération.
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("génération de clé TLS échouée : %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, err
	}

	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "SafeDock", Organization: []string{"SafeDock"}},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().AddDate(1, 0, 0), // 1 an
		// Certificat feuille uniquement : pas de CertSign ni IsCA, pour qu'un
		// opérateur qui l'importe dans son magasin de confiance ne fasse pas
		// confiance à une AC capable de signer n'importe quel hôte.
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// SAN : localhost + boucle locale, plus les hôtes fournis.
	tmpl.DNSNames = append(tmpl.DNSNames, "localhost")
	tmpl.IPAddresses = append(tmpl.IPAddresses, net.IPv4(127, 0, 0, 1), net.IPv6loopback)
	for _, h := range hosts {
		if h == "" {
			continue
		}
		if ip := net.ParseIP(h); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, h)
		}
	}

	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("création du certificat échouée : %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return tls.Certificate{}, err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	// Persistance (best-effort : si l'écriture échoue, on sert quand même le cert en mémoire).
	if err := os.MkdirAll(tlsDir, 0o750); err == nil {
		_ = os.WriteFile(certPath, certPEM, 0o600)
		_ = os.WriteFile(keyPath, keyPEM, 0o600)
	}

	return tls.X509KeyPair(certPEM, keyPEM)
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
