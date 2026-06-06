import React, { useState } from 'react';
import { UserSquare, Lock, ShieldCheck, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import PasswordChecklist from './PasswordChecklist';
import { checkPassword } from '../lib/passwordPolicy';

const TABS = [
  { id: 'infos',         label: 'Infos',         icon: UserSquare },
  { id: 'securite',      label: 'Sécurité',       icon: Lock },
];

const ROLE_LABEL = { admin: 'Administrateur', auditor: 'Auditeur', viewer: 'Lecteur' };

function monogram(firstName, lastName, email) {
  const a = (firstName || '').trim(), b = (lastName || '').trim();
  if (a && b) return (a[0] + b[0]).toUpperCase();
  const base = a || b || email || '';
  if (!base) return '?';
  return base.slice(0, 2).toUpperCase();
}

export default function AccountView({ me, onChangePassword, onUpdateProfile }) {
  const [activeTab, setActiveTab] = useState('infos');
  const [firstName, setFirstName] = useState(me?.first_name || '');
  const [lastName, setLastName] = useState(me?.last_name || '');
  const [profileStatus, setProfileStatus] = useState({ text: '', type: '' });
  const email = me?.username || '';                 // identifiant = adresse e-mail (non modifiable)
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || email;
  const roleLabel = ROLE_LABEL[me?.role] || me?.role || '';

  const saveProfile = async () => {
    try {
      await onUpdateProfile(firstName, lastName);
      setProfileStatus({ text: 'Profil mis à jour.', type: 'ok' });
      setTimeout(() => setProfileStatus({ text: '', type: '' }), 4000);
    } catch (err) {
      setProfileStatus({ text: err.message || 'Échec de la mise à jour.', type: 'error' });
    }
  };
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState({ text: '', type: '' });

  const changePassword = async () => {
    if (!checkPassword(newPw).ok) { setPwStatus({ text: 'Le mot de passe ne respecte pas la politique de sécurité.', type: 'error' }); return; }
    if (newPw !== confirmPw) { setPwStatus({ text: 'Les mots de passe ne correspondent pas.', type: 'error' }); return; }
    try {
      await onChangePassword(curPw, newPw);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      setPwStatus({ text: 'Mot de passe changé avec succès.', type: 'ok' });
    } catch (err) {
      setPwStatus({ text: err.message || 'Échec du changement.', type: 'error' });
    }
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '240px 1fr' }}>
      {/* Profile card */}
      <div className="card p-5 h-fit text-center hover:border-[#F7931A]/20 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.15)] transition-all duration-300">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F7931A] to-[#FFD600] flex items-center justify-center text-2xl font-bold text-black border-2 border-[#F7931A]/40 shadow-[0_0_20px_rgba(247,147,26,0.4)]">
            {monogram(firstName, lastName, email)}
          </div>
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0F1115] shadow-[0_0_8px_#34d399]" />
        </div>

        <h3 className="font-heading text-sm font-bold text-white">{displayName}</h3>
        <p className="text-xs text-[#94A3B8] font-mono mt-0.5">{email}</p>

        <span className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3" /> {roleLabel}
        </span>

        <div className="mt-4 pt-4 border-t border-white/[0.06] text-left space-y-2">
          <p className="font-mono text-xs text-[#94A3B8]/40 uppercase font-medium tracking-widest mb-2">Compte</p>
          <Row label="E-mail" value={<span className="font-mono text-xs text-[#94A3B8]">{email || '—'}</span>} />
          <Row label="Rôle"  value={<span className="font-mono text-xs text-[#94A3B8]">{roleLabel}</span>} />
          <Row label="MFA"   value={<span className="font-mono text-xs text-emerald-400">Actif</span>} />
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
        <form onSubmit={e => e.preventDefault()} className="flex-1 p-5 space-y-4">

          {/* ── Infos ── */}
          {activeTab === 'infos' && (
            <div className="space-y-4">
              <p className="text-sm text-[#94A3B8] font-mono">Votre identité affichée. L'adresse e-mail sert d'identifiant de connexion et n'est pas modifiable (contactez un administrateur).</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom" value={firstName} onChange={setFirstName} placeholder="Prénom" />
                <Field label="Nom"    value={lastName}  onChange={setLastName}  placeholder="Nom" />
                <div className="space-y-1 col-span-2">
                  <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Adresse e-mail (identifiant)</label>
                  <input value={email} disabled
                    className="w-full px-3 py-2 text-sm rounded-xl bg-[#0A0C10]/60 border border-white/[0.06] text-[#94A3B8]/60 font-mono cursor-not-allowed" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={saveProfile}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25 hover:bg-[#F7931A]/25 transition-all">
                  Enregistrer le profil
                </button>
                {profileStatus.text && (
                  <p className={cn('text-sm font-mono', profileStatus.type === 'ok' ? 'text-emerald-400' : 'text-red-400')}>{profileStatus.text}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Sécurité ── */}
          {activeTab === 'securite' && (
            <div className="space-y-3">
              <p className="text-sm text-[#94A3B8] font-mono">Changer votre mot de passe.</p>
              <div className="grid grid-cols-1 gap-3 max-w-md">
                <Field label="Mot de passe actuel"        type="password" placeholder="••••••••••••" value={curPw}     onChange={setCurPw} />
                <Field label="Nouveau mot de passe"       type="password" placeholder="••••••••••••" value={newPw}     onChange={setNewPw} />
                <Field label="Confirmer le mot de passe"  type="password" placeholder="••••••••••••" value={confirmPw} onChange={setConfirmPw} />
                <PasswordChecklist password={newPw} />
              </div>
              {pwStatus.text && (
                <p className={cn('text-sm font-mono', pwStatus.type === 'ok' ? 'text-emerald-400' : 'text-red-400')}>{pwStatus.text}</p>
              )}
              <button type="button" onClick={changePassword}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25 hover:bg-[#F7931A]/25 transition-all">
                Changer le mot de passe
              </button>
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-[#0A0C10] border border-white/[0.06] mt-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-xs text-[#94A3B8]">La double authentification (TOTP) est <strong className="text-white">active</strong> sur votre compte.</p>
              </div>
            </div>
          )}

          {/* Les alertes (CVE, déploiements bloqués) arrivent dans le Centre de
              notifications et par e-mail si le SMTP est configuré. */}
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
