import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Bug, ListChecks, RefreshCw, RotateCw, Settings2,
  CheckCircle2, XCircle, ShieldCheck, Tag, X, Search, ChevronUp, ChevronDown, TrendingUp, TriangleAlert
} from 'lucide-react';
import { cn, gradeColor, gradeBg } from '../lib/utils';

const SEV_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

const SEV_BADGE = {
  CRITICAL: 'bg-red-500/15 text-red-400 border border-red-500/20',
  HIGH:     'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20',
  MEDIUM:   'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  LOW:      'bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20',
};

export default function ContainerDetailView({
  containerId, containers, overrides,
  onSaveOverride, onDeleteOverride,
  onTriggerRollout, isRolloutLoading, rolloutStatusMsg,
  onNavigate, isAdmin = false, allTags = [], onAssignTag
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

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [ovrScanner, setOvrScanner] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const [newTagInput, setNewTagInput] = useState('');

  const hostParam = container && container.host_id ? `&host=${container.host_id}` : '';

  const fetchTrivy = () => {
    if (!containerId) return;
    setTrivyLoading(true); setTrivyError('');
    fetch(`/api/containers/${containerId}/trivy?scanner=${ovrScanner}${hostParam}`)
      .then(res => { if (!res.ok) throw new Error('Erreur de scan'); return res.json(); })
      .then(data => setTrivyReport(data))
      .catch(err => setTrivyError(err.message))
      .finally(() => setTrivyLoading(false));
  };

  const fetchDockle = () => {
    if (!containerId) return;
    setDockleLoading(true); setDockleError('');
    fetch(`/api/containers/${containerId}/dockle?host=${container && container.host_id ? container.host_id : ''}`)
      .then(res => { if (!res.ok) throw new Error('Erreur Dockle'); return res.json(); })
      .then(data => setDockleReport(data))
      .catch(err => setDockleError(err.message))
      .finally(() => setDockleLoading(false));
  };

  const fetchHistory = () => {
    if (!container) return;
    setHistoryLoading(true);
    const q = `name=${encodeURIComponent(container.name)}${container.host_id ? `&host=${container.host_id}` : ''}`;
    fetch(`/api/containers/history?${q}`)
      .then(res => { if (!res.ok) throw new Error('Erreur historique'); return res.json(); })
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (container) { fetchTrivy(); fetchDockle(); fetchHistory(); }
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
      <div className="flex flex-col items-center gap-3 pt-24 text-[#94A3B8]">
        <p className="text-sm font-mono">Conteneur non sélectionné.</p>
        <button type="button" onClick={() => onNavigate('containers')} className="text-xs text-[#F7931A] hover:underline font-mono">
          Retour aux conteneurs
        </button>
      </div>
    );
  }

  const activeTags = container.tags || [];
  const hasOverride = !!overrides[container.name];

  // Bascule l'association d'un tag (admin uniquement) via l'API réelle.
  const toggleTag = (tag) => {
    if (!onAssignTag) return;
    const action = activeTags.includes(tag.name) ? 'unassign' : 'assign';
    onAssignTag(action, tag.id, container.host_id, container.name);
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
    onSaveOverride(
      container.name,
      ovrSeverity,
      ovrAllowRoot === '' ? null : ovrAllowRoot === 'true',
      ovrAllowPrivilege === '' ? null : ovrAllowPrivilege === 'true',
      ovrScanner
    )
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

  const inputClass = "px-3 py-1.5 text-xs rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono";
  const selectClass = cn(inputClass, "w-full cursor-pointer");

  const TABS = [
    { id: 'trivy',     label: 'Failles CVE',       icon: Bug },
    { id: 'trend',     label: 'Tendance',          icon: TrendingUp },
    { id: 'dockle',    label: 'Conformité Dockle', icon: ListChecks },
    { id: 'lifecycle', label: 'Mise à jour',        icon: RotateCw },
    { id: 'overrides', label: 'Paramètres',        icon: Settings2 },
  ];

  const RuleRow = ({ label, pass, pts, tip }) => (
    <div className="pb-3 mb-3 border-b border-white/[0.03] last:border-0 last:pb-0 last:mb-0">
      <div className={cn('flex justify-between text-xs font-semibold mb-0.5', pass ? 'text-emerald-400' : 'text-red-400')}>
        <span>{label}</span>
        <span>{pass ? `+${pts} pts` : `-${pts} pts`}</span>
      </div>
      <p className="text-xs text-[#94A3B8]/50 leading-relaxed">{tip}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate('containers')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#94A3B8] hover:text-white rounded-xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors font-mono"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div>
          <p className="font-heading text-sm font-semibold text-white">Cockpit de Sécurité</p>
          <p className="font-mono text-xs text-[#94A3B8]">Hôte : {container.host_name}</p>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr' }}>
        {/* Left panel */}
        <div className="space-y-3">
          {/* Score card */}
          <div className="card p-4 text-center hover:border-[#F7931A]/20 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.15)] transition-all duration-300">
            <div className={cn('w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-extrabold font-heading mx-auto mb-2', gradeColor(container.score), gradeBg(container.score))}>
              {container.grade}
            </div>
            <h3 className="font-heading text-sm font-bold text-white mb-0.5">{container.name}</h3>
            <p className="font-mono text-xs text-[#94A3B8] break-all mb-2">{container.image_name}:{container.image_tag}</p>
            <div className="flex flex-wrap gap-1 justify-center mb-3">
              {activeTags.map((t, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-white/[0.05] text-[#94A3B8] border border-white/[0.08]">{t}</span>
              ))}
            </div>
            <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
              {[
                ['Digest',     container.tag_pinned],
                ['Non-Root',   container.non_root],
                ['Privilèges', container.privileged_safe],
                ['Secrets',    !container.secret_leaks || container.secret_leaks.length === 0],
              ].map(([label, ok]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[#94A3B8]">{label} :</span>
                  <span className={cn('flex items-center gap-1 font-semibold text-xs', ok ? 'text-emerald-400' : 'text-red-400')}>
                    {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {ok ? 'Conforme' : 'Défaut'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score breakdown */}
          <div className="card p-3">
            <p className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest mb-2">
              Détail du Score : {container.score}/100
            </p>
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
              label="Absence de secrets fuités"
              pass={!container.secret_leaks || container.secret_leaks.length === 0} pts={20}
              tip={(!container.secret_leaks || container.secret_leaks.length === 0)
                ? 'Aucun secret détecté.'
                : `⚠ ${container.secret_leaks.length} secret(s). Utilisez Docker Secrets.`}
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
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                  tab === id
                    ? 'bg-[#F7931A]/10 text-[#F7931A]'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
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
                <p className="font-heading text-xs font-semibold text-white">Analyse des Failles CVE (Trivy / Grype)</p>
                <div className="flex items-center gap-2">
                  {trivyReport?.vulnerabilities?.[0]?.scanner && (
                    <span className="font-mono text-xs text-[#94A3B8]">
                      Moteur : <span className="text-[#F7931A] font-semibold">{trivyReport.vulnerabilities[0].scanner}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={fetchTrivy}
                    disabled={trivyLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] transition-colors font-mono"
                  >
                    <RefreshCw className={cn('w-3 h-3', trivyLoading && 'animate-spin')} /> Scanner
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#94A3B8]/40 pointer-events-none" />
                  <input
                    className={cn(inputClass, 'pl-7 w-full')}
                    placeholder="CVE, paquet, description..."
                    value={cveSearch}
                    onChange={e => setCveSearch(e.target.value)}
                  />
                </div>
                <select
                  value={cveFilter}
                  onChange={e => setCveFilter(e.target.value)}
                  className={cn(inputClass, 'cursor-pointer w-36')}
                >
                  <option value="ALL">Toutes gravités</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              {trivyLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-[#94A3B8]">
                  <div className="w-6 h-6 rounded-full border-2 border-white/[0.08] border-t-[#F7931A] animate-spin" />
                  <p className="text-xs font-mono">Scan en cours...</p>
                </div>
              ) : trivyError ? (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-xs text-red-400 font-mono">{trivyError}</div>
              ) : filteredCVEs.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-[#94A3B8]">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="font-heading text-sm font-semibold text-emerald-400">Aucune faille détectée</p>
                  <p className="text-xs font-mono">Aucune vulnérabilité ne correspond aux critères.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#0A0C10]">
                      <tr className="border-b border-white/[0.06]">
                        {[['cve_id', 'CVE ID'], ['severity', 'Sévérité'], ['package_name', 'Paquet']].map(([f, lbl]) => (
                          <th
                            key={f}
                            className="px-3 py-2.5 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSortCVE(f)}
                          >
                            <span className="flex items-center gap-1">
                              {lbl}
                              {cveSortField === f
                                ? (cveSortOrder === 'asc'
                                  ? <ChevronUp className="w-3 h-3 text-[#F7931A]" />
                                  : <ChevronDown className="w-3 h-3 text-[#F7931A]" />)
                                : null}
                            </span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest">Version</th>
                        <th className="px-3 py-2.5 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCVEs.map((v, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-[#F7931A]/[0.02] align-top transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold">
                            {v.url
                              ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[#F7931A] hover:underline">{v.cve_id || v.vulnerability_id}</a>
                              : <span className="text-white">{v.cve_id || v.vulnerability_id}</span>
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('px-1.5 py-0.5 rounded-md text-xs font-bold', SEV_BADGE[v.severity] || 'bg-white/[0.05] text-[#94A3B8]')}>
                              {v.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-heading font-semibold text-white">{v.package_name || v.pkg_name}</td>
                          <td className="px-3 py-2.5 font-mono text-[#94A3B8] text-xs">
                            {v.installed_version}
                            {v.fixed_version && <span className="block text-emerald-400">→ {v.fixed_version}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[#94A3B8] max-w-xs">{v.description || v.title || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: Tendance */}
          {tab === 'trend' && (
            <div>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <p className="font-heading text-xs font-semibold text-white">Évolution des vulnérabilités dans la durée</p>
                <button type="button" onClick={fetchHistory} disabled={historyLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#94A3B8] hover:text-white hover:bg-white/[0.04] transition-colors">
                  <RefreshCw className={cn('w-3.5 h-3.5', historyLoading && 'animate-spin')} /> Rafraîchir
                </button>
              </div>
              <VulnTrendChart points={history} loading={historyLoading} />
            </div>
          )}

          {/* TAB: Dockle */}
          {tab === 'dockle' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-heading text-xs font-semibold text-white">Conformité de l'image (Dockle)</p>
                <button
                  type="button"
                  onClick={fetchDockle}
                  disabled={dockleLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] transition-colors font-mono"
                >
                  <RefreshCw className={cn('w-3 h-3', dockleLoading && 'animate-spin')} /> Scanner
                </button>
              </div>
              {dockleLoading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-[#94A3B8]">
                  <div className="w-6 h-6 rounded-full border-2 border-white/[0.08] border-t-[#F7931A] animate-spin" />
                  <p className="text-xs font-mono">Audit en cours...</p>
                </div>
              ) : dockleError ? (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-xs text-red-400 font-mono">{dockleError}</div>
              ) : !dockleReport?.details?.length ? (
                <div className="py-12 flex flex-col items-center gap-2 text-[#94A3B8]">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                  <p className="font-heading text-sm font-semibold text-emerald-400">Conformité parfaite</p>
                  <p className="text-xs font-mono">Aucun problème de structure ou de sécurité détecté.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dockleReport.details.map((a, i) => (
                    <div key={i} className="p-3 rounded-xl bg-[#0A0C10] border border-white/[0.05] hover:border-[#F7931A]/10 transition-all">
                      <div className="flex items-baseline justify-between mb-1">
                        <code className="font-mono text-xs text-white">{a.code || 'DKL_RULE'}</code>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-md text-xs font-bold',
                          (a.level === 'FATAL' || a.level === 'WARN')
                            ? 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20'
                            : 'bg-white/[0.04] text-[#94A3B8]'
                        )}>
                          {a.level}
                        </span>
                      </div>
                      <p className="font-heading text-xs font-semibold text-white mb-1">{a.title}</p>
                      {a.alerts?.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5">
                          {a.alerts.map((al, j) => <li key={j} className="font-mono text-xs text-[#94A3B8]">{al}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Mise à jour de l'image */}
          {tab === 'lifecycle' && (
            <div className="space-y-3">
              <p className="font-heading text-xs font-semibold text-white mb-1">Mise à jour de l'image Docker</p>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                SafeDock récupère la dernière version de l'image, l'analyse en isolement (SecOps), et ne
                recrée le conteneur sur cette nouvelle image que si les contrôles de sécurité sont validés.
              </p>

              {/* Disclaimer : risque de régression applicative + sauvegardes */}
              <div className="flex gap-2.5 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/25">
                <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300">Attention :</strong> mettre à jour l'image peut introduire
                  des changements incompatibles et <strong className="text-amber-300">casser une application
                  qui fonctionnait</strong> (configuration, schéma de base de données, dépendances…). Avant de
                  lancer une mise à jour, <strong className="text-amber-300">sauvegardez votre conteneur et vos
                  données</strong> (volumes, base de données) afin de pouvoir revenir en arrière si nécessaire.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06] hover:border-[#F7931A]/15 transition-all">
                <div>
                  <p className="text-xs font-semibold text-white">Mettre à jour l'image Docker</p>
                  <p className="font-mono text-xs text-[#94A3B8] mt-0.5">Recherche de la nouvelle version, validation SecOps puis recréation du conteneur.</p>
                </div>
                <button
                  type="button"
                  onClick={() => onTriggerRollout(container.id, container.name)}
                  disabled={isRolloutLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)] disabled:opacity-50"
                >
                  <RotateCw className={cn('w-3.5 h-3.5', isRolloutLoading && 'animate-spin')} />
                  {isRolloutLoading ? 'Mise à jour...' : "Mettre à jour l'image"}
                </button>
              </div>
              {rolloutStatusMsg?.text && (
                <div className={cn(
                  'p-3 rounded-xl text-xs font-semibold border font-mono',
                  rolloutStatusMsg.type === 'error'
                    ? 'border-red-500/30 bg-red-500/5 text-red-400'
                    : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                )}>
                  {rolloutStatusMsg.text}
                </div>
              )}
            </div>
          )}

          {/* TAB: Overrides */}
          {tab === 'overrides' && (
            <div className="space-y-3">
              <p className="font-heading text-xs font-semibold text-white mb-1">Paramètres du conteneur</p>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Seuils de tolérance et configuration du scanner pour ce conteneur.
              </p>

              {/* Tag Manager — association réelle des tags (admin). Restreint la visibilité par portée. */}
              <div className="p-3 rounded-xl bg-[#0A0C10] border border-white/[0.06] space-y-2">
                <p className="font-mono text-xs font-semibold text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#F7931A]" /> Tags du conteneur
                </p>
                {!isAdmin ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeTags.length === 0
                      ? <p className="font-mono text-xs text-[#94A3B8]/40 italic">Aucun tag associé.</p>
                      : activeTags.map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded-md bg-[#F7931A]/10 text-[#F7931A] border border-[#F7931A]/20 text-xs font-semibold font-mono">{t}</span>
                      ))}
                  </div>
                ) : (
                  <>
                    <p className="font-mono text-xs text-[#94A3B8]/50">Cliquez pour associer/dissocier un tag :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.length === 0
                        ? <p className="font-mono text-xs text-[#94A3B8]/40 italic">Aucun tag défini. Créez-en dans « Utilisateurs ».</p>
                        : allTags.map(t => {
                          const on = activeTags.includes(t.name);
                          return (
                            <button key={t.id} type="button" onClick={() => toggleTag(t)}
                              className={cn('px-2 py-0.5 rounded-md text-xs font-semibold font-mono border transition-colors',
                                on ? 'bg-[#F7931A]/15 text-[#F7931A] border-[#F7931A]/30' : 'bg-white/[0.04] text-[#94A3B8] border-white/[0.08] hover:text-white')}>
                              {on ? '✓ ' : '+ '}{t.name}
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>

              {[
                { label: "Moteur d'analyse CVE", value: ovrScanner, onChange: setOvrScanner, options: [
                  { v: '',       l: 'Hériter des paramètres globaux' },
                  { v: 'trivy',  l: 'Trivy (Aqua Security)' },
                  { v: 'grype',  l: 'Grype (Anchore Engine)' },
                  { v: 'hybrid', l: 'Double Scan Hybride (Trivy + Grype)' },
                ]},
                { label: 'Tolérance de sévérité CVE', value: ovrSeverity, onChange: setOvrSeverity, options: [
                  { v: '',         l: 'Hériter des règles globales' },
                  { v: 'CRITICAL', l: 'CRITICAL' },
                  { v: 'HIGH',     l: 'HIGH' },
                  { v: 'MEDIUM',   l: 'MEDIUM' },
                  { v: 'LOW',      l: 'LOW' },
                  { v: 'NONE',     l: 'NONE' },
                ]},
                { label: "Autoriser l'utilisateur root", value: ovrAllowRoot, onChange: setOvrAllowRoot, options: [
                  { v: '',      l: 'Hériter des règles globales' },
                  { v: 'true',  l: 'Autorisé' },
                  { v: 'false', l: 'Interdit' },
                ]},
                { label: 'Autoriser le mode privilégié', value: ovrAllowPrivilege, onChange: setOvrAllowPrivilege, options: [
                  { v: '',      l: 'Hériter des règles globales' },
                  { v: 'true',  l: 'Autorisé' },
                  { v: 'false', l: 'Interdit' },
                ]},
              ].map(({ label, value, onChange, options }) => (
                <div key={label} className="space-y-1">
                  <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">{label}</label>
                  <select value={value} onChange={e => onChange(e.target.value)} className={selectClass}>
                    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                {saveStatus && <p className="text-xs text-emerald-400 mr-auto font-mono">{saveStatus}</p>}
                {hasOverride && (
                  <button
                    type="button"
                    onClick={handleDeleteOverride}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl text-red-400 hover:bg-red-400/10 border border-red-400/20 transition-colors"
                  >
                    Supprimer
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveOverride}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
                >
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

// VulnTrendChart trace l'évolution des CVE (par sévérité) dans le temps, en SVG pur
// (aucune dépendance de graphe). Les points sont fournis en ordre chronologique croissant.
function VulnTrendChart({ points = [], loading = false }) {
  if (loading && points.length === 0) {
    return <p className="text-sm text-[#94A3B8] font-mono py-10 text-center">Chargement de l'historique…</p>;
  }
  if (!points || points.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-[#94A3B8] font-mono">Aucun historique pour l'instant.</p>
        <p className="text-xs text-[#94A3B8]/60 font-mono mt-1">
          Un point est enregistré à chaque scan ; la supervision re-scanne automatiquement toutes les 24 h.
        </p>
      </div>
    );
  }

  const SERIES = [
    { key: 'critical', label: 'Critiques', color: '#ef4444' },
    { key: 'high',     label: 'Élevées',   color: '#F7931A' },
    { key: 'medium',   label: 'Moyennes',  color: '#f59e0b' },
    { key: 'low',      label: 'Faibles',   color: '#FFD600' },
  ];

  const W = 640, H = 210, padL = 34, padR = 14, padT = 14, padB = 30;
  const n = points.length;
  const maxVal = Math.max(1, ...points.flatMap(p => [p.critical, p.high, p.medium, p.low]));
  const px = (i) => n === 1 ? padL + (W - padL - padR) / 2 : padL + (i * (W - padL - padR)) / (n - 1);
  const py = (v) => padT + (H - padT - padB) * (1 - v / maxVal);
  const path = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p[key]).toFixed(1)}`).join(' ');

  const ticks = 4;
  const fmtDate = (s) => {
    if (!s) return '';
    try {
      const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch { return s; }
  };
  const latest = points[n - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 230 }} preserveAspectRatio="xMidYMid meet">
        {/* Grille horizontale + graduations Y */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = Math.round((maxVal * (ticks - i)) / ticks);
          const yy = py(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94A3B8" fontFamily="monospace">{v}</text>
            </g>
          );
        })}
        {/* Graduations X : début / milieu / fin */}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, idx, a) => a.indexOf(v) === idx).map((i) => (
          <text key={i} x={px(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="monospace">
            {fmtDate(points[i].scanned_at)}
          </text>
        ))}
        {/* Séries */}
        {SERIES.map(s => (
          <g key={s.key}>
            <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {n <= 40 && points.map((p, i) => (
              <circle key={i} cx={px(i)} cy={py(p[s.key])} r="2.5" fill={s.color} />
            ))}
          </g>
        ))}
      </svg>

      {/* Légende + dernières valeurs */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {SERIES.map(s => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs font-mono text-[#94A3B8]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} : <span className="text-white font-semibold">{latest[s.key]}</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-[#94A3B8]/60 font-mono mt-2">
        {n} point{n > 1 ? 's' : ''} — du {fmtDate(points[0].scanned_at)} au {fmtDate(latest.scanned_at)}
        {latest.scanner ? ` · moteur ${latest.scanner}` : ''}
      </p>
    </div>
  );
}
