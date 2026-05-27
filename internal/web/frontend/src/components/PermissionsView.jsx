import React, { useState } from 'react';
import { Lock, UserPlus, Filter, Info, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function PermissionsView({ simulatedUsers, setSimulatedUsers, activeUserProfile, setActiveUserProfile }) {
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Lecteur');
  const [scopeType, setScopeType] = useState('all');
  const [scopeVal, setScopeVal] = useState('');
  const [status, setStatus] = useState('');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName) return;
    let scopeValue = null, desc = 'Accès complet';
    if (scopeType === 'tags') {
      scopeValue = scopeVal.split(',').map(s => s.trim()).filter(Boolean);
      desc = `Tags : ${scopeValue.join(', ')}`;
    } else if (scopeType === 'hosts') {
      scopeValue = [scopeVal.trim()];
      desc = `Hôte : ${scopeVal.trim()}`;
    }
    const user = { id: Date.now(), name: newName, role: newRole, scopeType, scopeValue, desc };
    const updated = [...simulatedUsers, user];
    setSimulatedUsers(updated);
    localStorage.setItem('safedock-simulated-users', JSON.stringify(updated));
    setNewName(''); setScopeVal(''); setScopeType('all');
    setStatus('Utilisateur créé.'); setTimeout(() => setStatus(''), 4000);
  };

  const handleDelete = (id) => {
    if (id === 1) return;
    const updated = simulatedUsers.filter(u => u.id !== id);
    setSimulatedUsers(updated);
    localStorage.setItem('safedock-simulated-users', JSON.stringify(updated));
    if (activeUserProfile.id === id) setActiveUserProfile(simulatedUsers.find(u => u.id === 1));
  };

  const roleStyle = (role) => {
    if (role === 'Admin')    return 'bg-red-500/10 text-red-400 border border-red-500/20';
    if (role === 'Auditeur') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  };

  const inputClass = "w-full px-3 py-1.5 text-xs rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono";

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white mb-0.5">
            <Lock className="w-4 h-4 text-[#94A3B8]" />
            Matrice des Permissions & Scopes
          </div>
          <p className="text-xs text-[#94A3B8]">Visibilité et droits d'administration SecOps des utilisateurs.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#F7931A]/25 bg-[#F7931A]/5 text-xs font-medium text-[#F7931A] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F7931A] shadow-[0_0_6px_rgba(247,147,26,0.8)]" />
          Session active : <strong>{activeUserProfile.name}</strong> ({activeUserProfile.role})
        </div>
      </div>

      {/* Simulation banner */}
      {activeUserProfile.id !== 1 && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-[#94A3B8] leading-relaxed">
            <strong className="text-amber-400">Mode Simulation actif</strong> — Les données sont filtrées selon le scope de <strong className="text-white">{activeUserProfile.name}</strong>. {activeUserProfile.desc}.
          </div>
          <button
            type="button"
            onClick={() => setActiveUserProfile(simulatedUsers.find(u => u.id === 1))}
            className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-xl bg-white/[0.06] text-[#94A3B8] hover:text-white hover:bg-white/[0.1] transition-colors font-mono"
          >
            Rétablir Admin
          </button>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Left: table + explanations */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Lock className="w-4 h-4 text-[#F7931A]" />
              <span className="font-heading text-xs font-semibold text-white">Utilisateurs et Restrictions SecOps</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {['Utilisateur', 'Rôle', 'Scope', 'Simulation', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simulatedUsers.map(u => (
                    <tr key={u.id} className="border-b border-white/[0.03] hover:bg-[#F7931A]/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                            activeUserProfile.id === u.id
                              ? 'bg-[#F7931A]/20 text-[#F7931A] ring-1 ring-[#F7931A]/30'
                              : 'bg-white/[0.06] text-[#94A3B8]'
                          )}>
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-heading font-semibold text-white">{u.name}</p>
                            {activeUserProfile.id === u.id && (
                              <p className="font-mono text-[9px] text-[#F7931A] font-bold">Session Active</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-1.5 py-0.5 rounded-md text-xs font-bold', roleStyle(u.role))}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#94A3B8]">
                        <span className="flex items-center gap-1 font-mono text-xs">
                          <Filter className="w-3 h-3 text-[#94A3B8]/40" />
                          {u.desc}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setActiveUserProfile(u)}
                          className={cn(
                            'px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors font-mono',
                            activeUserProfile.id === u.id
                              ? 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25'
                              : 'bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07]'
                          )}
                        >
                          {activeUserProfile.id === u.id ? 'Connecté' : 'Se connecter'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {u.id !== 1 ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-[#94A3B8]/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-[#94A3B8]/30">Système</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4 grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 font-heading text-xs font-semibold text-white mb-2">
                <Info className="w-3.5 h-3.5 text-[#F7931A]" /> Rôles SecOps
              </div>
              <ul className="text-xs text-[#94A3B8] space-y-1.5 list-disc list-inside leading-relaxed">
                <li><strong className="text-white">Admin</strong> : Audit, config SMTP, seuils et pivots</li>
                <li><strong className="text-white">Auditeur</strong> : Inspecter, rescanner, rafraîchir</li>
                <li><strong className="text-white">Lecteur</strong> : Lecture seule des rapports SecOps</li>
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-heading text-xs font-semibold text-white mb-2">
                <Filter className="w-3.5 h-3.5 text-[#F7931A]" /> Scoping de Ressources
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Restreignez la visibilité par tags ou par hôtes. Toutes les statistiques, CVEs et logs sont automatiquement calculés dans le scope assigné.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Create form */}
        <div className="card p-4 h-fit">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.06]">
            <UserPlus className="w-4 h-4 text-[#F7931A]" />
            <h3 className="font-heading text-xs font-semibold text-white">Créer un profil</h3>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1">
              <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Nom complet</label>
              <input
                className={inputClass}
                placeholder="ex: David SecOps"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Rôle global</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className={cn(inputClass, 'cursor-pointer')}
              >
                <option value="Admin">Admin — Tous les privilèges</option>
                <option value="Auditeur">Auditeur — Scan, lecture, refresh</option>
                <option value="Lecteur">Lecteur — Lecture seule</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Type de scoping</label>
              <select
                value={scopeType}
                onChange={e => setScopeType(e.target.value)}
                className={cn(inputClass, 'cursor-pointer')}
              >
                <option value="all">Tout le parc</option>
                <option value="tags">Restreint par Tags</option>
                <option value="hosts">Restreint par Hôte</option>
              </select>
            </div>
            {scopeType !== 'all' && (
              <div className="space-y-1">
                <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">
                  {scopeType === 'tags' ? 'Tags autorisés (virgules)' : 'Nom exact de la machine'}
                </label>
                <input
                  className={inputClass}
                  placeholder={scopeType === 'tags' ? 'Production, Web' : 'db-node-02'}
                  value={scopeVal}
                  onChange={e => setScopeVal(e.target.value)}
                  required
                />
              </div>
            )}
            {status && <p className="text-xs text-emerald-400 text-center font-mono">{status}</p>}
            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)] flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> Créer l'utilisateur
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
