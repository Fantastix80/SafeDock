import React, { useState, useEffect } from 'react';
import { Moon, Sun, ChevronDown, UserCog, Bell, SlidersHorizontal, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';

const PAGE_META = {
  dashboard:           { title: 'Tableau de bord', desc: 'Analyse en temps réel de votre parc Docker' },
  containers:          { title: 'Inventaire des conteneurs', desc: 'Statuts, scores SecOps et métadonnées' },
  watch:               { title: 'Veille SecOps & Menaces', desc: 'Bulletins de vulnérabilités et guides de durcissement' },
  notifications:       { title: 'Centre de Notifications', desc: 'Alertes et événements de sécurité récents' },
  account:             { title: 'Mon Compte', desc: 'Identité, préférences d\'alertes et jetons d\'accès' },
  settings:            { title: 'Configuration', desc: 'Règles SecOps globales, accès et politiques' },
  'container-settings':{ title: 'Surcharges du conteneur', desc: 'Seuils de tolérance spécifiques à ce conteneur' },
  actions:             { title: 'Actions SecOps', desc: 'Déploiements, rollouts et correctifs à appliquer' },
  agents:              { title: 'Agents SecOps', desc: 'Gestion des agents de surveillance distribués' },
  permissions:         { title: 'Permissions', desc: 'Contrôle d\'accès, rôles et périmètres utilisateurs' },
  'container-detail':  { title: 'Cockpit du conteneur', desc: 'Détails, scans de vulnérabilités et conformité' },
  '404':               { title: 'Ressource introuvable', desc: 'La page demandée n\'existe pas' },
};

export default function Header({ activePage, theme, onToggleTheme, onNavigate }) {
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
    <header className="h-14 flex items-center px-6 gap-4 border-b border-white/[0.06] bg-[#0d1120]/80 backdrop-blur-sm shrink-0">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-zinc-100 truncate">{meta.title}</h1>
          <span className="hidden sm:block text-[11px] text-zinc-500 truncate">{meta.desc}</span>
        </div>
      </div>

      {/* Clock */}
      <span className="hidden md:block text-[11px] text-zinc-500 tabular-nums">{time}</span>

      {/* Separator */}
      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={() => onToggleTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Basculer le thème"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
      >
        {theme === 'dark'
          ? <Moon className="w-4 h-4" />
          : <Sun className="w-4 h-4" />
        }
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Profile */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.05] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
            H
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-zinc-100 leading-tight">Hell0W0rld</p>
            <p className="text-[10px] text-zinc-500 leading-tight">SecOps Admin</p>
          </div>
          <ChevronDown className={cn(
            'w-3.5 h-3.5 text-zinc-500 transition-transform duration-150',
            dropdownOpen && 'rotate-180'
          )} />
        </button>

        {dropdownOpen && (
          <div
            role="menu"
            className={cn(
              'absolute right-0 top-full mt-2 w-52 py-1 z-50',
              'bg-[#151d2e] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40'
            )}
          >
            <div className="px-3 py-2.5 border-b border-white/[0.06]">
              <p className="text-xs font-semibold text-zinc-100">Hell0W0rld</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">secops-admin@safedock.local</p>
            </div>

            {[
              { icon: UserCog, label: 'Mon compte', page: 'account' },
              { icon: Bell, label: "Préférences d'alertes", page: 'notifications' },
              { icon: SlidersHorizontal, label: 'Paramètres globaux', page: 'settings' },
              { icon: Building2, label: "Organisation", page: 'settings' },
            ].map(({ icon: Icon, label, page }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => { setDropdownOpen(false); onNavigate(page); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-zinc-500" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
