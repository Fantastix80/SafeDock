import React, { useState } from 'react';
import { UserSquare, Lock, Bell, ShieldCheck, Check } from 'lucide-react';
import { cn } from '../lib/utils';

const TABS = [
  { id: 'infos',         label: 'Infos',         icon: UserSquare },
  { id: 'securite',      label: 'Sécurité',       icon: Lock },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
];

export default function AccountView() {
  const [activeTab, setActiveTab] = useState('infos');
  const [user, setUser] = useState({
    username: 'Hell0W0rld', email: 'secops-admin@safedock.local',
    fullName: 'Jean SecOps', role: 'Administrateur Principal', organization: 'SafeDock Corp'
  });
  const [notif, setNotif] = useState({
    cveAlerts: true, statusChanges: true, deployments: false,
    secretLeaks: true, enableThreshold: true, minSeverity: 'CRITICAL'
  });
  const [mfa, setMfa] = useState(false);
  const [status, setStatus] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    setStatus('Enregistrement...');
    setTimeout(() => {
      setStatus('Préférences mises à jour.');
      setTimeout(() => setStatus(''), 4000);
    }, 800);
  };

  const toggleNotif = (key) => setNotif(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '240px 1fr' }}>
      {/* Profile card */}
      <div className="card p-5 h-fit text-center hover:border-[#F7931A]/20 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.15)] transition-all duration-300">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F7931A] to-[#FFD600] flex items-center justify-center text-2xl font-bold text-black border-2 border-[#F7931A]/40 shadow-[0_0_20px_rgba(247,147,26,0.4)]">
            J
          </div>
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0F1115] shadow-[0_0_8px_#34d399]" />
        </div>

        <h3 className="font-heading text-sm font-bold text-white">{user.fullName}</h3>
        <p className="text-xs text-[#94A3B8] font-mono mt-0.5">@{user.username}</p>

        <span className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3" /> {user.role}
        </span>

        <div className="mt-4 pt-4 border-t border-white/[0.06] text-left space-y-2">
          <p className="font-mono text-xs text-[#94A3B8]/40 uppercase font-medium tracking-widest mb-2">Appartenance</p>
          <Row label="Organisation" value={user.organization} />
          <Row label="Session IP"   value={<code className="font-mono text-xs text-[#94A3B8]">192.168.1.100</code>} />
          <Row label="Status SSO"   value={<span className="font-mono text-xs text-[#94A3B8]/40">Désactivé</span>} />
        </div>
      </div>

      {/* Tabbed main panel */}
      <div className="card flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-white/[0.06] px-2 pt-2 gap-1 shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-sm font-medium transition-all duration-200 font-mono',
                activeTab === id
                  ? 'bg-[#F7931A]/10 text-[#F7931A] border border-b-transparent border-[#F7931A]/20'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <form onSubmit={handleSave} className="flex-1 p-5 space-y-4">

          {/* ── Infos ── */}
          {activeTab === 'infos' && (
            <div className="space-y-4">
              <p className="text-sm text-[#94A3B8] font-mono">Identité et appartenance du compte SecOps.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom complet"         value={user.fullName}     onChange={v => setUser(p => ({ ...p, fullName: v }))} />
                <Field label="Adresse email"        type="email" value={user.email}     onChange={v => setUser(p => ({ ...p, email: v }))} />
                <Field label="Nom d'utilisateur"    value={user.username}     onChange={v => setUser(p => ({ ...p, username: v }))} />
                <Field label="Organisation"         value={user.organization} onChange={v => setUser(p => ({ ...p, organization: v }))} />
              </div>
            </div>
          )}

          {/* ── Sécurité ── */}
          {activeTab === 'securite' && (
            <div className="space-y-3">
              <p className="text-sm text-[#94A3B8] font-mono">Mots de passe et authentification multi-facteurs.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nouveau mot de passe"       type="password" placeholder="••••••••••••" value="" onChange={() => {}} />
                <Field label="Confirmer le mot de passe"  type="password" placeholder="••••••••••••" value="" onChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0C10] border border-white/[0.06] hover:border-[#F7931A]/15 transition-all">
                <div>
                  <p className="text-sm font-semibold text-white">Validation Double Facteur (2FA / TOTP)</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">Sécuriser l'accès avec un code temporaire sur votre appareil mobile.</p>
                </div>
                <ToggleSwitch checked={mfa} onChange={setMfa} />
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <p className="text-sm text-[#94A3B8] font-mono">Événements pour lesquels vous souhaitez être averti par e-mail.</p>
              <div className="space-y-3">
                {[
                  { key: 'cveAlerts',     label: 'Alertes sur les failles de sécurité (CVE)' },
                  { key: 'statusChanges', label: 'Changements de statuts de conteneurs' },
                  { key: 'deployments',   label: 'Déploiements et Rollouts pivots effectués' },
                  { key: 'secretLeaks',   label: 'Fuites de secrets détectées (SecOps)' },
                ].map(({ key, label }) => (
                  <div
                    key={key}
                    onClick={() => toggleNotif(key)}
                    className="flex items-center gap-3 cursor-pointer group select-none"
                  >
                    <CheckboxIndicator checked={notif[key]} />
                    <span className="text-sm text-[#94A3B8] group-hover:text-white transition-colors">{label}</span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-[#0A0C10] border border-white/[0.06] space-y-3">
                <div
                  onClick={() => toggleNotif('enableThreshold')}
                  className="flex items-start gap-3 cursor-pointer group select-none"
                >
                  <CheckboxIndicator checked={notif.enableThreshold} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-[#F7931A] transition-colors">
                      Filtrer par niveau de criticité minimum
                    </p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">Uniquement les alertes de ce niveau ou plus élevé.</p>
                  </div>
                </div>
                {notif.enableThreshold && (
                  <select
                    value={notif.minSeverity}
                    onChange={e => setNotif(p => ({ ...p, minSeverity: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm rounded-xl bg-[#0F1115] border border-white/[0.08] text-white focus:outline-none focus:border-[#F7931A]/40 font-mono cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Save footer */}
          <div className="flex items-center justify-end gap-4 pt-2 border-t border-white/[0.06]">
            {status && <p className="text-sm text-emerald-400 font-mono font-medium">{status}</p>}
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
            >
              Enregistrer les préférences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="text-[#94A3B8]/60">{label} :</span>
      <span className="text-[#94A3B8] text-right">{value}</span>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div className="space-y-1">
      <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono"
      />
    </div>
  );
}

/**
 * Pure visual checkbox indicator — pointer-events-none, parent div handles clicks.
 * Use inside a `group` div with `onClick` toggle.
 */
export function CheckboxIndicator({ checked, className }) {
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

function ToggleSwitch({ checked, onChange }) {
  return (
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
  );
}
