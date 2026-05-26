import React, { useState, useEffect } from 'react';
import { Mail, ShieldHalf, Settings2, Key, Users, Server, Building2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const TABS = [
  { id: 'smtp',       label: 'SMTP / Alertes',    icon: Mail,       group: 'Base' },
  { id: 'seuils',     label: 'Seuils SecOps',     icon: ShieldHalf, group: 'Base' },
  { id: 'prefs',      label: 'Préférences',       icon: Settings2,  group: 'Base' },
  { id: 'registries', label: 'Registres Privés',  icon: Key,        group: 'Admin' },
  { id: 'users',      label: 'Utilisateurs',      icon: Users,      group: 'Admin' },
  { id: 'agents',     label: 'Multi-Hôtes',       icon: Server,     group: 'Admin' },
  { id: 'security',   label: 'Sécurité Entreprise', icon: Building2, group: 'Admin' },
];

export default function SettingsView({ config, registries, onSaveGlobalSettings, onAddRegistry, onDeleteRegistry }) {
  const [tab, setTab] = useState('smtp');
  const [severity, setSeverity] = useState('HIGH');
  const [allowRoot, setAllowRoot] = useState(false);
  const [allowPrivileged, setAllowPrivileged] = useState(false);
  const [scanner, setScanner] = useState('trivy');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTo, setSmtpTo] = useState('');
  const [smtpTls, setSmtpTls] = useState(false);
  const [pollInterval, setPollInterval] = useState('10');
  const [defaultView, setDefaultView] = useState('dashboard');
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [regServer, setRegServer] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [agents, setAgents] = useState([
    { name: 'prod-swarm-01', ip: '192.168.1.90', status: 'connected', version: 'v0.9.5' },
    { name: 'db-node-02', ip: '192.168.1.91', status: 'connected', version: 'v0.9.5' },
    { name: 'stage-aws-us-east', ip: '10.0.4.15', status: 'connected', version: 'v0.9.5' },
    { name: 'edge-node-02', ip: '192.168.1.95', status: 'offline', version: 'v0.9.3' }
  ]);
  const [agentName, setAgentName] = useState('');
  const [agentIp, setAgentIp] = useState('');
  const [users, setUsers] = useState([
    { username: 'Hell0W0rld', email: 'secops-admin@safedock.local', role: 'Administrateur' },
    { username: 'Reader01', email: 'reader@safedock.local', role: 'Lecteur' },
    { username: 'AuditBot', email: 'bot@safedock.local', role: 'Auditeur SecOps' }
  ]);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('Lecteur');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!config) return;
    setSeverity(config.SecOps?.MaxSeverityAllowed || 'HIGH');
    setAllowRoot(config.SecOps?.AllowRoot || false);
    setAllowPrivileged(config.SecOps?.AllowPrivileged || false);
    setScanner(config.SecOps?.SecopsScanner || 'trivy');
    setSmtpHost(config.SMTP?.Host || '');
    setSmtpPort(config.SMTP?.Port != null ? String(config.SMTP.Port) : '');
    setSmtpUser(config.SMTP?.User || '');
    setSmtpFrom(config.SMTP?.From || '');
    setSmtpTo(config.SMTP?.To || '');
    setSmtpTls(config.SMTP?.TLSSkipVerify || false);
  }, [config]);

  const saveGlobal = () => {
    setStatus('Enregistrement...');
    onSaveGlobalSettings({
      secops_max_severity_allowed: severity,
      secops_allow_root: allowRoot,
      secops_allow_privileged: allowPrivileged,
      secops_scanner: scanner,
      smtp_host: smtpHost,
      smtp_port: smtpPort ? parseInt(smtpPort, 10) : 0,
      smtp_user: smtpUser,
      smtp_password: smtpPass,
      smtp_from: smtpFrom,
      smtp_to: smtpTo,
      smtp_tls_skip_verify: smtpTls
    })
      .then(() => { setStatus('Paramètres sauvegardés.'); setTimeout(() => setStatus(''), 4000); })
      .catch(() => { setStatus('Erreur de sauvegarde.'); setTimeout(() => setStatus(''), 4000); });
  };

  const handleRegSubmit = (e) => {
    e.preventDefault();
    if (!regServer || !regUser || !regPass) return;
    onAddRegistry(regServer, regUser, regPass).then(() => {
      setRegServer(''); setRegUser(''); setRegPass('');
      setStatus('Registre enregistré.'); setTimeout(() => setStatus(''), 4000);
    });
  };

  const handleAddAgent = (e) => {
    e.preventDefault();
    if (!agentName || !agentIp) return;
    setAgents(p => [...p, { name: agentName, ip: agentIp, status: 'connected', version: 'v0.9.5' }]);
    setAgentName(''); setAgentIp('');
    setStatus('Agent connecté.'); setTimeout(() => setStatus(''), 4000);
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername || !newEmail) return;
    setUsers(p => [...p, { username: newUsername, email: newEmail, role: newRole }]);
    setNewUsername(''); setNewEmail(''); setNewRole('Lecteur');
    setStatus('Invitation envoyée.'); setTimeout(() => setStatus(''), 4000);
  };

  const inputClass = "w-full px-3 py-1.5 text-xs rounded-lg bg-[#0d1120] border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors";
  const selectClass = cn(inputClass, "cursor-pointer");
  const thCl = "px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wide";

  const groups = ['Base', 'Admin'];

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '180px 1fr' }}>
      {/* Sidebar tabs */}
      <div className="card p-2 h-fit">
        {groups.map(g => (
          <div key={g}>
            <p className="px-2 py-1.5 text-[10px] font-bold text-zinc-700 uppercase tracking-wider">{g}</p>
            {TABS.filter(t => t.group === g).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors mb-0.5',
                  tab === id
                    ? 'bg-brand-DEFAULT/15 text-brand-DEFAULT'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content pane */}
      <div className="card p-5 space-y-4">
        {/* SMTP */}
        {tab === 'smtp' && (
          <>
            <SHead>Configuration SMTP</SHead>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Hôte SMTP</label>
                <input className={inputClass} placeholder="smtp.domain.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Port</label>
                <input type="number" className={inputClass} placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Utilisateur</label>
                <input className={inputClass} placeholder="user@domain.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Mot de passe</label>
                <input type="password" className={inputClass} placeholder="••••••••" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-1" />
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Expéditeur</label>
                <input type="email" className={inputClass} placeholder="alerts@safedock.local" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Destinataire</label>
                <input type="email" className={inputClass} placeholder="admin@domain.com" value={smtpTo} onChange={e => setSmtpTo(e.target.value)} />
              </div>
            </div>
            <Toggle label="Ignorer la vérification TLS" checked={smtpTls} onChange={setSmtpTls} />
            <SaveBtn onClick={saveGlobal} />
          </>
        )}

        {/* Seuils */}
        {tab === 'seuils' && (
          <>
            <SHead>Seuils de tolérance SecOps globaux</SHead>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500">Tolérance de sévérité CVE globale</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)} className={selectClass}>
                <option value="CRITICAL">CRITICAL — bloque les failles critiques</option>
                <option value="HIGH">HIGH — critique et haute</option>
                <option value="MEDIUM">MEDIUM — critique, haute et moyenne</option>
                <option value="LOW">LOW — toutes les failles</option>
                <option value="NONE">NONE — toutes, même mineures</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Toggle label="Autoriser l'utilisateur root" checked={allowRoot} onChange={setAllowRoot} />
              <Toggle label="Autoriser le mode privilégié" checked={allowPrivileged} onChange={setAllowPrivileged} />
            </div>
            <SaveBtn onClick={saveGlobal} />
          </>
        )}

        {/* Prefs */}
        {tab === 'prefs' && (
          <>
            <SHead>Préférences générales</SHead>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Scanner CVE par défaut</label>
                <select value={scanner} onChange={e => setScanner(e.target.value)} className={selectClass}>
                  <option value="trivy">Trivy (Vulnérabilités standard)</option>
                  <option value="grype">Grype (Scan ultra-rapide OS)</option>
                  <option value="hybrid">Double-scan hybride (Trivy + Grype)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Intervalle de rafraîchissement (secondes)</label>
                <select value={pollInterval} onChange={e => setPollInterval(e.target.value)} className={selectClass}>
                  <option value="5">5s — Temps réel</option>
                  <option value="10">10s — Défaut SecOps</option>
                  <option value="30">30s</option>
                  <option value="60">60s — Hôtes limités</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Page d'atterrissage</label>
                <select value={defaultView} onChange={e => setDefaultView(e.target.value)} className={selectClass}>
                  <option value="dashboard">Dashboard principal</option>
                  <option value="containers">Inventaire des conteneurs</option>
                </select>
              </div>
              <Toggle label="Mises à jour automatiques des conteneurs" checked={autoUpdate} onChange={setAutoUpdate} />
            </div>
            <SaveBtn onClick={saveGlobal} />
          </>
        )}

        {/* Registries */}
        {tab === 'registries' && (
          <>
            <SHead>Registres Docker privés</SHead>
            <div className="space-y-1.5 mb-3">
              {registries.length === 0
                ? <p className="text-xs text-zinc-600 py-4 text-center">Aucun registre configuré.</p>
                : registries.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                    <span className="text-xs"><span className="text-blue-400 font-mono">{r.server_address}</span> <span className="text-zinc-600">({r.username})</span></span>
                    <button type="button" onClick={() => onDeleteRegistry(r.id)} className="text-red-500 hover:text-red-400 text-xs transition-colors">Supprimer</button>
                  </div>
                ))
              }
            </div>
            <form onSubmit={handleRegSubmit} className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Associer un registre</p>
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} placeholder="registry.gitlab.com" value={regServer} onChange={e => setRegServer(e.target.value)} required />
                <input className={inputClass} placeholder="user-deploy" value={regUser} onChange={e => setRegUser(e.target.value)} required />
                <input type="password" className={inputClass} placeholder="Token / Pass" value={regPass} onChange={e => setRegPass(e.target.value)} required />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors">
                  Enregistrer les identifiants
                </button>
              </div>
            </form>
          </>
        )}

        {/* Users */}
        {tab === 'users' && (
          <>
            <SHead>Utilisateurs SecOps</SHead>
            <table className="w-full text-xs mb-3">
              <thead><tr className="border-b border-white/[0.06]">
                <th className={thCl}>Identifiant</th><th className={thCl}>Email</th><th className={thCl}>Rôle</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.username} className="border-b border-white/[0.03]">
                    <td className="px-3 py-2.5 font-semibold text-zinc-200">{u.username}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-500">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">{u.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form onSubmit={handleAddUser} className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Inviter un utilisateur</p>
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} placeholder="Nom d'utilisateur" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                <input type="email" className={inputClass} placeholder="email@domain.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={selectClass}>
                  <option value="Lecteur">Lecteur</option>
                  <option value="Auditeur SecOps">Auditeur SecOps</option>
                  <option value="Administrateur">Administrateur</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors">
                  Envoyer l'invitation
                </button>
              </div>
            </form>
          </>
        )}

        {/* Agents */}
        {tab === 'agents' && (
          <>
            <SHead>Hôtes Multi-Hébergement</SHead>
            <table className="w-full text-xs mb-3">
              <thead><tr className="border-b border-white/[0.06]">
                <th className={thCl}>Hôte</th><th className={thCl}>IP</th><th className={thCl}>Statut</th><th className={cn(thCl, 'text-right')}>Version</th>
              </tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.name} className="border-b border-white/[0.03]">
                    <td className="px-3 py-2.5 font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Server className="w-3 h-3 text-blue-400" />{a.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-500">{a.ip}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('flex items-center gap-1.5 text-xs', a.status === 'connected' ? 'text-emerald-400' : 'text-zinc-600')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', a.status === 'connected' ? 'bg-emerald-400' : 'bg-zinc-700')} />
                        {a.status === 'connected' ? 'Connecté' : 'Hors ligne'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-zinc-600">{a.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form onSubmit={handleAddAgent} className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Enrôler un agent</p>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="Nom hôte (ex: edge-node-03)" value={agentName} onChange={e => setAgentName(e.target.value)} required />
                <input className={inputClass} placeholder="IP (ex: 192.168.1.96)" value={agentIp} onChange={e => setAgentIp(e.target.value)} required />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors">
                  Connecter l'Agent
                </button>
              </div>
            </form>
          </>
        )}

        {/* Security */}
        {tab === 'security' && (
          <>
            <SHead>Sécurité Entreprise</SHead>
            <div className="space-y-2">
              {[
                { label: 'Authentification unique SAML / SSO', desc: 'Intégrez SafeDock avec votre IdP (Okta, Azure AD).', enabled: false },
                { label: 'Validation Double Facteur (MFA/TOTP)', desc: 'Forcez l\'utilisation de TOTP pour toutes les connexions.', enabled: false },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                  <div>
                    <p className="text-xs font-semibold text-zinc-100">{item.label}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500">Désactivé</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-300 mb-2">Matrice RBAC</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-white/[0.06]">
                  <th className={thCl}>Permission</th>
                  <th className={cn(thCl, 'text-center')}>Lecteur</th>
                  <th className={cn(thCl, 'text-center')}>Auditeur</th>
                  <th className={cn(thCl, 'text-center')}>Admin</th>
                </tr></thead>
                <tbody>
                  {[
                    ['Visualiser les métriques', true, true, true],
                    ['Lancer des audits', false, true, true],
                    ['Gérer les configurations', false, false, true],
                  ].map(([perm, ...vals]) => (
                    <tr key={perm} className="border-b border-white/[0.03]">
                      <td className="px-3 py-2.5 font-medium text-zinc-300">{perm}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="px-3 py-2.5 text-center">
                          {v ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-zinc-700 mx-auto" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Status footer */}
        {status && (
          <p className="text-xs text-emerald-400 font-medium pt-2 border-t border-white/[0.06]">{status}</p>
        )}
      </div>
    </div>
  );
}

function SHead({ children }) {
  return <h3 className="text-sm font-semibold text-zinc-100 mb-1 pb-3 border-b border-white/[0.06]">{children}</h3>;
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1120] border border-white/[0.06]">
      <span className="text-xs font-medium text-zinc-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative w-8 h-4 rounded-full transition-colors', checked ? 'bg-blue-500' : 'bg-zinc-700')}
      >
        <span className={cn('absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function SaveBtn({ onClick }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onClick}
        className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
      >
        Enregistrer
      </button>
    </div>
  );
}
