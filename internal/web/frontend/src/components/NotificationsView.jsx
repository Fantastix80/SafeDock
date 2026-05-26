import React, { useState } from 'react';
import { Bell, BellOff, TriangleAlert, CircleAlert, Info, Server } from 'lucide-react';
import { cn } from '../lib/utils';

const NOTIFICATIONS = [
  { id: 1, type: 'CRITICAL', title: 'Fuite de secret critique détectée', desc: 'Le conteneur "payment-gateway" révèle une clé API Stripe en clair dans ses variables d\'environnement.', time: 'Il y a 10 min', host: 'prod-swarm-01' },
  { id: 2, type: 'WARNING',  title: 'Image mutable :latest en production', desc: 'Le conteneur "nginx-frontend" a démarré avec le tag mutable "nginx:latest" sans digest SHA256.', time: 'Il y a 1 heure', host: 'edge-node-02' },
  { id: 3, type: 'INFO',     title: 'Audit de sécurité automatique réussi', desc: 'L\'audit global a scanné 14 conteneurs. Aucun nouveau secret ou privilège abusif détecté.', time: 'Il y a 4 heures', host: 'Tous les hôtes' },
  { id: 4, type: 'CRITICAL', title: 'Conteneur démarré en mode PRIVILÉGIÉ', desc: 'Le conteneur "backup-daemon" a été lancé avec --privileged. Risque de compromission totale de l\'hôte.', time: 'Il y a 1 jour', host: 'prod-swarm-01' },
];

const TYPE_STYLE = {
  CRITICAL: { border: 'border-l-red-500',    icon: TriangleAlert, color: 'text-red-400' },
  WARNING:  { border: 'border-l-amber-400',   icon: CircleAlert,   color: 'text-amber-400' },
  INFO:     { border: 'border-l-blue-500',    icon: Info,          color: 'text-blue-400' },
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
    if (filter === 'warning') return n.type === 'WARNING';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Bell className="w-4 h-4 text-zinc-400" />
          Centre de Notifications
        </div>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                filter === f.id
                  ? 'bg-brand-DEFAULT/15 text-brand-DEFAULT'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-16 flex flex-col items-center gap-3 text-zinc-600">
          <BellOff className="w-8 h-8 text-zinc-700" />
          <p className="text-sm">Aucune notification dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(n => {
            const s = TYPE_STYLE[n.type];
            const Icon = s.icon;
            return (
              <div key={n.id} className={cn('card p-4 border-l-4 flex gap-4 items-start', s.border)}>
                <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', s.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className="text-sm font-semibold text-zinc-100">{n.title}</h4>
                    <span className="text-[10px] text-zinc-600 shrink-0 whitespace-nowrap">{n.time}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-2 leading-relaxed">{n.desc}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                    <Server className="w-3 h-3" />
                    Hôte : <strong className="text-zinc-500">{n.host}</strong>
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
