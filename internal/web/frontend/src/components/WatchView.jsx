import React from 'react';
import { Newspaper, Wrench, Radio } from 'lucide-react';
import { cn } from '../lib/utils';

const BULLETINS = [
  {
    id: 'SB-2026-003', date: '25 Mai 2026', severity: 'CRITICAL',
    title: 'Vulnérabilité critique dans le démon de runtime containerd',
    summary: 'Une faille de contournement de namespace dans containerd (CVE-2026-9912) permet à un conteneur malveillant d\'exécuter du code arbitraire sur l\'hôte.',
    remediation: 'Mettez à jour containerd vers la version 1.7.15+ ou 2.0.0-rc.3+'
  },
  {
    id: 'SB-2026-002', date: '18 Mai 2026', severity: 'HIGH',
    title: 'Fuite de descripteurs de fichiers dans runc',
    summary: 'Une mauvaise fermeture de descripteur de fichier (CVE-2026-4021) permet à un attaquant disposant de privilèges root dans le conteneur d\'accéder au système de fichiers de l\'hôte.',
    remediation: 'Assurez-vous que runc est mis à jour en v1.1.13'
  },
  {
    id: 'SB-2026-001', date: '05 Mai 2026', severity: 'MEDIUM',
    title: 'Faiblesses de chiffrement dans Docker Desktop',
    summary: 'Le stockage local des identifiants de registres utilise une clé statique faible sur certaines versions Windows.',
    remediation: 'Activez l\'intégration du gestionnaire d\'identifiants Windows natif (Credential Manager).'
  }
];

const PRACTICES = [
  { cat: 'Isolation', title: 'Restreindre l\'accès à la socket Docker', desc: 'Le montage de /var/run/docker.sock équivaut à donner des privilèges root illimités sur l\'hôte. Utilisez des API proxifiées avec authentification.' },
  { cat: 'Privilèges', title: 'Activer le mode User Namespace', desc: 'Mapper l\'utilisateur root du conteneur sur un utilisateur sans privilèges sur l\'hôte via les userns-remap.' },
  { cat: 'Intégrité', title: 'Définir des Read-Only Root Filesystems', desc: 'Exécutez vos conteneurs avec --read-only pour empêcher l\'écriture et la persistance de charges virales en cas de compromission.' }
];

const SEV_STYLE = {
  CRITICAL: { border: 'border-l-red-500', badge: 'bg-red-500/15 text-red-400', text: 'text-red-400' },
  HIGH:     { border: 'border-l-orange-500', badge: 'bg-orange-500/15 text-orange-400', text: 'text-orange-400' },
  MEDIUM:   { border: 'border-l-amber-400', badge: 'bg-amber-500/15 text-amber-400', text: 'text-amber-400' },
};

export default function WatchView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Newspaper className="w-4 h-4 text-zinc-400" />
        Veille de Sécurité SecOps & Bulletins
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Bulletins feed */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400">Derniers Bulletins CVE</p>
          {BULLETINS.map(sb => {
            const s = SEV_STYLE[sb.severity];
            return (
              <div key={sb.id} className={cn('card p-4 border-l-4', s.border)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', s.badge)}>{sb.severity}</span>
                    <span className="font-mono text-[11px] text-zinc-600">{sb.id}</span>
                  </div>
                  <span className="text-[11px] text-zinc-600">{sb.date}</span>
                </div>
                <h4 className="text-sm font-semibold text-zinc-100 mb-1.5">{sb.title}</h4>
                <p className="text-xs text-zinc-500 mb-3 leading-relaxed">{sb.summary}</p>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                  <Wrench className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-zinc-300">
                    <strong>Remédiation :</strong> {sb.remediation}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400">Guides de Durcissement</p>
          {PRACTICES.map((bp, i) => (
            <div key={i} className="card p-4">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 inline-block mb-2">
                {bp.cat}
              </span>
              <h4 className="text-xs font-semibold text-zinc-100 mb-1">{bp.title}</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{bp.desc}</p>
            </div>
          ))}

          {/* Live feed indicator */}
          <div className="card p-3 border border-blue-500/10 bg-blue-500/[0.03] text-center">
            <p className="text-[10px] text-zinc-600 mb-2">Flux de renseignement de menaces</p>
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_#4F8EF7]" />
              <Radio className="w-3.5 h-3.5" />
              Flux synchronisé (NVD & CERT)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
