package auth

import (
	"testing"
	"time"
)

func TestLimiterLockout(t *testing.T) {
	l := newLoginLimiter()
	key := "user@example.com"
	// Les premiers échecs ne verrouillent pas.
	for i := 0; i < maxFailedAttempts-1; i++ {
		if locked, _ := l.fail(key); locked {
			t.Fatalf("verrouillé trop tôt (échec %d)", i+1)
		}
		if lk, _ := l.locked(key); lk {
			t.Fatalf("ne devrait pas être verrouillé (échec %d)", i+1)
		}
	}
	// Le N-ième échec verrouille.
	locked, dur := l.fail(key)
	if !locked {
		t.Fatal("devrait être verrouillé après maxFailedAttempts échecs")
	}
	if dur <= 0 {
		t.Error("durée de verrouillage attendue > 0")
	}
	if lk, _ := l.locked(key); !lk {
		t.Error("locked() devrait renvoyer true après verrouillage")
	}
}

func TestLimiterReset(t *testing.T) {
	l := newLoginLimiter()
	key := "a"
	for i := 0; i < maxFailedAttempts; i++ {
		l.fail(key)
	}
	if lk, _ := l.locked(key); !lk {
		t.Fatal("devrait être verrouillé")
	}
	l.reset(key)
	if lk, _ := l.locked(key); lk {
		t.Error("après reset, ne devrait plus être verrouillé")
	}
}

func TestLimiterLockExpiry(t *testing.T) {
	l := newLoginLimiter()
	orig := timeNow
	defer func() { timeNow = orig }()
	base := time.Now()
	timeNow = func() time.Time { return base }

	key := "b"
	for i := 0; i < maxFailedAttempts; i++ {
		l.fail(key)
	}
	if lk, _ := l.locked(key); !lk {
		t.Fatal("verrouillage attendu")
	}
	// Au-delà de la durée de verrouillage → libéré.
	timeNow = func() time.Time { return base.Add(lockoutDuration + time.Second) }
	if lk, _ := l.locked(key); lk {
		t.Error("le verrouillage devrait avoir expiré")
	}
}

func TestLimiterWindowReset(t *testing.T) {
	l := newLoginLimiter()
	orig := timeNow
	defer func() { timeNow = orig }()
	base := time.Now()
	cur := base
	timeNow = func() time.Time { return cur }

	key := "c"
	for i := 0; i < maxFailedAttempts-1; i++ {
		l.fail(key)
	}
	// Échec suivant bien après la fenêtre → compteur réinitialisé, pas de verrouillage.
	cur = base.Add(attemptWindow + time.Minute)
	if locked, _ := l.fail(key); locked {
		t.Error("ne devrait pas verrouiller : les échecs sont hors fenêtre")
	}
}
