import React, { useState } from 'react';
import { CloudDownload, Bug, Settings2, CheckCircle2, TriangleAlert, RotateCw, Eye, Zap, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ActionsView({ containers, onTriggerRollout, onNavigate }) {
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [status, setStatus] = useState('');

  const updatesPending = (containers || []).filter(c => c.update_available);
  const vulnerable     = (containers || []).filter(c => c.score < 75 && !c.update_available);

  const handleSave = () => {
    setStatus('Enregistrement...');
    setTimeout(() => {
      setStatus('Politique de mise Ã  jour sauvegardÃ©e.');
      setTimeout(() => setStatus(''), 4000);
    }, 800);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-white">Actions de SÃ©curitÃ© NÃ©cessaires</h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">Mises Ã  jour en attente d'approbation et alertes CVE critiques.</p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Left */}
        <div className="space-y-4">
          {/* Updates */}
          <SectionCard icon={<CloudDownload className="w-4 h-4 text-[#F7931A]" />} title={`Mises Ã  jour prÃªtes (${updatesPending.length})`}>
            {updatesPending.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} text="Tous les conteneurs sont Ã  jour." />
            ) : (
              <div className="space-y-2">
                {updatesPending.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06] hover:border-[#F7931A]/20 transition-all">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-heading text-sm font-semibold text-white">{c.name}</p>
                        <span className="font-mono text-xs text-[#94A3B8]/50">{c.host_name}</span>
                      </div>
                      <p className="text-xs font-mono text-[#94A3B8]/70 mt-0.5">{c.image_name}:{c.image_tag}</p>
                      <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> PrÃªt pour pivot sÃ©curisÃ©
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTriggerRollout(c.id, c.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all shrink-0 shadow-[0_0_15px_-5px_rgba(247,147,26,0.3)]"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> DÃ©ployer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* CVEs */}
          <SectionCard icon={<Bug className="w-4 h-4 text-red-400" />} title={`VulnÃ©rabilitÃ©s sans correctif (${vulnerable.length})`}>
            {vulnerable.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} text="Excellente posture â€” aucune vulnÃ©rabilitÃ© active." />
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
                      Des CVE ont Ã©tÃ© remontÃ©es sur ce conteneur. Aucune nouvelle version publiÃ©e par l'Ã©diteur pour le moment.
                    </p>
                    <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                      <p className="text-xs text-[#94A3B8]/50 flex items-center gap-1">
                        <TriangleAlert className="w-3 h-3 text-amber-500/70" />
                        RecommandÃ© : Isoler le rÃ©seau ou durcir les variables d'env.
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

        {/* Right: Settings */}
        <SectionCard icon={<Zap className="w-4 h-4 text-[#F7931A]" />} title="ParamÃ¨tres pivots">
          <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
            Comportement de mise Ã  jour lors de la dÃ©tection de versions saines.
          </p>

          <div className="space-y-3">
            <div
              onClick={() => setAutoUpdate(v => !v)}
              className="flex items-start gap-3 cursor-pointer group select-none p-3 rounded-xl border border-white/[0.06] bg-[#0A0C10] hover:border-[#F7931A]/20 transition-all"
            >
              <CheckboxIndicator checked={autoUpdate} className="mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Mises Ã  jour automatiques SecOps</p>
                <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
                  Mettre Ã  jour automatiquement dÃ¨s que tous les tests SecOps sont validÃ©s.
                </p>
              </div>
            </div>

            {!autoUpdate && (
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                  <TriangleAlert className="w-3.5 h-3.5" /> Mode Notification Seul
                </p>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Aucun dÃ©ploiement automatique. Vous recevrez une alerte pour dÃ©ployer manuellement.
                </p>
              </div>
            )}

            {status && <p className="text-xs text-center text-emerald-400 font-medium font-mono">{status}</p>}

            <button
              type="button"
              onClick={handleSave}
              className="w-full py-2 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
            >
              Sauvegarder les rÃ¨gles
            </button>
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

function CheckboxIndicator({ checked, className }) {
  return (
    <div className={cn(
      'w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all duration-200 border pointer-events-none',
      checked
        ? 'bg-[#F7931A] border-[#F7931A] shadow-[0_0_8px_rgba(247,147,26,0.4)]'
        : 'bg-transparent border-white/25 group-hover:border-[#F7931A]/50',
      className
    )}>
      {checked && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
    </div>
  );
}
