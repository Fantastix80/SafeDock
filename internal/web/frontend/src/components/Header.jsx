import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

const PAGE_META = {
  dashboard:             { title: 'Tableau de bord',           desc: 'Analyse en temps rÃ©el de votre parc Docker' },
  containers:            { title: 'Inventaire des conteneurs', desc: 'Statuts, scores SecOps et mÃ©tadonnÃ©es' },
  watch:                 { title: 'Veille SecOps & Menaces',   desc: 'Bulletins de vulnÃ©rabilitÃ©s et guides de durcissement' },
  notifications:         { title: 'Centre de Notifications',  desc: 'Alertes et Ã©vÃ©nements de sÃ©curitÃ© rÃ©cents' },
  account:               { title: 'Mon Compte',                desc: "IdentitÃ©, sÃ©curitÃ© et prÃ©fÃ©rences d'alertes" },
  settings:              { title: 'Configuration',             desc: 'RÃ¨gles SecOps globales, accÃ¨s et politiques' },
  'container-settings':  { title: 'Surcharges du conteneur',  desc: 'Seuils de tolÃ©rance spÃ©cifiques Ã  ce conteneur' },
  actions:               { title: 'Actions SecOps',            desc: 'DÃ©ploiements, rollouts et correctifs Ã  appliquer' },
  agents:                { title: 'Agents SecOps',             desc: 'Gestion des agents de surveillance distribuÃ©s' },
  permissions:           { title: 'Permissions',               desc: "ContrÃ´le d'accÃ¨s, rÃ´les et pÃ©rimÃ¨tres utilisateurs" },
  'container-detail':    { title: 'Cockpit du conteneur',     desc: 'DÃ©tails, scans de vulnÃ©rabilitÃ©s et conformitÃ©' },
  'audit':               { title: 'Audit d\'Image',            desc: 'Analysez n\'importe quelle image Docker avant dÃ©ploiement' },
  '404':                 { title: 'Ressource introuvable',     desc: "La page demandÃ©e n'existe pas" },
};

export default function Header({ activePage, onNavigate }) {
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

      {/* LIVE indicator */}
      <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#F7931A]/25 bg-[#F7931A]/5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#F7931A]" />
        </span>
        <span className="text-xs font-mono text-[#F7931A] tracking-widest">LIVE</span>
      </div>

      {/* Clock */}
      <span className="hidden md:block text-xs text-[#94A3B8] font-mono tabular-nums">{time}</span>

      {/* Separator */}
      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Profile button â€” direct navigate to account */}
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
          H
        </div>
        <div className="hidden sm:block text-left">
          <p className="font-heading text-sm font-semibold text-white leading-tight">Hell0W0rld</p>
          <p className="text-xs text-[#94A3B8] leading-tight font-mono">SecOps Admin</p>
        </div>
      </button>
    </header>
  );
}
