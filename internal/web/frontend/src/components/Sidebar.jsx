import React from 'react';
import {
  LayoutDashboard, Boxes, ShieldCheck, Server, Newspaper,
  Bell, Settings, ChevronsLeft, ChevronsRight, RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'containers',    label: 'Conteneurs',    icon: Boxes },
  { id: 'actions',       label: 'Actions',       icon: ShieldCheck },
  { id: 'agents',        label: 'Agents',        icon: Server },
  { id: 'watch',         label: 'Veille SecOps', icon: Newspaper },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function Sidebar({ activePage, onNavigate, isCollapsed, onToggleCollapse, onRefresh, isRefreshing }) {
  return (
    <aside
      className={cn(
        'flex flex-col h-screen shrink-0 border-r border-white/[0.06] transition-all duration-300',
        'bg-[#0A0C10] relative',
        isCollapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      {/* Ambient orange glow top */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-[#F7931A] opacity-[0.05] blur-[70px] pointer-events-none" />

      {/* Logo row */}
      <div className={cn(
        'flex items-center h-16 border-b border-white/[0.06] px-3 shrink-0 gap-2',
        isCollapsed && 'justify-center'
      )}>
        {!isCollapsed && <SafeDockLogo />}
        {!isCollapsed && (
          <span className="font-heading text-base font-bold tracking-wide text-white flex-1 truncate">SafeDock</span>
        )}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Déplier' : 'Replier'}
          type="button"
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 shrink-0',
            'text-[#94A3B8] hover:text-white bg-white/[0.03] hover:bg-white/[0.06]',
            'border border-white/[0.08] hover:border-[#F7931A]/40',
            isCollapsed ? 'mx-auto' : 'ml-auto'
          )}
        >
          {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav items */}
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
                'w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200',
                'text-sm font-mono font-medium',
                active
                  ? 'bg-[#F7931A]/10 text-[#F7931A] shadow-[inset_0_0_20px_rgba(247,147,26,0.05)]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]',
                isCollapsed && 'justify-center'
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!isCollapsed && <span className="truncate">{label}</span>}
              {active && !isCollapsed && (
                <span className="ml-auto w-1 h-4 rounded-full bg-[#F7931A] shadow-[0_0_8px_rgba(247,147,26,0.9)]" />
              )}
            </button>
          );
        })}
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
            'w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2.5',
            'text-sm font-mono font-semibold transition-all duration-300',
            'bg-gradient-to-r from-[#EA580C]/15 to-[#F7931A]/15 text-[#F7931A]',
            'border border-[#F7931A]/20 hover:border-[#F7931A]/50',
            'hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.4)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            isCollapsed && 'justify-center'
          )}
        >
          <RefreshCw className={cn('w-[18px] h-[18px] shrink-0', isRefreshing && 'animate-spin')} />
          {!isCollapsed && <span>Audit Global</span>}
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          title={isCollapsed ? 'Paramètres' : undefined}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5',
            'text-sm font-mono font-medium transition-all duration-200',
            activePage === 'settings'
              ? 'bg-[#F7931A]/10 text-[#F7931A]'
              : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]',
            isCollapsed && 'justify-center'
          )}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          {!isCollapsed && <span>Paramètres</span>}
        </button>

        {!isCollapsed && (
          <p className="text-[10px] text-[#94A3B8]/30 px-2.5 pt-1 font-mono tracking-wider">
            SafeDock v1.0.0
          </p>
        )}
      </div>
    </aside>
  );
}

function SafeDockLogo() {
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20 3L33 9V21C33 29 20 35 20 35C20 35 7 29 7 21V9Z"
        stroke="url(#sdlg1)" strokeWidth="2.5" strokeLinejoin="round"
      />
      {/* Cube — shifted up 2px for visual centering inside shield */}
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
