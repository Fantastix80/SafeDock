// Helper d'appels API partagé. Centralise deux comportements que tous les
// composants doivent avoir, comme les fetchs de App.jsx :
//   - sur 401 (session expirée) → notifie l'application (retour à l'écran de connexion)
//   - sur erreur HTTP (4xx/5xx) → lève une erreur (fetch ne rejette pas seul sur 4xx/5xx)

let onSessionExpired = () => {};

// Enregistré une fois par App.jsx (ex. () => setAuthed(false)).
export function setSessionExpiredHandler(fn) {
  onSessionExpired = typeof fn === 'function' ? fn : () => {};
}

async function check(res) {
  if (res.status === 401) {
    onSessionExpired();
    throw new Error('Session expirée');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Erreur ${res.status}`);
  }
  return res;
}

async function parse(res) {
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// GET JSON. Retourne l'objet parsé (ou null si corps vide). Lève sur 401/erreur.
export async function apiGet(url) {
  return parse(await check(await fetch(url)));
}

// POST/PUT JSON. Retourne l'objet parsé si présent, sinon null. Lève sur 401/erreur.
export async function apiSend(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse(await check(res));
}
