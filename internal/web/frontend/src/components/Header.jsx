import React, { useState, useEffect } from 'react';
import { ChevronDown, UserCog, Bell, SlidersHorizontal, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';

const PAGE_META = {
  dashboard:             { title: 'Tableau de bord',           desc: 'Analyse en temps réel de votre parc Docker' },
  containers:            { title: 'Inventaire des conteneurs', desc: 'Statuts, scores SecOps et métadonnées' },
  watch:                 { title: 'Veille SecOps & Menaces',   desc: 'Bulletins de vulnérabilités et guides de durcissement' },
  notifications:         { title: 'Centre de Notifications',  desc: 'Alertes et événements de sécurité récents' },
  account:               { title: 'Mon Compte',                desc: "Identité, préférences d'alertes et jetons d'accès" },
  settings:              { title: 'Configuration',             desc: 'Règles SecOps globales, accès et politiques' },
  'container-settings':  { title: 'Surcharges du conteneur',  desc: 'Seuils de tolérance spécifiques à ce conteneur' },
  actions:               { title: 'Actions SecOps',            desc: 'Déploiements, rollouts et correctifs à appliquer' },
  agents:                { title: 'Agents SecOps',             desc: 'Gestion des agents de surveillance distribués' },
  permissions:           { title: 'Permissions',               desc: "Contrôle d'accès, rôles et périmètres utilisateurs" },
  'container-detail':    { title: 'Cockpit du conteneur',     desc: 'Détails, scans de vulnérabilités et conformité' },
  '404':                 { title: 'Ressource introuvable',     desc: "La page demandée n'existe pas" },
};

export default function Header({ activePage, onNavigate }) {
  const [time, setTime] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
      }));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [dropdownOpen]);

  const meta = PAGE_META[activePage] || PAGE_META.dashboard;

  return (
    <header className="h-14 flex items-center px-6 gap-4 border-b border-white/[0.06] bg-[#0A0C10]/90 backdrop-blur-sm shrink-0">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-heading text-sm font-semibold text-white truncate">{meta.title}</h1>
          <span className="hidden sm:block text-[11px] text-[#94A3B8] truncate">{meta.desc}</span>
        </div>
      </div>

      {/* LIVE indicator */}
      <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#F7931A]/25 bg-[#F7931A]/5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#F7931A]" />
        </span>
        <span className="text-[10px] font-mono text-[#F7931A] tracking-widest">LIVE</span>
      </div>

      {/* Clock */}
      <span className="hidden md:block text-[11px] text-[#94A3B8] font-mono tabular-nums">{time}</span>

      {/* Separator */}
      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Profile dropdown */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06] transition-all duration-200"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F7931A] to-[#FFD600] flex items-center justify-center text-xs font-bold text-black shrink-0 shadow-[0_0_12px_rgba(247,147,26,0.5)]">
            H
          </div>
          <div className="hidden sm:block text-left">
            <p className="font-heading text-xs font-semibold text-white leading-tight">Hell0W0rld</p>
            <p className="text-[10px] text-[#94A3B8] leading-tight font-mono">SecOps Admin</p>
          </div>
          <ChevronDown className={cn(
            'w-3.5 h-3.5 text-[#94A3B8] transition-transform duration-200',
            dropdownOpen && 'rotate-180'
          )} />
        </button>

        {dropdownOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-52 py-1 z-50 bg-[#0F1115] border border-white/[0.1] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)]"
          >
            <div className="px-3 py-2.5 border-b border-white/[0.06]">
              <p className="font-heading text-xs font-semibold text-white">Hell0W0rld</p>
              <p className="text-[10px] text-[#94A3B8] mt-0.5 font-mono">secops-admin@safedock.local</p>
            </div>
            {[
              { icon: UserCog,         label: 'Mon compte',           page: 'account' },
              { icon: Bell,            label: "Préférences d'alertes", page: 'notifications' },
              { icon: SlidersHorizontal, label: 'Paramètres globaux', page: 'settings' },
              { icon: Building2,       label: 'Organisation',          page: 'settings' },
            ].map(({ icon: Icon, label, page }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => { setDropdownOpen(false); onNavigate(page); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#94A3B8] hover:text-white hover:bg-white/[0.04] transition-colors group"
              >
                <Icon className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F7931A] transition-colors" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
