import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

const PAGE_META = {
  dashboard:             { title: 'Tableau de bord',           desc: 'Analyse en temps réel de votre parc Docker' },
  containers:            { title: 'Inventaire des conteneurs', desc: 'Statuts, scores de sécurité et métadonnées' },
  compliance:            { title: 'Conformité par tag',        desc: 'Posture de sécurité agrégée par environnement / équipe' },
  watch:                 { title: 'Veille & Menaces',          desc: 'Bulletins de vulnérabilités et guides de durcissement' },
  notifications:         { title: 'Centre de Notifications',  desc: 'Alertes et événements de sécurité récents' },
  account:               { title: 'Mon Compte',                desc: "Identité, sécurité et préférences d'alertes" },
  settings:              { title: 'Configuration',             desc: 'Règles de sécurité globales, accès et politiques' },
  'container-settings':  { title: 'Surcharges du conteneur',  desc: 'Seuils de tolérance spécifiques à ce conteneur' },
  actions:               { title: 'Actions',                   desc: "Mises à jour d'images et correctifs à appliquer" },
  agents:                { title: 'Multi-hôtes',                desc: 'Supervision de plusieurs démons Docker (local + distants en TLS)' },
  permissions:           { title: 'Permissions',               desc: "Contrôle d'accès, rôles et périmètres utilisateurs" },
  'container-detail':    { title: 'Cockpit du conteneur',     desc: 'Détails, scans de vulnérabilités et conformité' },
  'audit':               { title: 'Audit d\'Image',            desc: 'Analysez n\'importe quelle image Docker avant déploiement' },
  exceptions:            { title: 'Risques acceptés',          desc: 'CVE tolérées : visibles mais ne bloquant pas les déploiements' },
  '404':                 { title: 'Ressource introuvable',     desc: "La page demandée n'existe pas" },
};

const ROLE_LABELS = { admin: 'Administrateur', auditor: 'Auditeur', viewer: 'Lecteur' };

// personLabel : "Prénom Nom" si disponibles, sinon l'identifiant (e-mail).
function personLabel(me) {
  return [me?.first_name, me?.last_name].filter(Boolean).join(' ').trim() || me?.username || 'Utilisateur';
}

// personInitials : initiales prénom+nom, sinon les 2 premières lettres de l'identifiant.
function personInitials(me) {
  const a = (me?.first_name || '').trim(), b = (me?.last_name || '').trim();
  if (a && b) return (a[0] + b[0]).toUpperCase();
  const base = a || b || me?.username || '';
  return base ? base.slice(0, 2).toUpperCase() : '?';
}

export default function Header({ activePage, onNavigate, me }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const meta = PAGE_META[activePage] || PAGE_META.dashboard;

  return (
    <header className="h-14 flex items-center px-6 gap-4 border-b border-white/[0.06] bg-[#0A0C10]/90 backdrop-blur-sm shrink-0">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-heading text-base font-semibold text-white truncate">{meta.title}</h1>
          <span className="hidden sm:block text-sm text-[#94A3B8] truncate">{meta.desc}</span>
        </div>
      </div>

      {/* Clock */}
      <span className="hidden md:block text-xs text-[#94A3B8] font-mono tabular-nums">{time}</span>

      {/* Separator */}
      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Profile button — direct navigate to account */}
      <button
        type="button"
        onClick={() => onNavigate('account')}
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-all duration-200',
          'border hover:bg-white/[0.04]',
          activePage === 'account'
            ? 'border-[#F7931A]/30 bg-[#F7931A]/5'
            : 'border-transparent hover:border-white/[0.06]'
        )}
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F7931A] to-[#FFD600] flex items-center justify-center text-xs font-bold text-black shrink-0 shadow-[0_0_12px_rgba(247,147,26,0.5)]">
          {personInitials(me)}
        </div>
        <div className="hidden sm:block text-left">
          <p className="font-heading text-sm font-semibold text-white leading-tight">{personLabel(me)}</p>
          <p className="text-xs text-[#94A3B8] leading-tight font-mono">{ROLE_LABELS[me?.role] || 'Utilisateur'}</p>
        </div>
      </button>
    </header>
  );
}
