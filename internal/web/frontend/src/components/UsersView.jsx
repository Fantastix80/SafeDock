import React, { useState } from 'react';
import { Users, UserPlus, Trash2, KeyRound, Smartphone, Tag as TagIcon, Plus, Check, Copy, History, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const ROLES = [
  { id: 'admin',   label: 'Admin' },
  { id: 'auditor', label: 'Auditeur' },
  { id: 'viewer',  label: 'Lecteur' },
];

export default function UsersView({
  me, users = [], tags = [], hosts = [],
  onCreateUser, onDeleteUser, onSetRole, onResetPassword, onResetMFA, onSetScope,
  onCreateTag, onDeleteTag, audit = [], onRefreshAudit,
}) {
  const [nu, setNu] = useState({ email: '', first_name: '', last_name: '', role: 'viewer', scope_all: false });
  const [msg, setMsg] = useState('');
  const [tagName, setTagName] = useState('');
  const [scopeEdit, setScopeEdit] = useState(null); // user being edited
  const [invite, setInvite] = useState(null); // { email, link, email_sent } à afficher après création/reset
  const [copied, setCopied] = useState(false);

  const notify = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      const res = await onCreateUser(nu);
      setInvite({ email: nu.email, link: res?.invite_link || '', email_sent: !!res?.email_sent });
      setNu({ email: '', first_name: '', last_name: '', role: 'viewer', scope_all: false });
    } catch (err) { notify(err.message); }
  };

  const copyInvite = () => {
    if (!invite?.link) return;
    navigator.clipboard?.writeText(invite.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const resetPw = async (u) => {
    const p = prompt(`Nouveau mot de passe temporaire pour ${u.username} (≥10 caractères) :`);
    if (!p) return;
    try { await onResetPassword(u.id, p); notify('Mot de passe réinitialisé (changement imposé au login).'); }
    catch (err) { notify(err.message); }
  };

  const createTag = async (e) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    try { await onCreateTag(tagName.trim()); setTagName(''); notify('Tag créé.'); }
    catch (err) { notify(err.message); }
  };

  const th = "px-3 py-2 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider";

  return (
    <div className="space-y-5">
      {msg && <p className="text-sm text-emerald-400 font-mono">{msg}</p>}

      {/* Création */}
      <form onSubmit={createUser} className="card p-4">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.06]">
          <UserPlus className="w-4 h-4 text-[#F7931A]" />
          <h3 className="font-heading text-sm font-semibold text-white">Créer un compte</h3>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <Inp label="Adresse e-mail (identifiant)" type="email" value={nu.email} onChange={v => setNu(p => ({ ...p, email: v }))} />
          <Inp label="Prénom" value={nu.first_name} onChange={v => setNu(p => ({ ...p, first_name: v }))} />
          <Inp label="Nom" value={nu.last_name} onChange={v => setNu(p => ({ ...p, last_name: v }))} />
          <div className="space-y-1">
            <Lbl>Rôle</Lbl>
            <select value={nu.role} onChange={e => setNu(p => ({ ...p, role: e.target.value }))}
              className="px-3 py-2 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white font-mono focus:outline-none focus:border-[#F7931A]/40">
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer pb-2">
            <input type="checkbox" checked={nu.scope_all} onChange={e => setNu(p => ({ ...p, scope_all: e.target.checked }))} />
            Voit tout le parc
          </label>
          <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25 hover:bg-[#F7931A]/25 transition-all">
            Inviter
          </button>
        </div>
        <p className="text-xs text-[#94A3B8]/60 mt-2">
          L'utilisateur reçoit un lien par e-mail pour définir lui-même son mot de passe et son MFA. Aucun mot de passe n'est saisi ici.
        </p>

        {invite && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-2">
            <p className="text-xs text-emerald-300">
              Compte <strong>{invite.email}</strong> créé.{' '}
              {invite.email_sent ? 'Invitation envoyée par e-mail.' : 'E-mail non configuré : transmettez le lien ci-dessous.'}
            </p>
            {invite.link ? (
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all px-3 py-2 rounded-lg bg-[#0A0C10] border border-white/[0.08] text-[#94A3B8] font-mono text-[11px]">{invite.link}</code>
                <button type="button" onClick={copyInvite} title="Copier le lien"
                  className="p-2 rounded-lg text-[#94A3B8] hover:text-[#F7931A] hover:bg-[#F7931A]/[0.08] shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-amber-300/90">
                Lien indisponible : configurez l'« URL de base » dans Paramètres → Préférences pour générer des liens d'invitation.
              </p>
            )}
            <button type="button" onClick={() => setInvite(null)} className="text-[11px] text-[#94A3B8]/60 hover:text-white">Fermer</button>
          </div>
        )}
      </form>

      {/* Liste utilisateurs */}
      <div className="card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Users className="w-4 h-4 text-[#F7931A]" />
          <span className="font-heading text-sm font-semibold text-white">Comptes ({users.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.04]">
              <th className={th}>Utilisateur</th><th className={th}>Rôle</th><th className={th}>MFA</th>
              <th className={th}>Portée</th><th className={cn(th, 'text-right')}>Actions</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="font-heading font-semibold text-white">
                      {[u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username}
                      {u.id === me.user_id && <span className="ml-2 text-[10px] font-mono text-[#F7931A]">(vous)</span>}
                    </div>
                    <div className="text-xs font-mono text-[#94A3B8]/50">{u.username}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select value={u.role} onChange={e => onSetRole(u.id, e.target.value).then(() => notify('Rôle mis à jour.')).catch(err => notify(err.message))}
                      className="px-2 py-1 text-xs rounded-lg bg-[#0A0C10] border border-white/[0.08] text-white font-mono">
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-xs font-mono', u.totp_enabled ? 'text-emerald-400' : 'text-[#94A3B8]/40')}>
                      {u.totp_enabled ? 'activé' : 'non enrôlé'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#94A3B8]">
                    {u.role === 'admin' || u.scope_all
                      ? 'tout le parc'
                      : `${(u.allowed_tags || []).length} tag(s) · ${(u.allowed_hosts || []).length} hôte(s)`}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {u.role !== 'admin' && !u.scope_all && (
                        <button onClick={() => setScopeEdit(u)} title="Portée" className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F7931A] hover:bg-[#F7931A]/[0.08]"><TagIcon className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => resetPw(u)} title="Réinitialiser le mot de passe" className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F7931A] hover:bg-[#F7931A]/[0.08]"><KeyRound className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { try { const res = await onResetMFA(u.id); setInvite({ email: u.username, link: res?.invite_link || '', email_sent: !!res?.email_sent }); } catch (err) { notify(err.message); } }} title="Réinitialiser le MFA (renvoie une invitation de ré-enrôlement)" className="p-1.5 rounded-lg text-[#94A3B8] hover:text-amber-400 hover:bg-amber-500/[0.08]"><Smartphone className="w-3.5 h-3.5" /></button>
                      {u.id !== me.user_id && (
                        <button onClick={() => onDeleteUser(u.id).then(() => notify('Supprimé.')).catch(err => notify(err.message))} title="Supprimer" className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-400 hover:bg-red-500/[0.08]"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Éditeur de portée */}
      {scopeEdit && (
        <ScopeEditor user={scopeEdit} tags={tags} hosts={hosts}
          onClose={() => setScopeEdit(null)}
          onSave={async (payload) => { await onSetScope(scopeEdit.id, payload); setScopeEdit(null); notify('Portée mise à jour.'); }} />
      )}

      {/* Tags */}
      <div className="card p-4">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.06]">
          <TagIcon className="w-4 h-4 text-[#F7931A]" />
          <h3 className="font-heading text-sm font-semibold text-white">Tags ({tags.length})</h3>
        </div>
        <form onSubmit={createTag} className="flex items-end gap-3 mb-3">
          <Inp label="Nouveau tag" value={tagName} onChange={setTagName} />
          <button type="submit" className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25 hover:bg-[#F7931A]/25"><Plus className="w-3.5 h-3.5" />Ajouter</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <span key={t.id} className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white font-mono">
              {t.name}
              <button onClick={() => onDeleteTag(t.id).then(() => notify('Tag supprimé.')).catch(err => notify(err.message))} className="text-[#94A3B8] hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-sm text-[#94A3B8]/40 font-mono">Aucun tag. Créez-en pour organiser et restreindre l'accès.</span>}
        </div>
      </div>

      {/* Journal d'audit de sécurité */}
      <div className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#F7931A]" />
            <span className="font-heading text-sm font-semibold text-white">Journal d'audit de sécurité</span>
          </div>
          {onRefreshAudit && (
            <button onClick={onRefreshAudit} title="Rafraîchir" className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/[0.04]">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0F1115]"><tr className="border-b border-white/[0.04]">
              <th className={th}>Date</th><th className={th}>Acteur</th><th className={th}>Action</th><th className={th}>Cible</th><th className={th}>Détail</th>
            </tr></thead>
            <tbody>
              {audit.map(e => (
                <tr key={e.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-xs text-[#94A3B8]/70 whitespace-nowrap">{fmtAuditTime(e.timestamp)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-white">{e.actor || '—'}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded-md text-xs font-mono bg-white/[0.05] text-[#F7931A] border border-[#F7931A]/20">{e.action}</span></td>
                  <td className="px-3 py-2 font-mono text-xs text-[#94A3B8]">{e.target || '—'}</td>
                  <td className="px-3 py-2 text-xs text-[#94A3B8]/70">{e.detail}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[#94A3B8]/40 font-mono">Aucune action enregistrée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtAuditTime(s) {
  if (!s) return '';
  try {
    const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

function ScopeEditor({ user, tags, hosts, onClose, onSave }) {
  const [scopeAll, setScopeAll] = useState(user.scope_all);
  const [selTags, setSelTags] = useState(new Set(user.allowed_tags || []));
  const [selHosts, setSelHosts] = useState(new Set(user.allowed_hosts || []));

  const toggle = (set, setter, id) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  };

  return (
    <div className="card p-4 border-[#F7931A]/30">
      <h3 className="font-heading text-sm font-semibold text-white mb-3">Portée de {user.username}</h3>
      <label className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer mb-3">
        <input type="checkbox" checked={scopeAll} onChange={e => setScopeAll(e.target.checked)} /> Voit tout le parc
      </label>
      {!scopeAll && (
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs font-mono text-[#94A3B8]/60 uppercase mb-2">Tags autorisés</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <button key={t.id} onClick={() => toggle(selTags, setSelTags, t.id)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-mono border', selTags.has(t.id) ? 'bg-[#F7931A]/15 text-[#F7931A] border-[#F7931A]/30' : 'bg-white/[0.04] text-[#94A3B8] border-white/[0.08]')}>
                  {selTags.has(t.id) && <Check className="w-3 h-3 inline mr-1" />}{t.name}
                </button>
              ))}
              {tags.length === 0 && <span className="text-xs text-[#94A3B8]/40">aucun tag</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-mono text-[#94A3B8]/60 uppercase mb-2">Hôtes autorisés</p>
            <div className="flex flex-wrap gap-1.5">
              {hosts.map(h => (
                <button key={h.id} onClick={() => toggle(selHosts, setSelHosts, h.id)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-mono border', selHosts.has(h.id) ? 'bg-[#F7931A]/15 text-[#F7931A] border-[#F7931A]/30' : 'bg-white/[0.04] text-[#94A3B8] border-white/[0.08]')}>
                  {selHosts.has(h.id) && <Check className="w-3 h-3 inline mr-1" />}{h.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm font-mono rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white border border-white/[0.08]">Annuler</button>
        <button onClick={() => onSave({ scope_all: scopeAll, allowed_tags: [...selTags], allowed_hosts: [...selHosts] })}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25 hover:bg-[#F7931A]/25">Enregistrer</button>
      </div>
    </div>
  );
}

function Lbl({ children }) { return <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">{children}</label>; }
function Inp({ label, type = 'text', value, onChange }) {
  return (
    <div className="space-y-1">
      <Lbl>{label}</Lbl>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="px-3 py-2 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white font-mono focus:outline-none focus:border-[#F7931A]/40" />
    </div>
  );
}
