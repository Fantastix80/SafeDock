import React, { useState } from 'react';
import { Server, PlusCircle, Trash2, Loader2, CheckCircle2, XCircle, Lock, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AgentsView({ hosts = [], containers = [], onAddHost, onDeleteHost, onTestHost }) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [tlsCa, setTlsCa] = useState('');
  const [tlsCert, setTlsCert] = useState('');
  const [tlsKey, setTlsKey] = useState('');
  const [status, setStatus] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);
  const [testResults, setTestResults] = useState({}); // hostId -> {ok, error, loading}

  const containerCount = (hostId) => containers.filter(c => c.host_id === hostId).length;

  const payload = () => ({ name: name.trim(), endpoint: endpoint.trim(), tls_ca: tlsCa, tls_cert: tlsCert, tls_key: tlsKey });

  const handleTestForm = async () => {
    setBusy(true);
    setStatus({ text: 'Test de connexion…', type: 'info' });
    try {
      const res = await onTestHost(payload());
      setStatus(res.ok ? { text: 'Connexion réussie ✓', type: 'ok' } : { text: `Échec : ${res.error}`, type: 'error' });
    } catch (e) {
      setStatus({ text: `Échec : ${e.message}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !endpoint.trim()) return;
    setBusy(true);
    setStatus({ text: 'Enregistrement…', type: 'info' });
    try {
      await onAddHost(payload());
      setName(''); setEndpoint(''); setTlsCa(''); setTlsCert(''); setTlsKey('');
      setStatus({ text: 'Hôte enregistré.', type: 'ok' });
      setTimeout(() => setStatus({ text: '', type: '' }), 4000);
    } catch (err) {
      setStatus({ text: err.message || "Échec de l'enregistrement", type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const testHost = async (h) => {
    setTestResults(prev => ({ ...prev, [h.id]: { loading: true } }));
    try {
      const res = await onTestHost({ id: h.id });
      setTestResults(prev => ({ ...prev, [h.id]: { ...res, loading: false } }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [h.id]: { ok: false, error: e.message, loading: false } }));
    }
  };

  const thClass = "px-4 py-3 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-white">Hôtes Docker fédérés</h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">
          Supervisez plusieurs daemons Docker depuis une seule console. L'hôte local est géré nativement ;
          les hôtes distants se connectent via l'API Docker en TLS mutuel (le socket n'est jamais exposé en clair).
        </p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Hosts table */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#F7931A]" />
              <span className="font-heading text-xs font-semibold text-white">Hôtes enregistrés</span>
            </div>
            <span className="font-mono text-xs text-[#94A3B8]">{hosts.length} hôte(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className={thClass}>Hôte</th>
                  <th className={thClass}>Endpoint</th>
                  <th className={cn(thClass, 'text-center')}>Conteneurs</th>
                  <th className={cn(thClass, 'text-center')}>Connexion</th>
                  <th className={cn(thClass, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map(h => {
                  const tr = testResults[h.id];
                  return (
                    <tr key={h.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-heading font-semibold text-white">
                        <span className="flex items-center gap-2">
                          {h.is_local ? <HardDrive className="w-3.5 h-3.5 text-[#F7931A] shrink-0" /> : <Server className="w-3.5 h-3.5 text-[#F7931A] shrink-0" />}
                          {h.name}
                          {h.is_local && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F7931A]/10 text-[#F7931A]">local</span>}
                          {h.has_tls && <Lock className="w-3 h-3 text-emerald-400" title="TLS mutuel" />}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#94A3B8]/70">{h.is_local ? 'socket local' : h.endpoint}</td>
                      <td className="px-4 py-3 text-center font-heading font-semibold text-white">{containerCount(h.id)}</td>
                      <td className="px-4 py-3 text-center">
                        {tr?.loading
                          ? <Loader2 className="w-4 h-4 animate-spin text-[#94A3B8] mx-auto" />
                          : tr?.ok
                            ? <span className="inline-flex items-center gap-1 text-emerald-400 font-mono"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                            : tr
                              ? <span className="inline-flex items-center gap-1 text-red-400 font-mono" title={tr.error}><XCircle className="w-3.5 h-3.5" />Échec</span>
                              : <span className="text-[#94A3B8]/30 font-mono">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => testHost(h)} className="px-2 py-1 rounded-lg text-[#94A3B8] hover:text-[#F7931A] hover:bg-[#F7931A]/[0.08] transition-colors font-mono text-xs">
                            Tester
                          </button>
                          {!h.is_local && (
                            <button onClick={() => onDeleteHost(h.id)} className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-400 hover:bg-red-500/[0.08] transition-colors" title="Supprimer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add host form */}
        <div className="card p-4 h-fit">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-white/[0.06]">
            <PlusCircle className="w-4 h-4 text-[#F7931A]" />
            <h3 className="font-heading text-xs font-semibold text-white">Ajouter un hôte distant</h3>
          </div>

          <div className="flex gap-2 p-2.5 mb-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/25">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Exposer l'API Docker = accès root sur l'hôte. N'exposez l'endpoint qu'en <strong className="text-amber-300">TLS mutuel</strong>,
              filtré par pare-feu vers la seule IP de SafeDock (idéalement via un VPN ou un proxy de socket restreint). Jamais en clair.
            </p>
          </div>

          <form onSubmit={handleAdd} className="space-y-3">
            <Field label="Nom d'affichage" placeholder="ex: prod-node-02" value={name} onChange={setName} />
            <Field label="Endpoint" placeholder="tcp://10.0.0.5:2376" value={endpoint} onChange={setEndpoint} />
            <Area label="CA TLS (PEM)" placeholder="-----BEGIN CERTIFICATE-----" value={tlsCa} onChange={setTlsCa} />
            <Area label="Certificat client (PEM)" placeholder="-----BEGIN CERTIFICATE-----" value={tlsCert} onChange={setTlsCert} />
            <Area label="Clé client (PEM)" placeholder="-----BEGIN PRIVATE KEY-----" value={tlsKey} onChange={setTlsKey} />

            {status.text && (
              <p className={cn('text-xs text-center font-mono font-medium',
                status.type === 'ok' ? 'text-emerald-400' : status.type === 'error' ? 'text-red-400' : 'text-[#94A3B8]')}>
                {status.text}
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={handleTestForm} disabled={busy || !endpoint.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] border border-white/[0.08] transition-all disabled:opacity-40">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Tester'}
              </button>
              <button type="submit" disabled={busy || !name.trim() || !endpoint.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all disabled:opacity-40">
                <Server className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="font-mono text-xs font-medium text-[#94A3B8]/70 uppercase tracking-wider">{label}</label>
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono" />
    </div>
  );
}

function Area({ label, placeholder, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="font-mono text-xs font-medium text-[#94A3B8]/70 uppercase tracking-wider">{label}</label>
      <textarea rows={2} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono resize-y" />
    </div>
  );
}
