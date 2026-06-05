package crypto

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"strings"

	"golang.org/x/crypto/ssh"
)

// GenerateSSHKeypair génère une paire de clés SSH ed25519 pour l'identité SafeDock.
// Retourne la clé privée au format OpenSSH (PEM) et la clé publique au format
// authorized_keys ("ssh-ed25519 AAAA... safedock"). La clé privée doit rester
// confidentielle (stockée chiffrée) ; seule la clé publique est destinée à être
// installée sur les hôtes cibles.
func GenerateSSHKeypair() (privatePEM string, publicKey string, err error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("génération de la clé SSH : %w", err)
	}
	block, err := ssh.MarshalPrivateKey(priv, "safedock")
	if err != nil {
		return "", "", fmt.Errorf("encodage de la clé privée SSH : %w", err)
	}
	sshPub, err := ssh.NewPublicKey(pub)
	if err != nil {
		return "", "", fmt.Errorf("encodage de la clé publique SSH : %w", err)
	}
	privatePEM = string(pem.EncodeToMemory(block))
	publicKey = strings.TrimSpace(string(ssh.MarshalAuthorizedKey(sshPub))) + " safedock"
	return privatePEM, publicKey, nil
}

// SSHFingerprint renvoie l'empreinte SHA256 d'une clé publique authorized_keys.
func SSHFingerprint(publicKey string) string {
	pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(publicKey))
	if err != nil {
		return ""
	}
	return ssh.FingerprintSHA256(pub)
}
