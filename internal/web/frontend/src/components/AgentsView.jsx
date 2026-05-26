import React, { useState } from 'react';
import { Server, PlusCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { cn } from '../lib/utils';

const INITIAL_AGENTS = [
  { name: 'prod-swarm-01', ip: '192.168.1.90', status: 'connected', version: 'v0.9.5', containers: 12, cpu: '14%', memory: '2.4 GB / 8 GB' },
  { name: 'db-node-02', ip: '192.168.1.91', status: 'connected', version: 'v0.9.5', containers: 4, cpu: '8%', memory: '1.8 GB / 4 GB' },
  { name: 'stage-aws-us-east', ip: '10.0.4.15', status: 'connected', version: 'v0.9.5', containers: 6, cpu: '22%', memory: '3.1 GB / 8 GB' },
  { name: 'edge-node-02', ip: '192.168.1.95', status: 'offline', version: 'v0.9.3', containers: 0, cpu: '0%', memory: '0 GB / 2 GB' },
];

export default function AgentsView() {
  const [agents, setAgents] = useState(INITIAL_AGENTS);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name || !ip) return;
    setSaveStatus('Enrôlement...');
    setTimeout(() => {
      setAgents(prev => [...prev, { name, ip, status: 'connected', version: 'v0.9.5', containers: 0, cpu: '2%', memory: '0.4 GB / 4 GB' }]);
      setName(''); setIp('');
      setSaveStatus('Agent connecté avec succès.');
      setTimeout(() => setSaveStatus(''), 4000);
    }, 1000);
  };

  const online = agents.filter(a => a.status === 'connected').length;

  const thClass = "px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wide";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Gestion des Agents Multi-Hôtes</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Enrôlez et administrez des daemons Docker décentralisés sur plusieurs serveurs.</p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Left */}
        <div className="space-y-4">
          {/* Agents table */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-zinc-100">Agents Actifs</span>
              </div>
              <span className="text-[11px] text-zinc-500">{online} / {agents.length} connectés</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className={thClass}>Hôte</th>
                    <th className={thClass}>Adresse IP</th>
                    <th className={thClass}>Statut</th>
                    <th className={cn(thClass, 'text-center')}>Conteneurs</th>
                    <th className={cn(thClass, 'text-center')}>CPU / RAM</th>
                    <th className={cn(thClass, 'text-right')}>Version</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(a => (
                    <tr key={a.name} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-semibold text-zinc-100 flex items-center gap-2">
                        <Server className={cn('w-3.5 h-3.5', a.status === 'connected' ? 'text-blue-400' : 'text-zinc-700')} />
                        {a.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{a.ip}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'flex items-center gap-1.5 text-xs font-medium',
                          a.status === 'connected' ? 'text-emerald-400' : 'text-zinc-600'
                        )}>
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            a.status === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-700'
                          )} />
                          {a.status === 'connected' ? 'Connecté' : 'Hors ligne'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-zinc-200">{a.containers}</td>
                      <td className="px-4 py-3 text-center text-zinc-500">
                        {a.status === 'connected' ? `${a.cpu} · ${a.memory}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-600">{a.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Setup guide */}
          <div className="card">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-zinc-100">Comment installer un agent sur une machine distante ?</span>
              </div>
              {showGuide ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
            {showGuide && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Pour lier un hôte Linux à votre console SafeDock, exécutez la commande ci-dessous en tant que <code className="bg-white/[0.06] px-1 rounded text-blue-300">root</code> sur le serveur cible :
                </p>
                <div className="bg-[#0d1120] border border-white/[0.08] rounded-lg p-3 font-mono text-[11px] text-blue-300 overflow-x-auto whitespace-nowrap">
                  curl -sSL https://safedock.local/install.sh | bash -s -- --token sd_agent_tok_8a92b8cd19f08831 --server 192.168.1.90
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Pré-requis :</p>
                  <ul className="text-[11px] text-zinc-500 space-y-1 list-disc list-inside leading-relaxed">
                    <li>Linux (Ubuntu, Debian, CentOS, AlmaLinux ou Rocky)</li>
                    <li>Docker Engine v20.10+ installé et en cours d'exécution</li>
                    <li>Port 2375 ou 2376 (TLS) accessible en réseau interne</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Enroll form */}
        <div className="card p-4 h-fit">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-white/[0.06]">
            <PlusCircle className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-zinc-100">Enrôler un hôte</h3>
          </div>
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            Ajoutez l'adresse IP et le nom d'un hôte sur lequel le daemon SafeDock est déjà déployé.
          </p>

          <form onSubmit={handleAdd} className="space-y-3">
            <FormField label="Nom d'affichage" placeholder="ex: edge-node-03" value={name} onChange={setName} />
            <FormField label="Adresse IP du daemon" placeholder="ex: 192.168.1.96" value={ip} onChange={setIp} />

            {saveStatus && <p className="text-xs text-center text-emerald-400 font-medium">{saveStatus}</p>}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
            >
              <Server className="w-3.5 h-3.5" /> Connecter l'Agent
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-zinc-500">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0d1120] border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
      />
    </div>
  );
}
