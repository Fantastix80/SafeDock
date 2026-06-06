import React, { useState, useEffect } from 'react';
import { Mail, ShieldHalf, Settings2, Key, Building2, CheckCircle2, XCircle, DatabaseBackup, Download, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiGet, apiSend } from '../lib/session';

// La gestion des comptes et des permissions vit désormais dans la page « Utilisateurs ».
const TABS = [
  { id: 'smtp',        label: 'SMTP / Alertes',      icon: Mail,       group: 'Base' },
  { id: 'seuils',      label: 'Seuils SecOps',        icon: ShieldHalf, group: 'Base' },
  { id: 'prefs',       label: 'Préférences',          icon: Settings2,  group: 'Base' },
  { id: 'registries',  label: 'Registres Privés',     icon: Key,        group: 'Admin' },
  { id: 'backups',     label: 'Sauvegardes',          icon: DatabaseBackup, group: 'Admin' },
  { id: 'security',    label: 'Sécurité Entreprise',  icon: Building2,  group: 'Admin' },
];

function formatSize(bytes) {
  if (!bytes) return '0 o';
  const u = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

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
  const [smtpTls, setSmtpTls] = useState(false);
  const [retention, setRetention] = useState(90);
  const [baseUrl, setBaseUrl] = useState('');
  const [retCve, setRetCve] = useState(-1);
  const [retNotif, setRetNotif] = useState(-1);
  const [retSecaudit, setRetSecaudit] = useState(-1);
  const [retSeclogs, setRetSeclogs] = useState(-1);
  const [regServer, setRegServer] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
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
    setSmtpTls(config.SMTP?.TLSSkipVerify || false);
    setBaseUrl(config.BaseURL || '');
    const r = config.Retention || {};
    setRetention(r.default != null ? r.default : (config.RetentionDays != null ? config.RetentionDays : 90));
    setRetCve(r.cve != null ? r.cve : -1);
    setRetNotif(r.notifications != null ? r.notifications : -1);
    setRetSecaudit(r.security_audit != null ? r.security_audit : -1);
    setRetSeclogs(r.audit_logs != null ? r.audit_logs : -1);
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
      smtp_tls_skip_verify: smtpTls,
      base_url: baseUrl.trim(),
      retention_days: Number(retention),
      retention: {
        default: Number(retention),
        cve: Number(retCve),
        notifications: Number(retNotif),
        security_audit: Number(retSecaudit),
        audit_logs: Number(retSeclogs),
      },
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

  // Sauvegardes de la base
  const [backups, setBackups] = useState([]);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupKeep, setBackupKeep] = useState(7);
  const [backupBusy, setBackupBusy] = useState(false);

  const loadBackups = () => {
    apiGet('/api/backups')
      .then(d => {
        if (!d) return;
        setBackups(d.backups || []);
        if (d.config) { setBackupEnabled(!!d.config.enabled); setBackupKeep(d.config.keep != null ? d.config.keep : 7); }
      })
      .catch(() => {});
  };
  useEffect(() => { if (tab === 'backups') loadBackups(); }, [tab]);

  const createBackup = async () => {
    setBackupBusy(true); setStatus('Création de la sauvegarde…');
    try {
      await apiSend('/api/backups');
      setStatus('Sauvegarde créée.'); loadBackups();
    } catch (e) { setStatus('Échec : ' + (e.message || 'sauvegarde')); }
    finally { setBackupBusy(false); setTimeout(() => setStatus(''), 4000); }
  };

  const saveBackupCfg = async (enabled, keep) => {
    const prevEnabled = backupEnabled, prevKeep = backupKeep;
    setBackupEnabled(enabled); setBackupKeep(keep); // optimiste
    try {
      await apiSend('/api/backups/config', { enabled, keep: Number(keep) });
      setStatus('Paramètres de sauvegarde enregistrés.'); setTimeout(() => setStatus(''), 3000);
    } catch (e) {
      // Échec de persistance : on revient à l'état précédent et on signale.
      setBackupEnabled(prevEnabled); setBackupKeep(prevKeep);
      setStatus('Échec : ' + (e.message || 'enregistrement')); setTimeout(() => setStatus(''), 4000);
    }
  };

  const deleteBackup = async (name) => {
    if (!window.confirm(`Supprimer la sauvegarde ${name} ?`)) return;
    try {
      await apiSend('/api/backups/delete', { name });
      setStatus('Sauvegarde supprimée.'); setTimeout(() => setStatus(''), 3000);
    } catch (e) {
      setStatus('Échec : ' + (e.message || 'suppression')); setTimeout(() => setStatus(''), 4000);
    }
    loadBackups();
  };

  const inputClass = "w-full px-3 py-1.5 text-xs rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono";
  const selectClass = cn(inputClass, "cursor-pointer");
  const thCl = "px-3 py-2.5 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest";

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '180px 1fr' }}>
      {/* Sidebar tabs */}
      <div className="card p-2 h-fit">
        {['Base', 'Admin'].map(g => (
          <div key={g}>
            <p className="px-2 py-1.5 font-mono text-xs font-medium text-[#94A3B8]/40 uppercase tracking-widest">{g}</p>
            {TABS.filter(t => t.group === g).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors mb-0.5',
                  tab === id
                    ? 'bg-[#F7931A]/10 text-[#F7931A]'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
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
                <FieldLabel>Hôte SMTP</FieldLabel>
                <input className={inputClass} placeholder="smtp.domain.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Port</FieldLabel>
                <input type="number" className={inputClass} placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Utilisateur</FieldLabel>
                <input className={inputClass} placeholder="user@domain.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Mot de passe</FieldLabel>
                <input type="password" className={inputClass} placeholder="••••••••" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-1" />
              <div className="space-y-1">
                <FieldLabel>Expéditeur</FieldLabel>
                <input type="email" className={inputClass} placeholder="alerts@safedock.local" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-[#94A3B8]/70 font-mono">
              Les destinataires ne se configurent plus ici : chaque utilisateur recevra les alertes sur son
              adresse e-mail (= son identifiant), selon ses abonnements et son périmètre de visibilité.
            </p>
            <Toggle label="Ignorer la vérification TLS" checked={smtpTls} onChange={setSmtpTls} />
            <SaveBtn onClick={saveGlobal} />
          </>
        )}

        {/* Seuils */}
        {tab === 'seuils' && (
          <>
            <SHead>Seuils de tolérance SecOps globaux</SHead>
            <div className="space-y-1">
              <FieldLabel>Tolérance de sévérité CVE globale</FieldLabel>
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
            <SHead>Préférences & données</SHead>
            <div className="space-y-3">
              <div className="space-y-1">
                <FieldLabel>Scanner CVE par défaut</FieldLabel>
                <select value={scanner} onChange={e => setScanner(e.target.value)} className={selectClass}>
                  <option value="trivy">Trivy (Vulnérabilités standard)</option>
                  <option value="grype">Grype (Scan ultra-rapide OS)</option>
                  <option value="hybrid">Double-scan hybride (Trivy + Grype)</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <FieldLabel>URL de base (liens d'invitation)</FieldLabel>
                <input className={inputClass} placeholder="https://safedock.mondomaine.com:8080" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                <p className="text-xs text-[#94A3B8]/50 mt-1">
                  Adresse par laquelle vos utilisateurs accèdent à SafeDock. Sert à bâtir les liens d'invitation envoyés par e-mail.
                  Laissez vide pour déduire automatiquement l'adresse de chaque requête.
                </p>
              </div>
              <div className="space-y-1">
                <FieldLabel>Rétention des données — défaut</FieldLabel>
                <select value={retention} onChange={e => setRetention(Number(e.target.value))} className={selectClass}>
                  <option value={30}>30 jours</option>
                  <option value={90}>90 jours (défaut)</option>
                  <option value={180}>180 jours</option>
                  <option value={365}>1 an</option>
                  <option value={0}>Illimité</option>
                </select>
                <p className="text-xs text-[#94A3B8]/50 mt-1">
                  Valeur appliquée à chaque catégorie réglée sur « Hériter du défaut ». Purge automatique quotidienne ; « Illimité » conserve tout.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2 pt-1">
                <FieldLabel>Affiner par catégorie (optionnel)</FieldLabel>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                  <RetentionCat label="Historique CVE / tendances" value={retCve} onChange={setRetCve} selectClass={selectClass} />
                  <RetentionCat label="Notifications" value={retNotif} onChange={setRetNotif} selectClass={selectClass} />
                  <RetentionCat label="Audit de sécurité (RBAC)" value={retSecaudit} onChange={setRetSecaudit} selectClass={selectClass} />
                  <RetentionCat label="Journal SecOps (déploiements)" value={retSeclogs} onChange={setRetSeclogs} selectClass={selectClass} />
                </div>
                <p className="text-xs text-[#94A3B8]/50">
                  Ex. conserver l'historique CVE 1 an pour les tendances, tout en purgeant les notifications à 30 jours.
                </p>
              </div>
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
                ? <p className="font-mono text-xs text-[#94A3B8]/40 py-4 text-center">Aucun registre configuré.</p>
                : registries.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0A0C10] border border-white/[0.05] hover:border-[#F7931A]/10 transition-all">
                    <span className="text-xs">
                      <span className="text-[#F7931A] font-mono">{r.server_address}</span>
                      {' '}<span className="text-[#94A3B8]">({r.username})</span>
                    </span>
                    <button type="button" onClick={() => onDeleteRegistry(r.id)} className="text-red-400 hover:text-red-300 text-xs font-mono transition-colors">
                      Supprimer
                    </button>
                  </div>
                ))
              }
            </div>
            <form onSubmit={handleRegSubmit} className="space-y-2">
              <p className="font-mono text-xs font-medium text-[#94A3B8]/40 uppercase tracking-widest">Associer un registre</p>
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} placeholder="registry.gitlab.com" value={regServer} onChange={e => setRegServer(e.target.value)} required />
                <input className={inputClass} placeholder="user-deploy" value={regUser} onChange={e => setRegUser(e.target.value)} required />
                <input type="password" className={inputClass} placeholder="Token / Pass" value={regPass} onChange={e => setRegPass(e.target.value)} required />
              </div>
              <div className="flex justify-end">
                <OrangeBtn type="submit">Enregistrer les identifiants</OrangeBtn>
              </div>
            </form>
          </>
        )}

        {/* Backups */}
        {tab === 'backups' && (
          <>
            <SHead>Sauvegardes de la base</SHead>
            <p className="text-xs text-[#94A3B8] -mt-2">
              Instantanés cohérents de la base SafeDock (toute la configuration, l'historique CVE, les comptes…), créés
              automatiquement chaque jour et conservés à côté des données. Vous pouvez aussi en déclencher un à la demande.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Toggle label="Sauvegarde quotidienne automatique" checked={backupEnabled} onChange={v => saveBackupCfg(v, backupKeep)} />
              <div className="space-y-1">
                <FieldLabel>Sauvegardes à conserver (rotation)</FieldLabel>
                <select value={backupKeep} onChange={e => saveBackupCfg(backupEnabled, Number(e.target.value))} className={selectClass}>
                  <option value={3}>3 dernières</option>
                  <option value={7}>7 dernières (défaut)</option>
                  <option value={14}>14 dernières</option>
                  <option value={30}>30 dernières</option>
                  <option value={0}>Illimité</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-xs text-[#94A3B8]">{backups.length} sauvegarde(s)</span>
              <button type="button" onClick={createBackup} disabled={backupBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all disabled:opacity-40">
                {backupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />} Sauvegarder maintenant
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={thCl}>Sauvegarde</th>
                    <th className={thCl}>Date (UTC)</th>
                    <th className={cn(thCl, 'text-right')}>Taille</th>
                    <th className={cn(thCl, 'text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-[#94A3B8]/40 font-mono">Aucune sauvegarde pour l'instant.</td></tr>
                  )}
                  {backups.map(b => (
                    <tr key={b.name} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[#94A3B8]/80">{b.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[#94A3B8]/60">{b.created_at ? b.created_at.replace('T', ' ').replace('Z', '') : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#94A3B8]/80">{formatSize(b.size)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/api/backups/download?name=${encodeURIComponent(b.name)}`}
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F7931A] hover:bg-[#F7931A]/[0.08] transition-colors" title="Télécharger">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button type="button" onClick={() => deleteBackup(b.name)}
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-400 hover:bg-red-500/[0.08] transition-colors" title="Supprimer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <DatabaseBackup className="w-3.5 h-3.5 text-[#94A3B8] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#94A3B8]/80 leading-relaxed">
                <strong className="text-[#94A3B8]">Restauration :</strong> arrêtez le conteneur SafeDock, remplacez
                <code className="text-[#94A3B8]"> /var/lib/safedock/safedock.db </code> par le fichier de sauvegarde (renommé
                <code className="text-[#94A3B8]"> safedock.db </code>), puis redémarrez. La clé de chiffrement
                (<code className="text-[#94A3B8]">secret.key</code>) doit être celle d'origine pour déchiffrer les secrets.
              </p>
            </div>
          </>
        )}

        {/* Security */}
        {tab === 'security' && (
          <>
            <SHead>Sécurité Entreprise</SHead>
            <div className="space-y-2">
              {[
                { label: 'Validation Double Facteur (MFA/TOTP)', desc: 'Obligatoire pour chaque compte, avec codes de secours à usage unique.', state: 'on' },
                { label: 'Comptes & RBAC par rôle', desc: 'Rôles Administrateur / Auditeur / Lecteur appliqués côté serveur.', state: 'on' },
                { label: 'Portées par tags et par hôte', desc: "Limitez la visibilité d'un compte à un périmètre de conteneurs.", state: 'on' },
                { label: 'Authentification unique SAML / SSO', desc: 'Intégration IdP (Okta, Azure AD) — prévue dans une prochaine version.', state: 'soon' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-[#0A0C10] border border-white/[0.05] hover:border-[#F7931A]/10 transition-all">
                  <div>
                    <p className="text-xs font-semibold text-white">{item.label}</p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{item.desc}</p>
                  </div>
                  {item.state === 'on' ? (
                    <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Activé</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-white/[0.04] text-[#94A3B8] border border-white/[0.08]">Bientôt</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="font-heading text-xs font-semibold text-white mb-2">Matrice RBAC</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={thCl}>Permission</th>
                    <th className={cn(thCl, 'text-center')}>Lecteur</th>
                    <th className={cn(thCl, 'text-center')}>Auditeur</th>
                    <th className={cn(thCl, 'text-center')}>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Visualiser les métriques', true,  true,  true],
                    ['Lancer des audits',         false, true,  true],
                    ['Gérer les configurations',  false, false, true],
                  ].map(([perm, ...vals]) => (
                    <tr key={perm} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-medium text-white">{perm}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="px-3 py-2.5 text-center">
                          {v
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                            : <XCircle className="w-3.5 h-3.5 text-[#94A3B8]/30 mx-auto" />
                          }
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
          <p className="text-xs text-emerald-400 font-mono font-medium pt-2 border-t border-white/[0.06]">{status}</p>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">{children}</label>;
}

function SHead({ children }) {
  return <h3 className="font-heading text-sm font-semibold text-white mb-1 pb-3 border-b border-white/[0.06]">{children}</h3>;
}

function RetentionCat({ label, value, onChange, selectClass }) {
  return (
    <div className="space-y-1">
      <label className="font-mono text-[11px] text-[#94A3B8]/70">{label}</label>
      <select value={value} onChange={e => onChange(Number(e.target.value))} className={selectClass}>
        <option value={-1}>Hériter du défaut</option>
        <option value={30}>30 jours</option>
        <option value={90}>90 jours</option>
        <option value={180}>180 jours</option>
        <option value={365}>1 an</option>
        <option value={0}>Illimité</option>
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06] hover:border-[#F7931A]/15 transition-all">
      <span className="text-xs font-medium text-white">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 border',
          checked
            ? 'bg-[#F7931A] border-[#F7931A]/50 shadow-[0_0_14px_rgba(247,147,26,0.5)]'
            : 'bg-white/[0.07] border-white/[0.14]'
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 -translate-y-1/2 bg-white rounded-full shadow-sm transition-[left] duration-200',
            'w-[1.125rem] h-[1.125rem]',
            checked ? 'left-[calc(100%-1.3125rem)]' : 'left-[0.1875rem]'
          )}
        />
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
        className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
      >
        Enregistrer
      </button>
    </div>
  );
}

function OrangeBtn({ children, type = 'button', onClick }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
    >
      {children}
    </button>
  );
}
