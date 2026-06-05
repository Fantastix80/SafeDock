package crypto

import (
	"os"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// TestMain initialise une clé maître éphémère pour toute la suite crypto.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "safedock-crypto-test")
	if err != nil {
		panic(err)
	}
	if err := Init(dir); err != nil {
		panic(err)
	}
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	cases := []string{"", "secret", "mot de passe é@#", "a longer secret with spaces and 1234567890"}
	for _, plain := range cases {
		enc, err := Encrypt(plain)
		if err != nil {
			t.Fatalf("Encrypt(%q) erreur : %v", plain, err)
		}
		if plain != "" && !IsEncrypted(enc) {
			t.Errorf("Encrypt(%q) devrait être marqué chiffré : %q", plain, enc)
		}
		dec, err := Decrypt(enc)
		if err != nil {
			t.Fatalf("Decrypt erreur : %v", err)
		}
		if dec != plain {
			t.Errorf("roundtrip : attendu %q, obtenu %q", plain, dec)
		}
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	// Le nonce aléatoire doit produire deux chiffrés différents pour le même clair.
	a, _ := Encrypt("identique")
	b, _ := Encrypt("identique")
	if a == b {
		t.Error("deux chiffrements du même clair sont identiques (nonce non aléatoire ?)")
	}
}

func TestDecryptPlaintextPassthrough(t *testing.T) {
	// Une valeur historique non marquée doit être retournée telle quelle.
	got, err := Decrypt("valeur-en-clair")
	if err != nil || got != "valeur-en-clair" {
		t.Errorf("passthrough clair échoué : got=%q err=%v", got, err)
	}
}

func TestPasswordVerifier(t *testing.T) {
	v := PasswordVerifier("CorrectHorse10")
	if v == "" {
		t.Fatal("vérificateur vide")
	}
	if !VerifyPassword("CorrectHorse10", v) {
		t.Error("le bon mot de passe devrait être vérifié")
	}
	if VerifyPassword("mauvais", v) {
		t.Error("un mauvais mot de passe ne devrait pas passer")
	}
	if VerifyPassword("CorrectHorse10", "") {
		t.Error("un vérificateur vide ne devrait jamais valider")
	}
}

func TestTokenSignAndParse(t *testing.T) {
	tok, err := NewToken(ScopeSession, 42, "admin", time.Hour)
	if err != nil {
		t.Fatalf("NewToken erreur : %v", err)
	}
	claims, ok := ParseToken(tok, ScopeSession)
	if !ok {
		t.Fatal("le jeton valide devrait être accepté")
	}
	if claims.UserID != 42 || claims.Role != "admin" || claims.Scope != ScopeSession {
		t.Errorf("claims incorrects : %+v", claims)
	}
}

func TestTokenWrongScopeRejected(t *testing.T) {
	tok, _ := NewToken(ScopePreAuth, 1, "viewer", time.Hour)
	if _, ok := ParseToken(tok, ScopeSession); ok {
		t.Error("un jeton de pré-auth ne doit pas être accepté comme session")
	}
}

func TestTokenTamperedRejected(t *testing.T) {
	tok, _ := NewToken(ScopeSession, 1, "admin", time.Hour)
	tampered := tok[:len(tok)-2] + "xy"
	if _, ok := ParseToken(tampered, ScopeSession); ok {
		t.Error("un jeton à signature altérée doit être rejeté")
	}
}

func TestTokenExpiredRejected(t *testing.T) {
	tok, _ := NewToken(ScopeSession, 1, "admin", -time.Minute) // déjà expiré
	if _, ok := ParseToken(tok, ScopeSession); ok {
		t.Error("un jeton expiré doit être rejeté")
	}
}

func TestTOTPValidate(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	if err != nil {
		t.Fatalf("GenerateTOTPSecret : %v", err)
	}
	step := uint64(time.Now().Unix()) / totpPeriod
	code, err := totpAt(secret, step)
	if err != nil {
		t.Fatalf("totpAt : %v", err)
	}
	if !ValidateTOTP(secret, code) {
		t.Error("le code TOTP courant devrait être valide")
	}
	if ValidateTOTP(secret, "000000") && code != "000000" {
		t.Error("un code arbitraire ne devrait pas valider")
	}
	if ValidateTOTP(secret, "12345") {
		t.Error("un code de mauvaise longueur ne devrait pas valider")
	}
}

func TestGenerateSSHKeypair(t *testing.T) {
	priv, pub, err := GenerateSSHKeypair()
	if err != nil {
		t.Fatalf("GenerateSSHKeypair : %v", err)
	}
	// La clé privée doit être parseable comme dans le dialer SSH (ssh.ParsePrivateKey).
	if _, perr := ssh.ParsePrivateKey([]byte(priv)); perr != nil {
		t.Errorf("clé privée non parseable : %v", perr)
	}
	// La clé publique doit être au format authorized_keys.
	if _, _, _, _, aerr := ssh.ParseAuthorizedKey([]byte(pub)); aerr != nil {
		t.Errorf("clé publique invalide : %v", aerr)
	}
	if SSHFingerprint(pub) == "" {
		t.Error("empreinte SHA256 vide")
	}
	// Deux générations doivent différer.
	priv2, _, _ := GenerateSSHKeypair()
	if priv == priv2 {
		t.Error("deux générations produisent la même clé")
	}
}

func TestBackupCodes(t *testing.T) {
	codes, err := GenerateBackupCodes(10)
	if err != nil {
		t.Fatalf("GenerateBackupCodes : %v", err)
	}
	if len(codes) != 10 {
		t.Fatalf("attendu 10 codes, obtenu %d", len(codes))
	}
	// Le hash doit être insensible à la casse et aux tirets.
	h1 := HashBackupCode(codes[0])
	h2 := HashBackupCode(" " + codes[0] + " ")
	if h1 != h2 {
		t.Error("la normalisation du code de secours devrait donner le même hash")
	}
	if HashBackupCode(codes[0]) == HashBackupCode(codes[1]) {
		t.Error("deux codes différents ne devraient pas avoir le même hash")
	}
}
