package api

import (
	"strings"
	"testing"
)

func TestBuildProvisionScript(t *testing.T) {
	pub := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAExampleKeyData safedock"
	script := buildProvisionScript(pub, "safedock", "10.0.1.12")

	checks := []string{
		pub,                                       // la clé publique d'instance est intégrée
		`command="docker system dial-stdio"`,      // verrouillage au relais Docker
		`restrict`,                                // PTY / forwarding désactivés
		`from="10.0.1.12",`,                       // restriction d'origine présente
		`SAFEDOCK_USER='safedock'`,                // utilisateur substitué
		`passwd -l "$SAFEDOCK_USER"`,              // mot de passe verrouillé
		`#!/usr/bin/env bash`,                     // shebang
	}
	for _, c := range checks {
		if !strings.Contains(script, c) {
			t.Errorf("le script généré ne contient pas %q", c)
		}
	}

	// La clé privée ne doit JAMAIS apparaître (le script n'en manipule aucune).
	if strings.Contains(script, "PRIVATE KEY") {
		t.Error("le script ne doit contenir aucune clé privée")
	}
}

func TestBuildProvisionScriptWithoutFrom(t *testing.T) {
	script := buildProvisionScript("ssh-ed25519 AAAA test", "safedock", "")
	if strings.Contains(script, "from=") {
		t.Error("sans IP source, l'option from= ne doit pas être ajoutée")
	}
	// Le jeton shell FROM doit être une chaîne vide littérale.
	if !strings.Contains(script, "FROM=''") {
		t.Error("FROM doit être vide quand aucune IP source n'est fournie")
	}
}
