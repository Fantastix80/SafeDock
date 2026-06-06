import React, { useState } from 'react';
import {
  Boxes, TriangleAlert, CloudDownload, CheckCircle2, XCircle,
  ArrowRight, RotateCcw, ListChecks, Clock, Zap, ShieldCheck,
  Bug, ShieldAlert, Lock, Tag, FileText
} from 'lucide-react';
import { cn, gradeColor, gradeBg, gradeLabel, gradeStroke } from '../lib/utils';
import { openPostureReport } from '../lib/postureReport';

const CIRCUMFERENCE = 276.46;

// Sévérités d'action — ordre = priorité de tri (0 = plus urgent)
const SEV = {
  CRITIQUE: { rank: 0, badge: 'CRITIQUE', cls: 'bg-red-500/15 text-red-400 border-red-500/25', dot: '#ef4444' },
  ELEVE:    { rank: 1, badge: 'ÉLEVÉ',    cls: 'bg-[#F7931A]/15 text-[#F7931A] border-[#F7931A]/25', dot: '#F7931A' },
  MOYEN:    { rank: 2, badge: 'MOYEN',    cls: 'bg-amber-400/15 text-amber-300 border-amber-400/25', dot: '#fbbf24' },
  MAJ:      { rank: 3, badge: 'MÀJ',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: '#34d399' },
};

export default function DashboardView({ containers, auditLogs, stats, onSelectContainer, onRefreshLogs, onNavigate }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredContainers = containers.filter(c => {
    if (activeFilter === 'secure') return c.score >= 75;
    if (activeFilter === 'warning') return c.score < 75;
    return true;
  });

  const strokeOffset = CIRCUMFERENCE - (stats.globalScore / 100) * CIRCUMFERENCE;
  const stroke = gradeStroke(stats.globalGrade);
  const securePct = stats.total > 0 ? Math.round((stats.secure / stats.total) * 100) : 100;

  const cveCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  containers.forEach(c => {
    cveCounts.critical += c.cve_critical || 0;
    cveCounts.high     += c.cve_high     || 0;
    cveCounts.medium   += c.cve_medium   || 0;
    cveCounts.low      += c.cve_low      || 0;
  });
  const cveTotal = cveCounts.critical + cveCounts.high + cveCounts.medium + cveCounts.low;

  // Actions prioritaires — dérivées des DONNÉES RÉELLES d'audit des conteneurs
  const actions = [];
  containers.forEach(c => {
    if (c.is_privileged)
      actions.push({ ...SEV.CRITIQUE, id: c.id, name: c.name, desc: 'Conteneur lancé en mode privilégié', icon: ShieldAlert });
    if (c.secret_leaks && c.secret_leaks.length > 0)
      actions.push({ ...SEV.CRITIQUE, id: c.id, name: c.name, desc: `${c.secret_leaks.length} secret(s) exposé(s) dans l'image`, icon: Lock });
    if (c.is_root)
      actions.push({ ...SEV.ELEVE, id: c.id, name: c.name, desc: 'Processus exécuté en utilisateur root', icon: ShieldAlert });
    if (!c.tag_pinned)
      actions.push({ ...SEV.MOYEN, id: c.id, name: c.name, desc: 'Image non épinglée (tag mutable)', icon: Tag });
    if (c.update_available)
      actions.push({ ...SEV.MAJ, id: c.id, name: c.name, desc: 'Mise à jour de l\'image disponible', icon: CloudDownload });
  });
  actions.sort((a, b) => a.rank - b.rank);
  const topActions = actions.slice(0, 3);

  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const logStatusStyle = (s) => {
    if (s === 'SUCCESS' || s === 'CLEAN') return 'text-emerald-400';
    if (s === 'BLOCKED') return 'text-red-400';
    return 'text-amber-400';
  };
  const logStatusLabel = (s) => {
    if (s === 'SUCCESS' || s === 'CLEAN') return 'SUCCÈS';
    if (s === 'BLOCKED') return 'BLOQUÉ';
    return 'ÉCHEC';
  };

  return (
    <div className="space-y-5">

      {/* Barre d'actions */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => openPostureReport(containers, stats)}
          title="Générer un rapport de posture imprimable (PDF)"
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] border border-white/[0.08] transition-all font-mono"
        >
          <FileText className="w-3.5 h-3.5" /> Rapport PDF
        </button>
      </div>

      {/* ============ HERO — Posture de sécurité ============ */}
      <div className="card p-6 lg:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8">

          {/* Score gauge + label */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="relative w-[132px] h-[132px] shrink-0">
              <svg className="score-ring w-full h-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" />
                <circle cx="50" cy="50" r="44" style={{ strokeDashoffset: strokeOffset, stroke }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn('font-heading text-4xl font-extrabold leading-none', gradeColor(stats.globalScore))}>
                  {stats.globalGrade}
                </span>
                <span className="text-xs text-[#94A3B8] mt-1 font-mono">{stats.globalScore}/100</span>
              </div>
            </div>

            <div className="min-w-0">
              <p className="font-mono text-xs font-medium text-[#94A3B8] uppercase tracking-widest">Posture globale</p>
              <p className={cn('font-heading text-2xl font-bold mt-1', gradeColor(stats.globalScore))}>
                {gradeLabel(stats.globalGrade)}
              </p>
              <p className="text-sm text-[#94A3B8] mt-0.5">
                <span className="text-white font-semibold">{stats.secure}</span>/{stats.total} conteneurs sains
              </p>
              {/* Posture distribution bar */}
              <div className="mt-3 w-44 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                  style={{ width: `${securePct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px self-stretch bg-white/[0.07]" />

          {/* KPI tiles — intégrées au même panneau (hauteurs cohérentes) */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06] rounded-xl overflow-hidden border border-white/[0.06]">
            <StatTile
              icon={<Boxes className="w-3.5 h-3.5" />} iconClass="text-[#F7931A] bg-[#F7931A]/15"
              label="Conteneurs" value={stats.total} valueClass="text-white"
            />
            <StatTile
              icon={<ShieldCheck className="w-3.5 h-3.5" />} iconClass="text-emerald-400 bg-emerald-400/10"
              label="Sains" value={stats.secure} valueClass="text-emerald-400"
            />
            <StatTile
              icon={<TriangleAlert className="w-3.5 h-3.5" />} iconClass="text-red-400 bg-red-400/10"
              label="Alertes" value={stats.warnings} valueClass={stats.warnings > 0 ? 'text-red-400' : 'text-white'}
            />
            <StatTile
              icon={<CloudDownload className="w-3.5 h-3.5" />} iconClass="text-amber-400 bg-amber-400/10"
              label="Mises à jour" value={stats.updatesAvailable} valueClass={stats.updatesAvailable > 0 ? 'text-amber-400' : 'text-white'}
            />
          </div>
        </div>
      </div>

      {/* ============ CVE + Actions prioritaires ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* CVE — exposition aux vulnérabilités */}
        <div className="card p-6 lg:col-span-2 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-[#F7931A]" />
                <p className="font-heading text-base font-semibold text-white">Exposition aux vulnérabilités</p>
              </div>
              <p className="text-sm text-[#94A3B8] mt-1">Failles CVE cumulées sur l'ensemble du parc audité</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-heading text-2xl font-bold text-white leading-none">{cveTotal}</p>
              <p className="text-xs text-[#94A3B8] font-mono mt-1">CVE détectées</p>
            </div>
          </div>

          {/* Stacked severity bar */}
          <SeverityBar counts={cveCounts} total={cveTotal} />

          {/* Bar chart */}
          <div className="h-[200px] mt-2">
            <CveChart counts={cveCounts} />
          </div>
        </div>

        {/* Actions prioritaires */}
        <div className="card p-6 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
            <Zap className="w-4 h-4 text-[#F7931A]" />
            <p className="font-heading text-base font-semibold text-white">Actions prioritaires</p>
            {topActions.length > 0 && (
              <span className="ml-auto font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/25">
                {actions.length}
              </span>
            )}
          </div>

          {topActions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-400/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-white font-medium">Aucune action requise</p>
              <p className="text-xs text-[#94A3B8]">Tous les conteneurs respectent la politique de sécurité.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 overflow-hidden">
              {topActions.map((a, i) => (
                <ActionRow key={`${a.id}-${i}`} action={a} onClick={() => onSelectContainer(a.id)} />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigate('actions')}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#F7931A] bg-[#F7931A]/10 hover:bg-[#F7931A]/20 border border-[#F7931A]/20 hover:border-[#F7931A]/40 transition-all duration-200"
          >
            Gérer les actions
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============ Container Cards ============ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
            <ListChecks className="w-4 h-4 text-[#94A3B8]" />
            Statuts des conteneurs en cours d'audit
          </div>
          <div className="flex gap-1.5">
            {[
              { id: 'all',     label: 'Tous' },
              { id: 'secure',  label: 'Sains' },
              { id: 'warning', label: 'Alertes' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full font-mono font-medium transition-all duration-200',
                  activeFilter === f.id
                    ? 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/30'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border border-transparent'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {containers.length === 0 ? (
          <div className="card py-16 flex flex-col items-center gap-3 text-[#94A3B8]">
            <div className="w-8 h-8 rounded-full border-2 border-[#94A3B8]/20 border-t-[#F7931A] animate-spin" />
            <p className="text-sm font-mono">Audit en cours...</p>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="card py-16 flex flex-col items-center gap-2 text-[#94A3B8]">
            <Boxes className="w-8 h-8 text-[#94A3B8]/30" />
            <p className="text-sm">Aucun conteneur ne correspond au filtre.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredContainers.map(c => (
              <ContainerCard key={c.id} c={c} onClick={() => onSelectContainer(c.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ============ Audit Logs ============ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
            <Clock className="w-4 h-4 text-[#94A3B8]" />
            Historique d'audit & activités
          </div>
          <button
            type="button"
            onClick={onRefreshLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#94A3B8] hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-mono"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Recharger
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Date', 'Conteneur', 'Image / digest', 'Statut', 'Détails', 'CVEs (C/H/M)'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-10 text-center text-[#94A3B8]/40 font-mono text-xs">
                      Aucun journal d'activité disponible.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[#94A3B8] font-mono whitespace-nowrap">{formatDate(log.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-white">{log.container_name}</td>
                      <td className="px-4 py-3 font-mono text-[#94A3B8]/70">{log.image_ref || '-'}</td>
                      <td className={cn('px-4 py-3 font-mono font-bold text-xs tracking-wider', logStatusStyle(log.status))}>
                        {logStatusLabel(log.status)}
                      </td>
                      <td className="px-4 py-3 text-[#94A3B8] max-w-[200px] truncate">{log.message}</td>
                      <td className="px-4 py-3 text-center font-mono text-[#94A3B8]">
                        {(log.status === 'SUCCESS' || log.status === 'CLEAN')
                          ? <span className="text-[#94A3B8]/30">—</span>
                          : `${log.cve_critical || 0}/${log.cve_high || 0}/${log.cve_medium || 0}`
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatTile({ icon, iconClass, label, value, valueClass }) {
  return (
    <div className="bg-[#0F1115] px-4 py-4 flex flex-col justify-center">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', iconClass)}>
          {icon}
        </span>
        <span className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] truncate">{label}</span>
      </div>
      <p className={cn('font-heading text-3xl font-bold leading-none', valueClass)}>{value}</p>
    </div>
  );
}

function SeverityBar({ counts, total }) {
  const segs = [
    { value: counts.critical, color: '#ef4444' },
    { value: counts.high,     color: '#F7931A' },
    { value: counts.medium,   color: '#fbbf24' },
    { value: counts.low,      color: '#FFD600' },
  ];
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-white/[0.05]">
      {total === 0
        ? <div className="w-full bg-emerald-400/40" />
        : segs.map((s, i) =>
            s.value > 0 ? (
              <div
                key={i}
                className="h-full transition-all duration-500"
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              />
            ) : null
          )
      }
    </div>
  );
}

function ActionRow({ action, onClick }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.03] transition-colors group"
    >
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
        style={{ backgroundColor: `${action.dot}1f`, borderColor: `${action.dot}40`, color: action.dot }}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate group-hover:text-[#F7931A] transition-colors">{action.name}</p>
        <p className="text-xs text-[#94A3B8] truncate">{action.desc}</p>
      </div>
      <span className={cn('shrink-0 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold tracking-wide border', action.cls)}>
        {action.badge}
      </span>
    </button>
  );
}

function CveChart({ counts }) {
  const bars = [
    { label: 'Critique', value: counts.critical, color: '#ef4444' },
    { label: 'Haute',    value: counts.high,     color: '#F7931A' },
    { label: 'Moyenne',  value: counts.medium,   color: '#fbbf24' },
    { label: 'Basse',    value: counts.low,       color: '#FFD600' },
  ];
  const maxVal = Math.max(...bars.map(b => b.value), 5);
  const chartH = 200, barW = 64, gap = 56, paddingLeft = 32, paddingBottom = 28, paddingTop = 20;
  const chartW = paddingLeft + bars.length * (barW + gap);
  const drawH = chartH - paddingBottom - paddingTop;
  const baseline = chartH - paddingBottom;

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height="100%" style={{ maxHeight: '200px' }}>
      {[1, 2, 3].map(i => {
        const y = baseline - (i / 3) * drawH;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={chartW - 8} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={paddingLeft - 4} y={y + 3} fill="rgba(148,163,184,0.4)" fontSize="8" textAnchor="end">
              {Math.round((i / 3) * maxVal)}
            </text>
          </g>
        );
      })}
      <line x1={paddingLeft} y1={baseline} x2={chartW - 8} y2={baseline} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {bars.map((bar, idx) => {
        const x = paddingLeft + 8 + idx * (barW + gap);
        const h = Math.max((bar.value / maxVal) * drawH, bar.value > 0 ? 4 : 0);
        const y = baseline - h;
        return (
          <g key={bar.label}>
            {h > 0
              ? <rect x={x} y={y} width={barW} height={h} rx="5" fill={bar.color} />
              : <rect x={x} y={baseline - 2} width={barW} height={2} rx="1" fill="rgba(255,255,255,0.05)" />
            }
            <text x={x + barW / 2} y={h > 0 ? y - 5 : baseline - 7} fill={h > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)'}
              fontSize="10" fontWeight="700" textAnchor="middle">
              {bar.value}
            </text>
            <text x={x + barW / 2} y={chartH - 5} fill="rgba(148,163,184,0.5)" fontSize="9" textAnchor="middle">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ContainerCard({ c, onClick }) {
  const scoreCol = gradeColor(c.score);
  const scoreBg = gradeBg(c.score);

  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-5 text-left hover:-translate-y-0.5 hover:border-[#F7931A]/30 hover:shadow-[0_0_25px_-8px_rgba(247,147,26,0.2)] transition-all duration-300 group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold text-white truncate">{c.name}</p>
          <p className="text-xs text-[#94A3B8] mt-0.5 font-mono truncate">{c.image_name}:{c.image_tag}</p>
          <p className="text-xs text-[#94A3B8]/50 mt-0.5 font-mono">{c.host_name}</p>
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center font-heading text-base font-extrabold shrink-0', scoreCol, scoreBg)}>
          {c.grade}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        <Pill pass={c.tag_pinned}>Pinning</Pill>
        <Pill pass={c.non_root}>Non-Root</Pill>
        <Pill pass={c.privileged_safe}>Privilèges</Pill>
      </div>

      <div className="flex items-center justify-between font-mono text-xs text-[#94A3B8]">
        <span>Score : <span className={cn('font-bold', scoreCol)}>{c.score}/100</span></span>
        {c.update_available ? (
          <span className="flex items-center gap-1 text-amber-400">
            <CloudDownload className="w-3.5 h-3.5" /> Màj dispo
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> À jour
          </span>
        )}
      </div>
    </button>
  );
}

function Pill({ pass, children }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-md font-medium',
      pass ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
    )}>
      {pass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {children}
    </span>
  );
}
