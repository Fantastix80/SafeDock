import React, { useState } from 'react';
import { Bell, BellOff, TriangleAlert, CircleAlert, Info, Server, Check, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const TYPE_STYLE = {
  CRITICAL: { border: 'border-l-red-500',  icon: TriangleAlert, color: 'text-red-400',   badge: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  WARNING:  { border: 'border-l-amber-400', icon: CircleAlert,  color: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
  INFO:     { border: 'border-l-[#F7931A]', icon: Info,         color: 'text-[#F7931A]', badge: 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20' },
};

const FILTERS = [
  { id: 'all',      label: 'Toutes' },
  { id: 'critical', label: 'Critique' },
  { id: 'warning',  label: 'Alerte' },
];

function fmtTime(s) {
  if (!s) return '';
  try {
    const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

export default function NotificationsView({ notifications = [], onMarkRead, onRefresh }) {
  const [filter, setFilter] = useState('all');

  const filtered = notifications.filter(n => {
    if (filter === 'critical') return n.level === 'CRITICAL';
    if (filter === 'warning')  return n.level === 'WARNING';
    return true;
  });
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
          <Bell className="w-4 h-4 text-[#94A3B8]" />
          Centre de Notifications
          {unread > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20">{unread} non lue{unread > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3 py-1 text-xs rounded-full font-mono font-medium transition-all duration-200',
                filter === f.id
                  ? 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/30'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border border-transparent'
              )}
            >
              {f.label}
            </button>
          ))}
          {onRefresh && (
            <button type="button" onClick={onRefresh} title="Rafraîchir"
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/[0.04]">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {unread > 0 && onMarkRead && (
            <button type="button" onClick={onMarkRead}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-mono font-medium text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border border-white/[0.08]">
              <Check className="w-3.5 h-3.5" /> Tout marquer comme lu
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-16 flex flex-col items-center gap-3 text-[#94A3B8]/40">
          <BellOff className="w-8 h-8" />
          <p className="text-sm font-mono">Aucune notification dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(n => {
            const s = TYPE_STYLE[n.level] || TYPE_STYLE.INFO;
            const Icon = s.icon;
            return (
              <div key={n.id} className={cn('card p-4 border-l-4 flex gap-4 items-start transition-all', s.border, !n.read && 'bg-white/[0.02]')}>
                <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', s.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="font-heading text-sm font-semibold text-white">
                      {n.title}
                      {!n.read && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-[#F7931A] align-middle" />}
                    </h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('px-1.5 py-0.5 rounded-md font-mono text-xs font-bold', s.badge)}>{n.level}</span>
                      <span className="font-mono text-xs text-[#94A3B8]/40 whitespace-nowrap">{fmtTime(n.timestamp)}</span>
                    </div>
                  </div>
                  {n.body && <p className="text-xs text-[#94A3B8] mb-2 leading-relaxed">{n.body}</p>}
                  {(n.container_name || n.host) && (
                    <div className="flex items-center gap-1.5 font-mono text-xs text-[#94A3B8]/50">
                      <Server className="w-3 h-3" />
                      {n.container_name && <>Conteneur : <strong className="text-[#94A3B8]">{n.container_name}</strong></>}
                      {n.host && <span className="ml-2">Hôte : <strong className="text-[#94A3B8]">{n.host}</strong></span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
