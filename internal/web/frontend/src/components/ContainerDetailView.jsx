import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Bug, ListChecks, RefreshCw, RotateCw, Settings2,
  CheckCircle2, XCircle, ShieldCheck, Tag, X, Search, ChevronUp, ChevronDown
} from 'lucide-react';
import { cn, gradeColor, gradeBg } from '../lib/utils';

const SEV_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

const SEV_BADGE = {
  CRITICAL: 'bg-red-500/15 text-red-400',
  HIGH:     'bg-orange-500/15 text-orange-400',
  MEDIUM:   'bg-amber-500/15 text-amber-400',
  LOW:      'bg-blue-500/15 text-blue-400',
};

export default function ContainerDetailView({
  containerId, containers, overrides,
  onSaveOverride, onDeleteOverride,
  onTriggerRollout, isRolloutLoading, rolloutStatusMsg,
  onNavigate, containerTags = {}, onUpdateTags
}) {
  const container = containers.find(c => c.id === containerId);
  const [tab, setTab] = useState('trivy');

  const [trivyReport, setTrivyReport] = useState(null);
  const [trivyLoading, setTrivyLoading] = useState(false);
  const [trivyError, setTrivyError] = useState('');
  const [cveSearch, setCveSearch] = useState('');
  const [cveFilter, setCveFilter] = useState('ALL');
  const [cveSortField, setCveSortField] = useState('severity');
  const [cveSortOrder, setCveSortOrder] = useState('desc');

  const [dockleReport, setDockleReport] = useState(null);
  const [dockleLoading, setDockleLoading] = useState(false);
  const [dockleError, setDockleError] = useState('');

  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [ovrScanner, setOvrScanner] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const [newTagInput, setNewTagInput] = useState('');

  const fetchTrivy = () => {
    if (!containerId) return;
    setTrivyLoading(true); setTrivyError('');
    fetch(`/api/containers/${containerId}/trivy?scanner=${ovrScanner}`)
      .then(res => { if (!res.ok) throw new Error('Erreur de scan'); return res.json(); })
      .then(data => setTrivyReport(data))
      .catch(err => setTrivyError(err.message))
      .finally(() => setTrivyLoading(false));
  };

  const fetchDockle = () => {
    if (!containerId) return;
    setDockleLoading(true); setDockleError('');
    fetch(`/api/containers/${containerId}/dockle`)
      .then(res => { if (!res.ok) throw new Error('Erreur Dockle'); return res.json(); })
      .then(data => setDockleReport(data))
      .catch(err => setDockleError(err.message))
      .finally(() => setDockleLoading(false));
  };

  useEffect(() => {
    if (container) { fetchTrivy(); fetchDockle(); }
  }, [containerId]);

  useEffect(() => {
    if (!container) return;
    const ovr = overrides[container.name];
    if (ovr) {
      setOvrSeverity(ovr.secops_max_severity_allowed || '');
      setOvrAllowRoot(ovr.secops_allow_root === null ? '' : String(ovr.secops_allow_root));
      setOvrAllowPrivilege(ovr.secops_allow_privileged === null ? '' : String(ovr.secops_allow_privileged));
      setOvrScanner(ovr.secops_scanner || '');
    } else {
      setOvrSeverity(''); setOvrAllowRoot(''); setOvrAllowPrivilege(''); setOvrScanner('');
    }
  }, [overrides, container]);

  if (!container) {
    return (
      <div className="flex flex-col items-center gap-3 pt-24 text-zinc-500">
        <p className="text-sm">Conteneur non sélectionné.</p>
        <button type="button" onClick={() => onNavigate('containers')} className="text-xs text-blue-400 hover:underline">
          Retour aux conteneurs
        </button>
      </div>
    );
  }

  const activeTags = containerTags[container.name] || container.tags || [];
  const hasOverride = !!overrides[container.name];

  const handleAddTag = (e) => {
    e.preventDefault();
    const t = newTagInput.trim();
    if (t && !activeTags.includes(t)) onUpdateTags(container.name, [...activeTags, t]);
    setNewTagInput('');
  };

  const handleSortCVE = (field) => {
    if (cveSortField === field) setCveSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setCveSortField(field); setCveSortOrder('desc'); }
  };

  const filteredCVEs = (() => {
    let list = (trivyReport?.vulnerabilities) || [];
    if (cveSearch) {
      const t = cveSearch.toLowerCase();
      list = list.filter(v =>
        (v.cve_id || '').toLowerCase().includes(t) ||
        (v.package_name || '').toLowerCase().includes(t) ||
        (v.description || '').toLowerCase().includes(t)
      );
    }
    if (cveFilter !== 'ALL') list = list.filter(v => v.severity === cveFilter);
    return [...list].sort((a, b) => {
      if (cveSortField === 'severity') {
        const diff = (SEV_WEIGHT[a.severity] || 0) - (SEV_WEIGHT[b.severity] || 0);
        return cveSortOrder === 'asc' ? diff : -diff;
      }
      const av = (a[cveSortField] || '').toString().toLowerCase();
      const bv = (b[cveSortField] || '').toString().toLowerCase();
      if (av < bv) return cveSortOrder === 'asc' ? -1 : 1;
      if (av > bv) return cveSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  })();

  const handleSaveOverride = () => {
    setSaveStatus('Enregistrement...');
    onSaveOverride(container.name, ovrSeverity, ovrAllowRoot === '' ? null : ovrAllowRoot === 'true', ovrAllowPrivilege === '' ? null : ovrAllowPrivilege === 'true', ovrScanner)
      .then(() => { setSaveStatus('Paramètres sauvegardés.'); setTimeout(() => setSaveStatus(''), 4000); fetchTrivy(); })
      .catch(() => { setSaveStatus('Erreur.'); setTimeout(() => setSaveStatus(''), 4000); });
  };

  const handleDeleteOverride = () => {
    setSaveStatus('Suppression...');
    onDeleteOverride(container.name)
      .then(() => {
        setOvrSeverity(''); setOvrAllowRoot(''); setOvrAllowPrivilege(''); setOvrScanner('');
        setSaveStatus('Surcharge supprimée.'); setTimeout(() => setSaveStatus(''), 4000); fetchTrivy();
      })
      .catch(() => { setSaveStatus('Erreur.'); setTimeout(() => setSaveStatus(''), 4000); });
  };

  const inputClass = "px-3 py-1.5 text-xs rounded-lg bg-[#0d1120] border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors";
  const selectClass = cn(inputClass, "w-full cursor-pointer");

  const TABS = [
    { id: 'trivy',     label: 'Failles CVE',         icon: Bug },
    { id: 'dockle',    label: 'Conformité Dockle',   icon: ListChecks },
    { id: 'lifecycle', label: 'Déploiement',         icon: RotateCw },
    { id: 'overrides', label: 'Paramètres',          icon: Settings2 },
  ];

  const RuleRow = ({ label, pass, pts, tip }) => (
    <div className="pb-3 mb-3 border-b border-white/[0.03] last:border-0 last:pb-0 last:mb-0">
      <div className={cn('flex justify-between text-xs font-semibold mb-0.5', pass ? 'text-emerald-400' : 'text-red-400')}>
        <span>{label}</span>
        <span>{pass ? `+${pts} pts` : `-${pts} pts`}</span>
      </div>
      <p className="text-[10px] text-zinc-600 leading-relaxed">{tip}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onNavigate('containers')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div>
          <p className="text-sm font-semibold text-zinc-100">Cockpit de Sécurité</p>
          <p className="text-[11px] text-zinc-500">Hôte : {container.host_name}</p>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr' }}>
        {/* Left panel */}
        <div className="space-y-3">
          {/* Score card */}
          <div className="card p-4 text-center">
            <div className={cn('w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-extrabold mx-auto mb-2', gradeColor(container.score), gradeBg(container.score))}>
              {container.grade}
            </div>
            <h3 className="text-sm font-bold text-zinc-100 mb-0.5">{container.name}</h3>
            <p className="text-[10px] font-mono text-zinc-500 break-all mb-2">{container.image_name}:{container.image_tag}</p>
            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {activeTags.map((t, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-zinc-400">{t}</span>
              ))}
            </div>
            <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
              {[
                ['Digest', container.tag_pinned],
                ['Non-Root', container.non_root],
                ['Privilèges', container.privileged_safe],
                ['Secrets', !container.secret_leaks || container.secret_leaks.length === 0],
              ].map(([label, ok]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-zinc-500">{label} :</span>
                  <span className={cn('flex items-center gap-1 font-semibold text-[10px]', ok ? 'text-emerald-400' : 'text-red-400')}>
                    {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {ok ? 'Conforme' : 'Défaut'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score breakdown */}
          <div className="card p-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-2">Détail du Score : {container.score}/100</p>
            <RuleRow
              label="Tag Pinned (SHA256)" pass={container.tag_pinned} pts={25}
              tip={container.tag_pinned ? 'Image verrouillée par hash cryptographique.' : '⚠ Utilisez le digest @sha256:...'}
            />
            <RuleRow
              label="Utilisateur Non-Root" pass={container.non_root} pts={25}
              tip={container.non_root ? 'Privilèges UID réduits.' : '⚠ Ajoutez USER 1000 dans le Dockerfile.'}
            />
            <RuleRow
              label="Mode Privilégié Restreint" pass={container.privileged_safe} pts={30}
              tip={container.privileged_safe ? 'Pas d\'accès au noyau hôte.' : '⚠ Lancez sans --privileged.'}
            />
            <RuleRow
              label="Absence de secrets fuités" pass={!container.secret_leaks || container.secret_leaks.length === 0} pts={20}
              tip={(!container.secret_leaks || container.secret_leaks.length === 0) ? 'Aucun secret détecté.' : `⚠ ${container.secret_leaks.length} secret(s). Utilisez Docker Secrets.`}
            />
          </div>
        </div>

        {/* Right panel: Tabs */}
        <div className="card p-4">
          {/* Tab selector */}
          <div className="flex gap-1 border-b border-white/[0.06] pb-3 mb-4">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === id ? 'bg-brand-DEFAULT/15 text-brand-DEFAULT' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* TAB: CVEs */}
          {tab === 'trivy' && (
            <div>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <p className="text-xs font-semibold text-zinc-100">Analyse des Failles CVE (Trivy / Grype)</p>
                <div className="flex items-center gap-2">
                  {trivyReport?.vulnerabilities?.[0]?.scanner && (
                    <span className="text-[10px] text-zinc-500">Moteur : <span className="text-blue-400 font-semibold">{trivyReport.vulnerabilities[0].scanner}</span></span>
                  )}
                  <button type="button" onClick={fetchTrivy} disabled={trivyLoading} className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors">
                    <RefreshCw className={cn('w-3 h-3', trivyLoading && 'animate-spin')} /> Scanner
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
                  <input className={cn(inputClass, 'pl-7 w-full')} placeholder="CVE, paquet, description..." value={cveSearch} onChange={e => setCveSearch(e.target.value)} />
                </div>
                <select value={cveFilter} onChange={e => setCveFilter(e.target.value)} className={cn(inputClass, 'cursor-pointer w-36')}>
                  <option value="ALL">Toutes gravités</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
              {trivyLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin" />
                  <p className="text-xs">Scan en cours...</p>
                </div>
              ) : trivyError ? (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">{trivyError}</div>
              ) : filteredCVEs.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-zinc-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-400">Aucune faille détectée</p>
                  <p className="text-xs">Aucune vulnérabilité ne correspond aux critères.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#151d2e]">
                      <tr className="border-b border-white/[0.06]">
                        {[['cve_id','CVE ID'], ['severity','Sévérité'], ['package_name','Paquet']].map(([f, lbl]) => (
                          <th key={f} className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSortCVE(f)}>
                            <span className="flex items-center gap-1">
                              {lbl}
                              {cveSortField === f ? (cveSortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-400" /> : <ChevronDown className="w-3 h-3 text-blue-400" />) : null}
                            </span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Version</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCVEs.map((v, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] align-top">
                          <td className="px-3 py-2.5 font-mono font-bold">
                            {v.url
                              ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{v.cve_id || v.vulnerability_id}</a>
                              : <span className="text-zinc-300">{v.cve_id || v.vulnerability_id}</span>
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', SEV_BADGE[v.severity] || 'bg-zinc-500/10 text-zinc-400')}>
                              {v.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-zinc-200">{v.package_name || v.pkg_name}</td>
                          <td className="px-3 py-2.5 font-mono text-zinc-500 text-[10px]">
                            {v.installed_version}
                            {v.fixed_version && <span className="block text-emerald-400">→ {v.fixed_version}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-500 max-w-xs">{v.description || v.title || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: Dockle */}
          {tab === 'dockle' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-100">Conformité de l'image (Dockle)</p>
                <button type="button" onClick={fetchDockle} disabled={dockleLoading} className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors">
                  <RefreshCw className={cn('w-3 h-3', dockleLoading && 'animate-spin')} /> Scanner
                </button>
              </div>
              {dockleLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-zinc-500">
                  <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin" />
                  <p className="text-xs">Audit en cours...</p>
                </div>
              ) : dockleError ? (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">{dockleError}</div>
              ) : !dockleReport?.details?.length ? (
                <div className="py-12 flex flex-col items-center gap-2 text-zinc-500">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-400">Conformité parfaite</p>
                  <p className="text-xs">Aucun problème de structure ou de sécurité détecté.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dockleReport.details.map((a, i) => (
                    <div key={i} className="p-3 rounded-lg bg-[#0d1120] border border-white/[0.05]">
                      <div className="flex items-baseline justify-between mb-1">
                        <code className="text-[11px] text-zinc-300">{a.code || 'DKL_RULE'}</code>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', (a.level === 'FATAL' || a.level === 'WARN') ? 'bg-orange-500/15 text-orange-400' : 'bg-white/[0.04] text-zinc-500')}>
                          {a.level}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-200 mb-1">{a.title}</p>
                      {a.alerts?.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5">
                          {a.alerts.map((al, j) => <li key={j} className="text-[10px] text-zinc-500 font-mono">{al}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Lifecycle */}
          {tab === 'lifecycle' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-100 mb-1">Opérations de déploiement</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Le pivotement de cycle de vie remplace le conteneur par sa dernière version saine validée. Opération transactionnelle sans coupure visible.
              </p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d1120] border border-white/[0.06]">
                <div>
                  <p className="text-xs font-semibold text-zinc-100">Déclencher le pivot (Rollout)</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Recherche, validation SecOps et recréation du conteneur.</p>
                </div>
                <button
                  type="button"
                  onClick={() => onTriggerRollout(container.id, container.name)}
                  disabled={isRolloutLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <RotateCw className={cn('w-3.5 h-3.5', isRolloutLoading && 'animate-spin')} />
                  {isRolloutLoading ? 'En cours...' : 'Lancer le Pivot'}
                </button>
              </div>
              {rolloutStatusMsg?.text && (
                <div className={cn('p-3 rounded-lg text-xs font-semibold border', rolloutStatusMsg.type === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-400' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400')}>
                  {rolloutStatusMsg.text}
                </div>
              )}
            </div>
          )}

          {/* TAB: Overrides */}
          {tab === 'overrides' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-100 mb-1">Paramètres du conteneur</p>
              <p className="text-xs text-zinc-500 leading-relaxed">Seuils de tolérance et configuration du scanner pour ce conteneur.</p>

              {/* Tag Manager */}
              <div className="p-3 rounded-lg bg-[#0d1120] border border-white/[0.06] space-y-2">
                <p className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-400" /> Gestion des Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeTags.length === 0
                    ? <p className="text-[10px] text-zinc-600 italic">Aucun tag associé.</p>
                    : activeTags.map((t, i) => (
                      <span key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold">
                        {t}
                        <button type="button" onClick={() => onUpdateTags(container.name, activeTags.filter(x => x !== t))}>
                          <X className="w-2.5 h-2.5 hover:text-red-400" />
                        </button>
                      </span>
                    ))
                  }
                </div>
                <form onSubmit={handleAddTag} className="flex gap-2">
                  <input className={cn(inputClass, 'flex-1')} placeholder="Nouveau tag..." value={newTagInput} onChange={e => setNewTagInput(e.target.value)} />
                  <button type="submit" className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09] transition-colors">Ajouter</button>
                </form>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Moteur d'analyse CVE</label>
                <select value={ovrScanner} onChange={e => setOvrScanner(e.target.value)} className={selectClass}>
                  <option value="">Hériter des paramètres globaux</option>
                  <option value="trivy">Trivy (Aqua Security)</option>
                  <option value="grype">Grype (Anchore Engine)</option>
                  <option value="hybrid">Double Scan Hybride (Trivy + Grype)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Tolérance de sévérité CVE</label>
                <select value={ovrSeverity} onChange={e => setOvrSeverity(e.target.value)} className={selectClass}>
                  <option value="">Hériter des règles globales</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                  <option value="NONE">NONE</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Autoriser l'utilisateur root</label>
                <select value={ovrAllowRoot} onChange={e => setOvrAllowRoot(e.target.value)} className={selectClass}>
                  <option value="">Hériter des règles globales</option>
                  <option value="true">Autorisé</option>
                  <option value="false">Interdit</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500">Autoriser le mode privilégié</label>
                <select value={ovrAllowPrivilege} onChange={e => setOvrAllowPrivilege(e.target.value)} className={selectClass}>
                  <option value="">Hériter des règles globales</option>
                  <option value="true">Autorisé</option>
                  <option value="false">Interdit</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                {saveStatus && <p className="text-xs text-emerald-400 mr-auto">{saveStatus}</p>}
                {hasOverride && (
                  <button type="button" onClick={handleDeleteOverride} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-400 hover:bg-red-400/10 border border-red-400/20 transition-colors">
                    Supprimer
                  </button>
                )}
                <button type="button" onClick={handleSaveOverride} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors">
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
