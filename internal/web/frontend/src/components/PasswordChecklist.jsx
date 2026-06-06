import React from 'react';
import { Check, X } from 'lucide-react';
import { checkPassword, PASSWORD_RULES } from '../lib/passwordPolicy';

// Indicateur visuel en direct des critères de robustesse d'un mot de passe.
// Tant que `password` est vide, rien n'est affiché (pas de bruit visuel).
export default function PasswordChecklist({ password }) {
  if (!password) return null;
  const checks = checkPassword(password);
  return (
    <ul className="mt-3 space-y-1.5">
      {PASSWORD_RULES.map(({ key, label }) => {
        const ok = checks[key];
        return (
          <li key={key} className="flex items-center gap-2 text-xs font-mono">
            {ok
              ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
              : <X className="w-3.5 h-3.5 shrink-0 text-[#94A3B8]/40" strokeWidth={3} />}
            <span className={ok ? 'text-emerald-400' : 'text-[#94A3B8]/60'}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
