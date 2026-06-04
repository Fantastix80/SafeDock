import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Loader2, Smartphone, KeyRound, Copy, Check, User as UserIcon } from 'lucide-react';
import QRCode from 'qrcode';

export default function LoginView({ onSuccess }) {
  // phases : password | enroll | code | backup | mustchange
  const [phase, setPhase] = useState('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [mustChange, setMustChange] = useState(false);
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qrSource, setQrSource] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Génère le QR code à partir de l'URI otpauth lors de l'enrôlement.
  useEffect(() => {
    if (!qrSource) return;
    QRCode.toDataURL(qrSource, { margin: 1, width: 200, color: { dark: '#0A0C10', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [qrSource]);

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur serveur (HTTP ${res.status})`);

      // On conserve le mot de passe : utile si un changement est imposé ensuite.
      if (data.status === 'enroll_required') {
        setSecret(data.secret || '');
        setQrSource(data.otpauth_uri || '');
        setPhase('enroll');
      } else {
        setPhase('code');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!code) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/login/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur serveur (HTTP ${res.status})`);

      setCode('');
      const mc = !!data.must_change_password;
      setMustChange(mc);
      if (data.backup_codes && data.backup_codes.length > 0) {
        setBackupCodes(data.backup_codes);
        setPhase('backup');
      } else if (mc) {
        setPhase('mustchange');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    if (newPw.length < 10) { setError('Le nouveau mot de passe doit faire au moins 10 caractères'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: password, new_password: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur serveur (HTTP ${res.status})`);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard?.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#030304] px-4 py-8">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#F7931A] opacity-[0.06] blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <SafeDockLogo size={56} />
          <h1 className="font-heading text-2xl font-bold text-white mt-4 tracking-wide">SafeDock</h1>
          <p className="text-sm text-[#94A3B8] font-mono mt-1">Pare-feu de déploiement conteneurisé</p>
        </div>

        <div className="bg-[#0F1115] border border-white/[0.08] rounded-2xl p-6 shadow-xl">
          {/* ── Phase 1 : mot de passe ── */}
          {phase === 'password' && (
            <form onSubmit={submitPassword}>
              <Header icon={ShieldCheck} title="Authentification" />
              <Label>Adresse e-mail</Label>
              <InputWithIcon icon={UserIcon} value={username} onChange={setUsername} autoFocus placeholder="vous@entreprise.com" />
              <div className="mt-3"><Label>Mot de passe</Label></div>
              <InputWithIcon icon={Lock} type="password" value={password} onChange={setPassword} placeholder="••••••••••••" />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn busy={busy} disabled={!username || !password}>Continuer</SubmitBtn>
            </form>
          )}

          {/* ── Phase 2a : enrôlement MFA (premier login) ── */}
          {phase === 'enroll' && (
            <form onSubmit={submitCode}>
              <Header icon={Smartphone} title="Configurer le MFA" />
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                Le second facteur est <strong className="text-white">obligatoire</strong>. Scannez ce QR code avec
                Microsoft Authenticator (ou Google Authenticator), puis saisissez le code à 6 chiffres généré.
              </p>
              <div className="flex justify-center mb-3">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="QR code MFA" className="rounded-xl border border-white/[0.08]" width={200} height={200} />
                  : <div className="w-[200px] h-[200px] rounded-xl bg-[#0A0C10] border border-white/[0.08] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#94A3B8]" /></div>}
              </div>
              {/* Saisie manuelle de secours si le QR ne peut pas être scanné */}
              <div className="mb-4">
                <p className="text-xs text-[#94A3B8]/60 font-mono mb-1 text-center">Saisie manuelle :</p>
                <button type="button" onClick={copySecret}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0A0C10] border border-white/[0.08] text-[#F7931A] font-mono text-xs break-all hover:border-[#F7931A]/40 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                  {secret}
                </button>
              </div>
              <Label>Code de vérification</Label>
              <InputWithIcon icon={KeyRound} value={code} onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus placeholder="123456" mono />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn busy={busy} disabled={code.length !== 6}>Activer et se connecter</SubmitBtn>
            </form>
          )}

          {/* ── Phase 2b : saisie du code (logins suivants) ── */}
          {phase === 'code' && (
            <form onSubmit={submitCode}>
              <Header icon={KeyRound} title="Vérification en deux étapes" />
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                Saisissez le code à 6 chiffres de votre application d'authentification, ou un code de secours.
              </p>
              <Label>Code</Label>
              <InputWithIcon icon={KeyRound} value={code} onChange={setCode} autoFocus placeholder="123456 ou code de secours" mono />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn busy={busy} disabled={!code}>Se connecter</SubmitBtn>
            </form>
          )}

          {/* ── Phase 3 : codes de secours (affichés une seule fois) ── */}
          {phase === 'backup' && (
            <div>
              <Header icon={KeyRound} title="Codes de secours" />
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                Conservez ces codes en lieu sûr. Chacun fonctionne <strong className="text-white">une seule fois</strong>
                {' '}si vous perdez votre téléphone. Ils ne seront <strong className="text-white">plus jamais affichés</strong>.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {backupCodes.map((bc, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg bg-[#0A0C10] border border-white/[0.08] text-[#FFD600] font-mono text-sm text-center">{bc}</div>
                ))}
              </div>
              <button type="button" onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}
                className="w-full flex items-center justify-center gap-2 mb-3 py-2 text-xs font-mono rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] border border-white/[0.08] transition-all">
                <Copy className="w-3.5 h-3.5" /> Copier tous les codes
              </button>
              <SubmitBtn busy={false} disabled={false} onClick={() => (mustChange ? setPhase('mustchange') : onSuccess())}>J'ai sauvegardé mes codes — Continuer</SubmitBtn>
            </div>
          )}

          {/* ── Phase 4 : changement de mot de passe imposé ── */}
          {phase === 'mustchange' && (
            <form onSubmit={submitNewPassword}>
              <Header icon={Lock} title="Changement de mot de passe requis" />
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                Votre mot de passe a été défini par un administrateur. Choisissez-en un nouveau (au moins 10 caractères) pour continuer.
              </p>
              <Label>Nouveau mot de passe</Label>
              <InputWithIcon icon={Lock} type="password" value={newPw} onChange={setNewPw} autoFocus placeholder="••••••••••••" />
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <SubmitBtn busy={busy} disabled={newPw.length < 10}>Définir et continuer</SubmitBtn>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[#94A3B8]/30 mt-6 font-mono">SafeDock v1.0.0</p>
      </div>
    </div>
  );
}

/* ── petits composants UI ── */
function Header({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-4 mb-4 border-b border-white/[0.06]">
      <Icon className="w-5 h-5 text-[#F7931A]" />
      <h2 className="font-heading text-base font-semibold text-white">{title}</h2>
    </div>
  );
}
function Label({ children }) {
  return <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">{children}</label>;
}
function ErrorMsg({ children }) {
  return <p className="mt-3 text-sm text-red-400 font-mono">{children}</p>;
}
function InputWithIcon({ icon: Icon, type = 'text', value, onChange, placeholder, autoFocus, inputMode, mono }) {
  return (
    <div className="relative mt-1.5">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]/40 pointer-events-none" />
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        autoFocus={autoFocus} inputMode={inputMode}
        className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors ${mono ? 'font-mono tracking-widest' : 'font-mono'}`}
      />
    </div>
  );
}
function SubmitBtn({ busy, disabled, children, onClick }) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={busy || disabled}
      className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-mono font-semibold text-sm bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
      {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Veuillez patienter…</> : children}
    </button>
  );
}

function SafeDockLogo({ size = 56 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 3L33 9V21C33 29 20 35 20 35C20 35 7 29 7 21V9Z" stroke="url(#lg1)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M20 12L27 15L20 18L13 15Z" fill="url(#lg2)" opacity="0.9" />
      <path d="M13 15L20 18V26L13 23Z" fill="#EA580C" opacity="0.75" />
      <path d="M20 18L27 15V23L20 26Z" fill="#F7931A" />
      <defs>
        <linearGradient id="lg1" x1="7" y1="3" x2="33" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7931A" /><stop offset="1" stopColor="#FFD600" />
        </linearGradient>
        <linearGradient id="lg2" x1="13" y1="12" x2="27" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD600" /><stop offset="1" stopColor="#F7931A" />
        </linearGradient>
      </defs>
    </svg>
  );
}
