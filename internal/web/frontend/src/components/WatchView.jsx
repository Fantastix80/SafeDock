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
  { cat: 'Isolation',   title: 'Restreindre l\'accès à la socket Docker',   desc: 'Le montage de /var/run/docker.sock équivaut à donner des privilèges root illimités sur l\'hôte. Utilisez des API proxifiées avec authentification.' },
  { cat: 'Privilèges',  title: 'Activer le mode User Namespace',             desc: 'Mapper l\'utilisateur root du conteneur sur un utilisateur sans privilèges sur l\'hôte via les userns-remap.' },
  { cat: 'Intégrité',   title: 'Définir des Read-Only Root Filesystems',     desc: 'Exécutez vos conteneurs avec --read-only pour empêcher l\'écriture et la persistance de charges virales en cas de compromission.' }
];

const SEV_STYLE = {
  CRITICAL: { border: 'border-l-red-500',       badge: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  HIGH:     { border: 'border-l-[#F7931A]',      badge: 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20' },
  MEDIUM:   { border: 'border-l-amber-400',      badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
};

export default function WatchView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
        <Newspaper className="w-4 h-4 text-[#94A3B8]" />
        Veille de Sécurité SecOps & Bulletins
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Bulletins feed */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] font-medium text-[#94A3B8]/60 uppercase tracking-widest">Derniers Bulletins CVE</p>
          {BULLETINS.map(sb => {
            const s = SEV_STYLE[sb.severity];
            return (
              <div key={sb.id} className={cn('card p-4 border-l-4 hover:border-l-4 transition-all', s.border)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold', s.badge)}>
                      {sb.severity}
                    </span>
                    <span className="font-mono text-[11px] text-[#94A3B8]/50">{sb.id}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#94A3B8]/40">{sb.date}</span>
                </div>
                <h4 className="font-heading text-sm font-semibold text-white mb-1.5">{sb.title}</h4>
                <p className="text-xs text-[#94A3B8] mb-3 leading-relaxed">{sb.summary}</p>
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#0A0C10] border border-white/[0.06]">
                  <Wrench className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-white/80">
                    <strong className="text-white">Remédiation :</strong> {sb.remediation}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] font-medium text-[#94A3B8]/60 uppercase tracking-widest">Guides de Durcissement</p>
          {PRACTICES.map((bp, i) => (
            <div key={i} className="card p-4 hover:-translate-y-0.5 hover:border-[#F7931A]/20 hover:shadow-[0_0_25px_-8px_rgba(247,147,26,0.15)] transition-all duration-300">
              <span className="px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-block mb-2">
                {bp.cat}
              </span>
              <h4 className="font-heading text-xs font-semibold text-white mb-1">{bp.title}</h4>
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">{bp.desc}</p>
            </div>
          ))}

          {/* Live feed indicator */}
          <div className="card p-3 border border-[#F7931A]/15 bg-[#F7931A]/[0.03] text-center">
            <p className="font-mono text-[10px] text-[#94A3B8]/40 mb-2 tracking-wide">Flux de renseignement de menaces</p>
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#F7931A]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7931A] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F7931A]" />
              </span>
              <Radio className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px] tracking-wide">Flux synchronisé (NVD & CERT)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
