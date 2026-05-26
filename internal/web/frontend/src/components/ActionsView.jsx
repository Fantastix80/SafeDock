import React, { useState } from 'react';
import { CloudDownload, Bug, Settings2, CheckCircle2, TriangleAlert, RotateCw, Eye } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ActionsView({ containers, onTriggerRollout, onNavigate }) {
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [status, setStatus] = useState('');

  const updatesPending = (containers || []).filter(c => c.update_available);
  const vulnerable = (containers || []).filter(c => c.score < 75 && !c.update_available);

  const handleSave = () => {
    setStatus('Enregistrement...');
    setTimeout(() => {
      setStatus('Politique de mise à jour sauvegardée.');
      setTimeout(() => setStatus(''), 4000);
    }, 800);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Actions de Sécurité Nécessaires</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Mises à jour en attente d'approbation et alertes CVE critiques.</p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Left */}
        <div className="space-y-4">
          {/* Updates */}
          <SectionCard
            icon={<CloudDownload className="w-4 h-4 text-blue-400" />}
            title={`Mises à jour prêtes (${updatesPending.length})`}
          >
            {updatesPending.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} text="Tous les conteneurs sont à jour." />
            ) : (
              <div className="space-y-2">
                {updatesPending.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-zinc-100">{c.name}</p>
                        <span className="text-[10px] text-zinc-600">{c.host_name}</span>
                      </div>
                      <p className="text-[11px] font-mono text-zinc-500 mt-0.5">{c.image_name}:{c.image_tag}</p>
                      <p className="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Prêt pour pivot sécurisé
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTriggerRollout(c.id, c.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors shrink-0"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Déployer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* CVEs */}
          <SectionCard
            icon={<Bug className="w-4 h-4 text-red-400" />}
            title={`Vulnérabilités sans correctif (${vulnerable.length})`}
          >
            {vulnerable.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} text="Excellente posture — aucune vulnérabilité active." />
            ) : (
              <div className="space-y-2">
                {vulnerable.map(c => (
                  <div key={c.id} className="p-3 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-zinc-100">{c.name}</p>
                        <span className="text-[10px] text-zinc-600">{c.host_name}</span>
                      </div>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/15 text-red-400">
                        Score : {c.score}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed mb-2">
                      Des CVE ont été remontées sur ce conteneur. Aucune nouvelle version publiée par l'éditeur pour le moment.
                    </p>
                    <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                      <p className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <TriangleAlert className="w-3 h-3 text-amber-600" />
                        Recommandé : Isoler le réseau ou durcir les variables d'env.
                      </p>
                      <button
                        type="button"
                        onClick={() => onNavigate('containers')}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
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
        <SectionCard icon={<Settings2 className="w-4 h-4 text-blue-400" />} title="Paramètres pivots">
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            Comportement de mise à jour lors de la détection de versions saines.
          </p>

          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-white/[0.06] bg-[#0d1120]">
              <input
                type="checkbox"
                checked={autoUpdate}
                onChange={e => setAutoUpdate(e.target.checked)}
                className="mt-0.5 accent-blue-500"
              />
              <div>
                <p className="text-xs font-semibold text-zinc-100">Mises à jour automatiques SecOps</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                  Mettre à jour automatiquement dès que tous les tests SecOps sont validés.
                </p>
              </div>
            </label>

            {!autoUpdate && (
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                  <TriangleAlert className="w-3.5 h-3.5" /> Mode Notification Seul
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Aucun déploiement automatique. Vous recevrez une alerte pour déployer manuellement.
                </p>
              </div>
            )}

            {status && (
              <p className="text-xs text-center text-emerald-400 font-medium">{status}</p>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="w-full py-2 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
            >
              Sauvegarder les règles
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
        <h3 className="text-xs font-semibold text-zinc-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-zinc-600">
      {icon}
      <p className="text-xs">{text}</p>
    </div>
  );
}
