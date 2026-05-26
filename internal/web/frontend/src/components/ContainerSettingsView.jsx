import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn, gradeColor, gradeBg } from '../lib/utils';

export default function ContainerSettingsView({ containerId, containers, overrides, onSaveOverride, onDeleteOverride, onNavigate }) {
  const container = containers.find(c => c.id === containerId);
  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!container) return;
    const ovr = overrides[container.name];
    if (ovr) {
      setOvrSeverity(ovr.cve_severity_threshold || '');
      setOvrAllowRoot(ovr.allow_root_user === null ? '' : String(ovr.allow_root_user));
      setOvrAllowPrivilege(ovr.allow_privileged_mode === null ? '' : String(ovr.allow_privileged_mode));
    } else {
      setOvrSeverity(''); setOvrAllowRoot(''); setOvrAllowPrivilege('');
    }
  }, [overrides, container]);

  if (!container) {
    return (
      <div className="flex flex-col items-center gap-3 pt-24 text-zinc-500">
        <TriangleAlert className="w-8 h-8 text-zinc-700" />
        <p className="text-sm">Conteneur non trouvé.</p>
        <button type="button" onClick={() => onNavigate('containers')} className="text-xs text-blue-400 hover:underline">
          Retour aux conteneurs
        </button>
      </div>
    );
  }

  const hasOverride = !!overrides[container.name];

  const handleSave = () => {
    setStatus('Enregistrement...');
    const allowRootVal = ovrAllowRoot === '' ? null : ovrAllowRoot === 'true';
    const allowPrivilegeVal = ovrAllowPrivilege === '' ? null : ovrAllowPrivilege === 'true';
    onSaveOverride(container.name, ovrSeverity, allowRootVal, allowPrivilegeVal)
      .then(() => { setStatus('Paramètres sauvegardés.'); setTimeout(() => setStatus(''), 4000); })
      .catch(() => { setStatus('Erreur d\'enregistrement.'); setTimeout(() => setStatus(''), 4000); });
  };

  const handleDelete = () => {
    if (!hasOverride) return;
    setStatus('Suppression...');
    onDeleteOverride(container.name)
      .then(() => {
        setOvrSeverity(''); setOvrAllowRoot(''); setOvrAllowPrivilege('');
        setStatus('Surcharge supprimée.'); setTimeout(() => setStatus(''), 4000);
      })
      .catch(() => { setStatus('Erreur.'); setTimeout(() => setStatus(''), 4000); });
  };

  const selectClass = "w-full px-3 py-1.5 text-xs rounded-lg bg-[#0d1120] border border-white/[0.08] text-zinc-200 focus:outline-none focus:border-blue-500/50 cursor-pointer transition-colors";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onNavigate('containers')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div>
          <p className="text-sm font-semibold text-zinc-100">Configuration spécifique du conteneur</p>
          <p className="text-[11px] text-zinc-500">Hôte : {container.host_name}</p>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr' }}>
        {/* Left: info card */}
        <div className="card p-4 h-fit">
          <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-extrabold mx-auto mb-3', gradeColor(container.score), gradeBg(container.score))}>
            {container.grade}
          </div>
          <h3 className="text-sm font-bold text-zinc-100 text-center mb-0.5">{container.name}</h3>
          <p className="text-[10px] font-mono text-zinc-500 text-center mb-3 break-all">{container.image_name}:{container.image_tag}</p>
          <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Règle :</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', hasOverride ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400')}>
                {hasOverride ? 'Surcharge active' : 'Héritage global'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Score :</span>
              <span className={cn('font-bold', gradeColor(container.score))}>{container.score}/100 ({container.grade})</span>
            </div>
          </div>
        </div>

        {/* Right: overrides form */}
        <div className="card p-5">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-white/[0.06]">
            <Settings2 className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Règles de Surcharge</h3>
          </div>

          <div className="space-y-3">
            <SelectField label="Tolérance de sévérité CVE" value={ovrSeverity} onChange={setOvrSeverity} className={selectClass}>
              <option value="">Hériter des règles globales</option>
              <option value="CRITICAL">CRITICAL — critique seulement</option>
              <option value="HIGH">HIGH — critique et haute</option>
              <option value="MEDIUM">MEDIUM — critique, haute et moyenne</option>
              <option value="LOW">LOW — toutes</option>
              <option value="NONE">NONE — toutes, même mineures</option>
            </SelectField>

            <SelectField label="Autoriser l'utilisateur root" value={ovrAllowRoot} onChange={setOvrAllowRoot} className={selectClass}>
              <option value="">Hériter des règles globales</option>
              <option value="true">Autorisé</option>
              <option value="false">Interdit (bloque si root détecté)</option>
            </SelectField>

            <SelectField label="Autoriser le mode privilégié" value={ovrAllowPrivilege} onChange={setOvrAllowPrivilege} className={selectClass}>
              <option value="">Hériter des règles globales</option>
              <option value="true">Autorisé</option>
              <option value="false">Interdit (bloque si privilégié détecté)</option>
            </SelectField>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
              {status && <p className="text-xs text-emerald-400">{status}</p>}
              {hasOverride && (
                <button type="button" onClick={handleDelete} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-400 hover:bg-red-400/10 transition-colors border border-red-400/20">
                  Supprimer la surcharge
                </button>
              )}
              <button type="button" onClick={handleSave} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, className, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-zinc-500">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={className}>
        {children}
      </select>
    </div>
  );
}
