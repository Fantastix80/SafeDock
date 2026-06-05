import React from 'react';
import {
  LayoutDashboard, Boxes, ShieldCheck, Server, Newspaper,
  Bell, Settings, ChevronsLeft, ChevronsRight, RefreshCw, ScanSearch, LogOut, ShieldOff, Users, BadgeCheck
} from 'lucide-react';
import { cn } from '../lib/utils';

// Navigation groupée. La section « Administration » (adminOnly) n'est rendue
// que pour le rôle admin — la sidebar reste épurée pour les autres rôles.
const NAV_GROUPS = [
  {
    title: 'Supervision',
    items: [
      { id: 'dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
      { id: 'containers',    label: 'Conteneurs',    icon: Boxes },
      { id: 'compliance',    label: 'Conformité',    icon: BadgeCheck },
      { id: 'audit',         label: 'Audit',         icon: ScanSearch, minRole: 'auditor' },
      { id: 'watch',         label: 'Veille SecOps', icon: Newspaper },
      { id: 'notifications', label: 'Notifications', icon: Bell, minRole: 'auditor' },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [
      { id: 'users',      label: 'Utilisateurs',     icon: Users },
      { id: 'agents',      label: 'Multi-hôtes',      icon: Server },
      { id: 'actions',     label: 'Actions',          icon: ShieldCheck },
      { id: 'exceptions',  label: 'Risques acceptés', icon: ShieldOff },
      { id: 'settings',    label: 'Paramètres',       icon: Settings },
    ],
  },
];

export default function Sidebar({ activePage, onNavigate, isCollapsed, onToggleCollapse, onRefresh, isRefreshing, onLogout, role }) {
  const rank = { viewer: 1, auditor: 2, admin: 3 };
  const myRank = rank[role] || 1;
  const groups = NAV_GROUPS
    .filter(g => !g.adminOnly || role === 'admin')
    .map(g => ({ ...g, items: g.items.filter(it => myRank >= (rank[it.minRole] || 1)) }))
    .filter(g => g.items.length > 0);
  return (
    <aside
      className={cn(
        'relative flex flex-col h-screen shrink-0 border-r border-white/[0.06] transition-all duration-300',
        'bg-[#0A0C10]',
        isCollapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      {/* Ambient glow */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-[#F7931A] opacity-[0.05] blur-[70px] pointer-events-none" />

      {/* Collapse toggle — straddles the right sidebar border at header mid-height */}
      <button
        onClick={onToggleCollapse}
        title={isCollapsed ? 'Déplier' : 'Replier'}
        type="button"
        className={cn(
          'absolute top-8 right-0 z-20',
          '-translate-y-1/2 translate-x-1/2',
          'w-6 h-6 flex items-center justify-center rounded-full',
          'bg-[#0F1115] border border-white/[0.18] shadow-lg',
          'text-[#94A3B8] hover:text-[#F7931A] hover:border-[#F7931A]/50',
          'transition-all duration-200'
        )}
      >
        {isCollapsed
          ? <ChevronsRight className="w-3 h-3" />
          : <ChevronsLeft className="w-3 h-3" />
        }
      </button>

      {/* Logo row — clickable, navigates home */}
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={cn(
          'flex items-center h-16 shrink-0 border-b border-white/[0.06]',
          'transition-colors duration-200 hover:bg-white/[0.02]',
          isCollapsed ? 'justify-center px-3' : 'px-4'
        )}
      >
        <SafeDockLogo size={isCollapsed ? 30 : 36} />
        <span className={cn(
          'font-heading text-xl font-bold tracking-wide text-white whitespace-nowrap overflow-hidden',
          'transition-all duration-300',
          isCollapsed ? 'max-w-0 ml-0 opacity-0' : 'max-w-[160px] ml-3 opacity-100'
        )}>
          SafeDock
        </span>
      </button>

      {/* Nav — groupée par section (Supervision / Administration) */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden" aria-label="Navigation">
        {groups.map((group, gi) => (
          <div key={group.title} className={cn('space-y-0.5', gi > 0 && 'mt-2')}>
            {isCollapsed
              ? (gi > 0 && <div className="mx-2 my-2 border-t border-white/[0.06]" />)
              : <p className="px-2.5 pt-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-[#94A3B8]/40">{group.title}</p>}
            {group.items.map(({ id, label, icon: Icon }) => {
              const active = activePage === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={active ? 'page' : undefined}
                  title={isCollapsed ? label : undefined}
                  className={cn(
                    'w-full flex items-center rounded-xl px-2.5 py-2.5 transition-all duration-200',
                    'text-base font-mono font-medium',
                    isCollapsed && 'justify-center',
                    active
                      ? 'bg-[#F7931A]/10 text-[#F7931A] shadow-[inset_0_0_20px_rgba(247,147,26,0.05)]'
                      : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
                  )}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className={cn(
                    'truncate whitespace-nowrap overflow-hidden transition-all duration-300',
                    isCollapsed ? 'max-w-0 ml-0 opacity-0' : 'max-w-[160px] ml-3 opacity-100'
                  )}>
                    {label}
                  </span>
                  <span className={cn(
                    'shrink-0 rounded-full bg-[#F7931A] shadow-[0_0_8px_rgba(247,147,26,0.9)] transition-all duration-300',
                    (active && !isCollapsed) ? 'ml-auto w-1 h-4 opacity-100' : 'w-0 h-4 opacity-0 overflow-hidden'
                  )} />
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-3 space-y-1 border-t border-white/[0.06] pt-3 shrink-0">
        {/* Global audit */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={isCollapsed ? 'Audit Global' : undefined}
          className={cn(
            'w-full flex items-center rounded-xl px-2.5 py-2.5',
            'text-base font-mono font-semibold transition-all duration-300',
            'bg-gradient-to-r from-[#EA580C]/15 to-[#F7931A]/15 text-[#F7931A]',
            'border border-[#F7931A]/20 hover:border-[#F7931A]/50',
            'hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.4)]',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-[18px] h-[18px] shrink-0', isRefreshing && 'animate-spin')} />
          <span className={cn(
            'whitespace-nowrap overflow-hidden transition-all duration-300',
            isCollapsed ? 'max-w-0 ml-0 opacity-0' : 'max-w-[160px] ml-2.5 opacity-100'
          )}>
            Audit Global
          </span>
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title={isCollapsed ? 'Déconnexion' : undefined}
          className={cn(
            'w-full flex items-center rounded-xl px-2.5 py-2.5',
            'text-base font-mono font-medium transition-all duration-200',
            'text-[#94A3B8] hover:text-red-400 hover:bg-red-500/[0.06]'
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className={cn(
            'whitespace-nowrap overflow-hidden transition-all duration-300',
            isCollapsed ? 'max-w-0 ml-0 opacity-0' : 'max-w-[160px] ml-3 opacity-100'
          )}>
            Déconnexion
          </span>
        </button>

        {/* Version */}
        <span className={cn(
          'block text-xs text-[#94A3B8]/30 px-2.5 pt-1 font-mono tracking-wider whitespace-nowrap overflow-hidden transition-all duration-300',
          isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
        )}>
          SafeDock v1.0.0
        </span>
      </div>
    </aside>
  );
}

function SafeDockLogo({ size = 36 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20 3L33 9V21C33 29 20 35 20 35C20 35 7 29 7 21V9Z"
        stroke="url(#sdlg1)" strokeWidth="2.5" strokeLinejoin="round"
      />
      <path d="M20 12L27 15L20 18L13 15Z" fill="url(#sdlg2)" opacity="0.9" />
      <path d="M13 15L20 18V26L13 23Z" fill="#EA580C" opacity="0.75" />
      <path d="M20 18L27 15V23L20 26Z" fill="#F7931A" />
      <defs>
        <linearGradient id="sdlg1" x1="7" y1="3" x2="33" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7931A" />
          <stop offset="1" stopColor="#FFD600" />
        </linearGradient>
        <linearGradient id="sdlg2" x1="13" y1="12" x2="27" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD600" />
          <stop offset="1" stopColor="#F7931A" />
        </linearGradient>
      </defs>
    </svg>
  );
}
