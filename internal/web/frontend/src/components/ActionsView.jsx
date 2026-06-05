import React from 'react';
import { CloudDownload, Bug, CheckCircle2, TriangleAlert, RotateCw, Eye, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ActionsView({ containers, onTriggerRollout, onNavigate }) {
  const updatesPending = (containers || []).filter(c => c.update_available);
  const vulnerable     = (containers || []).filter(c => c.score < 75 && !c.update_available);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-white">Actions de Sécurité Nécessaires</h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">Mises à jour en attente d'approbation et alertes CVE critiques.</p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Left */}
        <div className="space-y-4">
          {/* Updates */}
          <SectionCard icon={<CloudDownload className="w-4 h-4 text-[#F7931A]" />} title={`Mises à jour prêtes (${updatesPending.length})`}>
            {updatesPending.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} text="Tous les conteneurs sont à jour." />
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2.5 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 mb-1">
                  <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    <strong className="text-amber-300">Avant toute mise à jour :</strong> une nouvelle version d'image
                    peut <strong className="text-amber-300">casser une application qui fonctionnait</strong>.
                    Sauvegardez le conteneur et ses données (volumes, base de données) pour pouvoir revenir en arrière.
                  </p>
                </div>
                {updatesPending.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06] hover:border-[#F7931A]/20 transition-all">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-heading text-sm font-semibold text-white">{c.name}</p>
                        <span className="font-mono text-xs text-[#94A3B8]/50">{c.host_name}</span>
                      </div>
                      <p className="text-xs font-mono text-[#94A3B8]/70 mt-0.5">{c.image_name}:{c.image_tag}</p>
                      <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Prêt pour une mise à jour sécurisée
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTriggerRollout(c.id, c.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all shrink-0 shadow-[0_0_15px_-5px_rgba(247,147,26,0.3)]"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Mettre à jour
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* CVEs */}
          <SectionCard icon={<Bug className="w-4 h-4 text-red-400" />} title={`Vulnérabilités sans correctif (${vulnerable.length})`}>
            {vulnerable.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} text="Excellente posture — aucune vulnérabilité active." />
            ) : (
              <div className="space-y-2">
                {vulnerable.map(c => (
                  <div key={c.id} className="p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06]">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <p className="font-heading text-sm font-semibold text-white">{c.name}</p>
                        <span className="font-mono text-xs text-[#94A3B8]/50">{c.host_name}</span>
                      </div>
                      <span className="px-1.5 py-0.5 font-mono text-xs font-bold rounded-md bg-red-500/15 text-red-400 border border-red-500/20">
                        Score : {c.score}/100
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8] leading-relaxed mb-2">
                      Des CVE ont été remontées sur ce conteneur. Aucune nouvelle version publiée par l'éditeur pour le moment.
                    </p>
                    <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                      <p className="text-xs text-[#94A3B8]/50 flex items-center gap-1">
                        <TriangleAlert className="w-3 h-3 text-amber-500/70" />
                        Recommandé : Isoler le réseau ou durcir les variables d'env.
                      </p>
                      <button
                        type="button"
                        onClick={() => onNavigate('containers')}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg font-mono text-[#94A3B8] hover:text-white hover:bg-white/[0.05] transition-colors"
                      >
                        <Eye className="w-3 h-3" /> Inspecter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: Politique de mise à jour */}
        <SectionCard icon={<Zap className="w-4 h-4 text-[#F7931A]" />} title="Politique de mise à jour">
          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05]">
              <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mode actuel : notification seule
              </p>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Aucune mise à jour n'est appliquée automatiquement. SafeDock analyse les nouvelles
                versions et vous alerte ; vous décidez quand mettre à jour, manuellement.
              </p>
            </div>

            <div className="p-3 rounded-xl border border-white/[0.06] bg-[#0A0C10] opacity-80">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">Mises à jour automatiques SecOps</p>
                <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-white/[0.04] text-[#94A3B8] border border-white/[0.08]">Bientôt</span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Appliquer automatiquement une mise à jour dès que tous les contrôles SecOps passent.
              </p>
              <p className="text-xs text-amber-300/80 leading-relaxed mt-1.5 flex items-start gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                À activer avec prudence : une mise à jour, même saine côté CVE, peut casser une
                application. Des sauvegardes restent indispensables.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({ icon, title, children }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.06]">
        {icon}
        <h3 className="font-heading text-xs font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-[#94A3B8]/50">
      {icon}
      <p className="text-xs font-mono">{text}</p>
    </div>
  );
}

