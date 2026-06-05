package auth

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// Protection anti-force-brute. On verrouille sur DEUX axes :
//   - par compte (nom d'utilisateur) : stoppe le devinage ciblé d'un mot de passe ;
//   - par IP cliente : stoppe le « password spraying » (un mot de passe testé sur
//     de nombreux comptes depuis une même source) que le verrou par compte ne voit pas.
// Le verrou s'allonge à chaque récidive (backoff exponentiel borné).
const (
	maxFailedAttempts = 5  // seuil par compte
	maxIPAttempts     = 20 // seuil par IP (plus large : agrège tous les comptes)
	attemptWindow     = 15 * time.Minute
	lockoutDuration   = 15 * time.Minute
	maxBackoffShift   = 4 // plafond : lockoutDuration << 4 = 4 heures
)

// timeNow est surchargeable en test pour piloter le temps.
var timeNow = time.Now

type attemptState struct {
	count       int
	windowStart time.Time
	lockedUntil time.Time
	lockCount   int // nombre de verrouillages successifs (pour le backoff)
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

// lockedAny indique si AU MOINS une des clés (compte ou IP) est verrouillée.
func (l *loginLimiter) lockedAny(keys ...string) (bool, time.Duration) {
	for _, k := range keys {
		if locked, d := l.locked(k); locked {
			return true, d
		}
	}
	return false, 0
}

// fail enregistre un échec pour la clé donnée, verrouillée au-delà de `max`
// tentatives dans la fenêtre. Retourne true si la clé vient d'être verrouillée.
// La durée de verrouillage croît à chaque récidive (backoff exponentiel borné).
func (l *loginLimiter) fail(key string, max int) (bool, time.Duration) {
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
	if s.count >= max {
		shift := s.lockCount
		if shift > maxBackoffShift {
			shift = maxBackoffShift
		}
		dur := lockoutDuration << uint(shift)
		s.lockedUntil = now.Add(dur)
		s.lockCount++
		s.count = 0 // repart à zéro pour la prochaine salve après expiration
		return true, dur
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
