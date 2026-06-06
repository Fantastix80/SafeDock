// Politique de mot de passe alignée sur les recommandations de l'ANSSI et sur la
// validation côté serveur (internal/crypto/password.go). La vérification est
// dupliquée côté client uniquement pour guider la saisie en direct ; le serveur
// reste l'autorité.

export const PASSWORD_MIN_LENGTH = 12;

// checkPassword renvoie l'état de chaque critère + un booléen global `ok`.
export function checkPassword(pw) {
  const s = pw || '';
  const length = [...s].length >= PASSWORD_MIN_LENGTH;
  const upper = /[A-Z]/.test(s);
  const lower = /[a-z]/.test(s);
  const digit = /[0-9]/.test(s);
  // « spécial » = tout caractère qui n'est ni lettre, ni chiffre, ni espace.
  const special = /[^A-Za-z0-9\s]/.test(s);
  return { length, upper, lower, digit, special, ok: length && upper && lower && digit && special };
}

// Critères affichables (ordre stable pour l'UI).
export const PASSWORD_RULES = [
  { key: 'length', label: `Au moins ${PASSWORD_MIN_LENGTH} caractères` },
  { key: 'upper', label: 'Une majuscule (A-Z)' },
  { key: 'lower', label: 'Une minuscule (a-z)' },
  { key: 'digit', label: 'Un chiffre (0-9)' },
  { key: 'special', label: 'Un caractère spécial (!@#$…)' },
];
