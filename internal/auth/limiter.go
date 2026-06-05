package auth

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// Protection anti-force-brute : après maxFailedAttempts échecs dans attemptWindow,
// la clé (nom d'utilisateur) est verrouillée pendant lockoutDuration.
const (
	maxFailedAttempts = 5
	attemptWindow     = 15 * time.Minute
	lockoutDuration   = 15 * time.Minute
)

// timeNow est surchargeable en test pour piloter le temps.
var timeNow = time.Now

type attemptState struct {
	count       int
	windowStart time.Time
	lockedUntil time.Time
}

// loginLimiter suit les tentatives de connexion échouées par clé (en mémoire).
type loginLimiter struct {
	mu sync.Mutex
	m  map[string]*attemptState
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{m: make(map[string]*attemptState)}
}

var limiter = newLoginLimiter()

// locked indique si la clé est verrouillée et le temps restant.
func (l *loginLimiter) locked(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := l.m[key]
	if s == nil {
		return false, 0
	}
	if now := timeNow(); now.Before(s.lockedUntil) {
		return true, s.lockedUntil.Sub(now)
	}
	return false, 0
}

// fail enregistre un échec. Retourne true si la clé vient d'être verrouillée.
func (l *loginLimiter) fail(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := timeNow()

	// Garde-fou mémoire : purge paresseuse des entrées totalement expirées.
	if len(l.m) > 4096 {
		for k, st := range l.m {
			if now.After(st.lockedUntil) && now.Sub(st.windowStart) > attemptWindow {
				delete(l.m, k)
			}
		}
	}

	s := l.m[key]
	if s == nil {
		s = &attemptState{windowStart: now}
		l.m[key] = s
	}
	if now.Sub(s.windowStart) > attemptWindow {
		s.count = 0
		s.windowStart = now
	}
	s.count++
	if s.count >= maxFailedAttempts {
		s.lockedUntil = now.Add(lockoutDuration)
		return true, lockoutDuration
	}
	return false, 0
}

// reset efface l'historique d'échecs d'une clé (après une connexion réussie).
func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.m, key)
}

// clientIP extrait l'adresse IP du client (sans le port).
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
