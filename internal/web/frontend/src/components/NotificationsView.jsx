import React, { useState } from 'react';
import { Bell, BellOff, TriangleAlert, CircleAlert, Info, Server } from 'lucide-react';
import { cn } from '../lib/utils';

const NOTIFICATIONS = [
  { id: 1, type: 'CRITICAL', title: 'Fuite de secret critique dÃ©tectÃ©e',      desc: 'Le conteneur "payment-gateway" rÃ©vÃ¨le une clÃ© API Stripe en clair dans ses variables d\'environnement.', time: 'Il y a 10 min',  host: 'prod-swarm-01' },
  { id: 2, type: 'WARNING',  title: 'Image mutable :latest en production',     desc: 'Le conteneur "nginx-frontend" a dÃ©marrÃ© avec le tag mutable "nginx:latest" sans digest SHA256.',           time: 'Il y a 1 heure', host: 'edge-node-02' },
  { id: 3, type: 'INFO',     title: 'Audit de sÃ©curitÃ© automatique rÃ©ussi',    desc: 'L\'audit global a scannÃ© 14 conteneurs. Aucun nouveau secret ou privilÃ¨ge abusif dÃ©tectÃ©.',                  time: 'Il y a 4 heures',host: 'Tous les hÃ´tes' },
  { id: 4, type: 'CRITICAL', title: 'Conteneur dÃ©marrÃ© en mode PRIVILÃ‰GIÃ‰',   desc: 'Le conteneur "backup-daemon" a Ã©tÃ© lancÃ© avec --privileged. Risque de compromission totale de l\'hÃ´te.',    time: 'Il y a 1 jour',  host: 'prod-swarm-01' },
];

const TYPE_STYLE = {
  CRITICAL: { border: 'border-l-red-500',       icon: TriangleAlert, color: 'text-red-400',    badge: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  WARNING:  { border: 'border-l-amber-400',      icon: CircleAlert,   color: 'text-amber-400',  badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
  INFO:     { border: 'border-l-[#F7931A]',      icon: Info,          color: 'text-[#F7931A]',  badge: 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20' },
};

const FILTERS = [
  { id: 'all',      label: 'Toutes' },
  { id: 'critical', label: 'Critique' },
  { id: 'warning',  label: 'Alerte' },
];

export default function NotificationsView() {
  const [filter, setFilter] = useState('all');

  const filtered = NOTIFICATIONS.filter(n => {
    if (filter === 'critical') return n.type === 'CRITICAL';
    if (filter === 'warning')  return n.type === 'WARNING';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
          <Bell className="w-4 h-4 text-[#94A3B8]" />
          Centre de Notifications
        </div>
        <div className="flex gap-1.5">
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
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-16 flex flex-col items-center gap-3 text-[#94A3B8]/40">
          <BellOff className="w-8 h-8" />
          <p className="text-sm font-mono">Aucune notification dans cette catÃ©gorie.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(n => {
            const s = TYPE_STYLE[n.type];
            const Icon = s.icon;
            return (
              <div key={n.id} className={cn('card p-4 border-l-4 flex gap-4 items-start hover:border-l-4 transition-all', s.border)}>
                <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', s.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="font-heading text-sm font-semibold text-white">{n.title}</h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('px-1.5 py-0.5 rounded-md font-mono text-xs font-bold', s.badge)}>
                        {n.type}
                      </span>
                      <span className="font-mono text-xs text-[#94A3B8]/40 whitespace-nowrap">{n.time}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-2 leading-relaxed">{n.desc}</p>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-[#94A3B8]/50">
                    <Server className="w-3 h-3" />
                    HÃ´te : <strong className="text-[#94A3B8]">{n.host}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
