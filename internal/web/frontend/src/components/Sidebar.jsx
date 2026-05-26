import React from 'react';
import {
  LayoutDashboard, Boxes, ShieldCheck, Server, Newspaper,
  Bell, Lock, Settings, ChevronsLeft, ChevronsRight, RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'containers', label: 'Conteneurs', icon: Boxes },
  { id: 'actions', label: 'Actions', icon: ShieldCheck },
  { id: 'agents', label: 'Agents', icon: Server },
  { id: 'watch', label: 'Veille SecOps', icon: Newspaper },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'permissions', label: 'Permissions', icon: Lock },
];

export default function Sidebar({ activePage, onNavigate, isCollapsed, onToggleCollapse, onRefresh, isRefreshing }) {
  return (
    <aside
      className={cn(
        'flex flex-col h-screen shrink-0 border-r border-white/[0.06] transition-all duration-200',
        'bg-[#0d1120]',
        isCollapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 border-b border-white/[0.06] relative',
        isCollapsed ? 'justify-center px-0' : 'px-4 gap-2.5'
      )}>
        <SafeDockLogo />
        {!isCollapsed && (
          <span className="text-sm font-bold tracking-wide text-zinc-100">SafeDock</span>
        )}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Déplier' : 'Replier'}
          type="button"
          className={cn(
            'absolute -right-3 top-1/2 -translate-y-1/2 z-10',
            'w-6 h-6 rounded-full flex items-center justify-center',
            'bg-[#1a2235] border border-white/[0.1] text-zinc-400',
            'hover:text-zinc-100 hover:border-white/20 transition-colors'
          )}
        >
          {isCollapsed
            ? <ChevronsRight className="w-3 h-3" />
            : <ChevronsLeft className="w-3 h-3" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden" aria-label="Navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={active ? 'page' : undefined}
              title={isCollapsed ? label : undefined}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-brand-muted text-brand-DEFAULT'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]',
                isCollapsed && 'justify-center'
              )}
            >
              <Icon className={cn('shrink-0', active ? 'w-[18px] h-[18px]' : 'w-[18px] h-[18px]')} />
              {!isCollapsed && <span className="truncate">{label}</span>}
              {active && !isCollapsed && (
                <span className="ml-auto w-1 h-4 rounded-full bg-brand-DEFAULT" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-3 space-y-1 border-t border-white/[0.06] pt-3">
        {/* Audit button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={isCollapsed ? 'Audit Global' : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-all',
            'bg-brand-DEFAULT/10 text-brand-DEFAULT hover:bg-brand-DEFAULT/20 border border-brand-DEFAULT/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isCollapsed && 'justify-center'
          )}
        >
          <RefreshCw className={cn('w-[16px] h-[16px] shrink-0', isRefreshing && 'animate-spin')} />
          {!isCollapsed && <span>Audit Global</span>}
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          title={isCollapsed ? 'Paramètres' : undefined}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
            activePage === 'settings'
              ? 'bg-brand-muted text-brand-DEFAULT'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]',
            isCollapsed && 'justify-center'
          )}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          {!isCollapsed && <span>Paramètres</span>}
        </button>

        {!isCollapsed && (
          <p className="text-[10px] text-zinc-600 px-2.5 pt-1">SafeDock v1.0.0</p>
        )}
      </div>
    </aside>
  );
}

function SafeDockLogo() {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 3L33 9V21C33 29 20 35 20 35C20 35 7 29 7 21V9Z"
        stroke="url(#lg1)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M20 14L27 17L20 20L13 17Z" fill="url(#lg2)" opacity="0.9" />
      <path d="M13 17L20 20V28L13 25Z" fill="#4F8EF7" opacity="0.7" />
      <path d="M20 20L27 17V25L20 28Z" fill="#4F8EF7" />
      <defs>
        <linearGradient id="lg1" x1="7" y1="3" x2="33" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F8EF7" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="lg2" x1="13" y1="14" x2="27" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#4F8EF7" />
        </linearGradient>
      </defs>
    </svg>
  );
}
