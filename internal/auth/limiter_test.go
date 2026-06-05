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
		if locked, _ := l.fail(key, maxFailedAttempts); locked {
			t.Fatalf("verrouillé trop tôt (échec %d)", i+1)
		}
		if lk, _ := l.locked(key); lk {
			t.Fatalf("ne devrait pas être verrouillé (échec %d)", i+1)
		}
	}
	// Le N-ième échec verrouille.
	locked, dur := l.fail(key, maxFailedAttempts)
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
		l.fail(key, maxFailedAttempts)
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
		l.fail(key, maxFailedAttempts)
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

func TestLimiterBackoff(t *testing.T) {
	l := newLoginLimiter()
	orig := timeNow
	defer func() { timeNow = orig }()
	base := time.Now()
	timeNow = func() time.Time { return base }

	key := "bo"
	var d1, d2 time.Duration
	for i := 0; i < maxFailedAttempts; i++ {
		if locked, d := l.fail(key, maxFailedAttempts); locked {
			d1 = d
		}
	}
	// Deuxième salve (toujours dans la fenêtre) → verrou plus long (backoff).
	for i := 0; i < maxFailedAttempts; i++ {
		if locked, d := l.fail(key, maxFailedAttempts); locked {
			d2 = d
		}
	}
	if d2 <= d1 {
		t.Errorf("backoff attendu : 2e verrou (%v) devrait dépasser le 1er (%v)", d2, d1)
	}
}

func TestLimiterLockedAny(t *testing.T) {
	l := newLoginLimiter()
	for i := 0; i < maxFailedAttempts; i++ {
		l.fail("ip:1.2.3.4", maxFailedAttempts)
	}
	if lk, _ := l.lockedAny("user:bob", "ip:1.2.3.4"); !lk {
		t.Error("lockedAny devrait détecter le verrou de la clé IP")
	}
	if lk, _ := l.lockedAny("user:bob", "ip:9.9.9.9"); lk {
		t.Error("aucune clé verrouillée → false attendu")
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
		l.fail(key, maxFailedAttempts)
	}
	// Échec suivant bien après la fenêtre → compteur réinitialisé, pas de verrouillage.
	cur = base.Add(attemptWindow + time.Minute)
	if locked, _ := l.fail(key, maxFailedAttempts); locked {
		t.Error("ne devrait pas verrouiller : les échecs sont hors fenêtre")
	}
}
