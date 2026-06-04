import React, { useState } from 'react';
import { ShieldOff, Plus, Trash2, AlertTriangle, Clock, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ExceptionsView({ exceptions = [], containers = [], onAdd, onDelete }) {
  const [cveId, setCveId] = useState('');
  const [scope, setScope] = useState(''); // '' = global, sinon nom du conteneur
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const cve = cveId.trim().toUpperCase();
    if (!cve) return;
    setSubmitting(true);
    setError('');
    try {
      await onAdd(cve, scope, reason.trim(), expiresAt);
      setCveId(''); setReason(''); setExpiresAt(''); setScope('');
    } catch (err) {
      setError(err.message || "Échec de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="card p-5">
        <div className="flex items-center gap-2 pb-4 mb-4 border-b border-white/[0.06]">
          <ShieldOff className="w-5 h-5 text-[#F7931A]" />
          <h2 className="font-heading text-base font-semibold text-white">Risques acceptés (exceptions CVE)</h2>
        </div>
        <p className="text-sm text-[#94A3B8] leading-relaxed">
          Une CVE tolérée reste <strong className="text-white">visible</strong> dans les rapports, mais
          ne bloque plus les mises à jour automatiques. Idéal pour les vulnérabilités sans correctif
          disponible. Une exception peut être globale ou limitée à un conteneur, et expirer à une date donnée.
        </p>
      </div>

      {/* Add form */}
      <form onSubmit={submit} className="card p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px] space-y-1.5">
            <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">CVE ID</label>
            <input
              value={cveId} onChange={e => setCveId(e.target.value)} placeholder="CVE-2024-XXXXX"
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 font-mono"
              required
            />
          </div>
          <div className="w-52 space-y-1.5">
            <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Portée</label>
            <select
              value={scope} onChange={e => setScope(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white focus:outline-none focus:border-[#F7931A]/40 font-mono"
            >
              <option value="">Globale (tous les conteneurs)</option>
              {containers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="w-44 space-y-1.5">
            <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Expiration</label>
            <input
              type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white focus:outline-none focus:border-[#F7931A]/40 font-mono"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Justification</label>
          <input
            value={reason} onChange={e => setReason(e.target.value)} placeholder="Pas de correctif amont / faux positif / non exploitable dans notre contexte…"
            className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 font-mono"
          />
        </div>
        {error && <p className="text-sm text-red-400 font-mono">{error}</p>}
        <button
          type="submit" disabled={submitting || !cveId.trim()}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Ajouter l'exception
        </button>
      </form>

      {/* List */}
      <div className="card p-5">
        <h3 className="font-heading text-sm font-semibold text-white mb-4">
          Exceptions enregistrées <span className="text-[#94A3B8]/50 font-mono">({exceptions.length})</span>
        </h3>
        {exceptions.length === 0 ? (
          <p className="text-sm text-[#94A3B8]/50 font-mono py-6 text-center">Aucune exception. Toutes les CVE sont prises en compte dans les décisions de blocage.</p>
        ) : (
          <div className="space-y-2">
            {exceptions.map(ex => (
              <div key={ex.id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                ex.active ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-white/[0.01] border-white/[0.04] opacity-50'
              )}>
                <AlertTriangle className={cn('w-4 h-4 shrink-0', ex.active ? 'text-[#F7931A]' : 'text-[#94A3B8]/40')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-white">{ex.cve_id}</span>
                    {ex.container_name
                      ? <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-[#94A3B8]">{ex.container_name}</span>
                      : <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#F7931A]/10 text-[#F7931A] flex items-center gap-1"><Globe className="w-3 h-3" />globale</span>}
                    {ex.expires_at
                      ? <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-[#94A3B8]/70 flex items-center gap-1"><Clock className="w-3 h-3" />{ex.active ? 'expire le' : 'expirée le'} {ex.expires_at}</span>
                      : <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-[#94A3B8]/50">sans expiration</span>}
                  </div>
                  {ex.reason && <p className="text-xs text-[#94A3B8]/60 mt-1 truncate">{ex.reason}</p>}
                </div>
                <button
                  onClick={() => onDelete(ex.id)}
                  className="shrink-0 p-2 rounded-lg text-[#94A3B8] hover:text-red-400 hover:bg-red-500/[0.08] transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
