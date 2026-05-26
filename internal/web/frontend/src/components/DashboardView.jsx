import React, { useState } from 'react';
import {
  Boxes, TriangleAlert, CloudDownload, CheckCircle2, XCircle,
  ArrowRight, RotateCcw, ListChecks, Clock
} from 'lucide-react';
import { cn, gradeColor, gradeBg, gradeLabel, gradeStroke } from '../lib/utils';

const CIRCUMFERENCE = 276.46;

export default function DashboardView({ containers, auditLogs, stats, onSelectContainer, onRefreshLogs, onNavigate }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredContainers = containers.filter(c => {
    if (activeFilter === 'secure') return c.score >= 75;
    if (activeFilter === 'warning') return c.score < 75;
    return true;
  });

  const strokeOffset = CIRCUMFERENCE - (stats.globalScore / 100) * CIRCUMFERENCE;
  const stroke = gradeStroke(stats.globalGrade);

  const cveCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  containers.forEach(c => {
    cveCounts.critical += c.cve_critical || 0;
    cveCounts.high += c.cve_high || 0;
    cveCounts.medium += c.cve_medium || 0;
    cveCounts.low += c.cve_low || 0;
  });

  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const logStatusStyle = (status) => {
    if (status === 'SUCCESS' || status === 'CLEAN') return 'text-emerald-400';
    if (status === 'BLOCKED') return 'text-red-400';
    return 'text-amber-400';
  };
  const logStatusLabel = (status) => {
    if (status === 'SUCCESS' || status === 'CLEAN') return 'SUCCÈS';
    if (status === 'BLOCKED') return 'BLOQUÉ';
    return 'ÉCHEC';
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          icon={<Boxes className="w-5 h-5" />}
          iconClass="text-blue-400 bg-blue-400/10"
          value={stats.total}
          label="Conteneurs audités"
        />
        <KpiCard
          icon={<TriangleAlert className="w-5 h-5" />}
          iconClass="text-red-400 bg-red-400/10"
          value={stats.warnings}
          label="Alertes critiques"
        />
        <KpiCard
          icon={<CloudDownload className="w-5 h-5" />}
          iconClass="text-amber-400 bg-amber-400/10"
          value={stats.updatesAvailable}
          label="Mises à jour disponibles"
        />
      </div>

      {/* Analytics Row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '260px 1fr 260px' }}>
        {/* Score Gauge */}
        <div className="card p-5 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Score Global</p>
          <div className="relative w-32 h-32">
            <svg className="score-ring w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" />
              <circle cx="50" cy="50" r="44" style={{ strokeDashoffset: strokeOffset, stroke }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-3xl font-extrabold', gradeColor(stats.globalScore))}>
                {stats.globalGrade}
              </span>
              <span className="text-[11px] text-zinc-500 mt-0.5">{stats.globalScore}/100</span>
            </div>
          </div>
          <div>
            <p className={cn('text-sm font-bold', gradeColor(stats.globalScore))}>
              {gradeLabel(stats.globalGrade)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Posture globale du parc</p>
          </div>
        </div>

        {/* CVE Chart */}
        <div className="card p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-zinc-100">Gravité des Failles (CVE)</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Vulnérabilités cumulées détectées sur vos conteneurs</p>
          </div>
          <CveChart counts={cveCounts} />
        </div>

        {/* Recommended Actions */}
        <div className="card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
              <TriangleAlert className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-zinc-100">Actions recommandées</p>
            </div>
            <div className="space-y-3">
              <ActionItem badge="CRITICAL" badgeClass="bg-red-500/20 text-red-400" name="target-vuln" desc="Faille critique sans patch." />
              <ActionItem badge="SECURITY" badgeClass="bg-amber-500/20 text-amber-400" name="docker-proxy" desc="Tag latest non-épinglé." />
              <ActionItem badge="UPDATE" badgeClass="bg-emerald-500/20 text-emerald-400" name="safedock-app" desc="Mise à jour en attente." />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('actions')}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
          >
            Gérer les actions ({stats.warnings + stats.updatesAvailable})
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Container Cards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <ListChecks className="w-4 h-4 text-zinc-400" />
            Statuts des conteneurs en cours d'audit
          </div>
          <div className="flex gap-1.5">
            {['all', 'secure', 'warning'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
                  activeFilter === f
                    ? 'bg-brand-DEFAULT/15 text-brand-DEFAULT'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                )}
              >
                {f === 'all' ? 'Tous' : f === 'secure' ? 'Sains' : 'Alertes'}
              </button>
            ))}
          </div>
        </div>

        {containers.length === 0 ? (
          <div className="card py-16 flex flex-col items-center gap-3 text-zinc-500">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin" />
            <p className="text-sm">Audit SecOps en cours...</p>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="card py-16 flex flex-col items-center gap-2 text-zinc-500">
            <Boxes className="w-8 h-8 text-zinc-700" />
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

      {/* Audit Logs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Clock className="w-4 h-4 text-zinc-400" />
            Historique d'audit & activités SecOps
          </div>
          <button
            type="button"
            onClick={onRefreshLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded-lg transition-colors"
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
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-10 text-center text-zinc-600">
                      Aucun journal d'activité disponible.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-zinc-200">{log.container_name}</td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{log.image_ref || '-'}</td>
                      <td className={cn('px-4 py-3 font-semibold', logStatusStyle(log.status))}>
                        {logStatusLabel(log.status)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">{log.message}</td>
                      <td className="px-4 py-3 text-center font-mono text-zinc-400">
                        {(log.status === 'SUCCESS' || log.status === 'CLEAN')
                          ? <span className="text-zinc-700">—</span>
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

function KpiCard({ icon, iconClass, value, label }) {
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconClass)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-100 leading-none">{value}</p>
        <p className="text-xs text-zinc-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function ActionItem({ badge, badgeClass, name, desc }) {
  return (
    <div className="flex gap-2.5 text-xs leading-relaxed">
      <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold h-fit', badgeClass)}>
        {badge}
      </span>
      <div>
        <span className="font-semibold text-zinc-200">{name} : </span>
        <span className="text-zinc-500">{desc}</span>
      </div>
    </div>
  );
}

function CveChart({ counts }) {
  const bars = [
    { label: 'Critique', value: counts.critical, color: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
    { label: 'Haute',    value: counts.high,     color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
    { label: 'Moyenne',  value: counts.medium,   color: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
    { label: 'Basse',    value: counts.low,       color: '#4F8EF7', glow: 'rgba(79,142,247,0.3)' },
  ];
  const maxVal = Math.max(...bars.map(b => b.value), 5);
  const chartH = 140;
  const barW = 52;
  const gap = 50;
  const paddingLeft = 32;
  const paddingBottom = 24;
  const paddingTop = 16;
  const chartW = paddingLeft + bars.length * (barW + gap);
  const drawH = chartH - paddingBottom - paddingTop;
  const baseline = chartH - paddingBottom;

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height="100%" style={{ maxHeight: '140px' }}>
      {/* Grid */}
      {[1,2,3].map(i => {
        const y = baseline - (i / 3) * drawH;
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={chartW - 8} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={paddingLeft - 4} y={y + 3} fill="rgba(255,255,255,0.25)" fontSize="8" textAnchor="end">
              {Math.round((i / 3) * maxVal)}
            </text>
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={paddingLeft} y1={baseline} x2={chartW - 8} y2={baseline} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* Bars */}
      {bars.map((bar, idx) => {
        const x = paddingLeft + 8 + idx * (barW + gap);
        const h = Math.max((bar.value / maxVal) * drawH, bar.value > 0 ? 4 : 0);
        const y = baseline - h;
        return (
          <g key={bar.label}>
            {h > 0 && (
              <rect x={x} y={y} width={barW} height={h} rx="5" fill={bar.color}
                style={{ filter: `drop-shadow(0 2px 8px ${bar.glow})` }}
              />
            )}
            {h === 0 && (
              <rect x={x} y={baseline - 2} width={barW} height={2} rx="1" fill="rgba(255,255,255,0.06)" />
            )}
            <text x={x + barW / 2} y={h > 0 ? y - 5 : baseline - 7} fill={h > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)'}
              fontSize="10" fontWeight="700" textAnchor="middle">
              {bar.value}
            </text>
            <text x={x + barW / 2} y={chartH - 6} fill="rgba(255,255,255,0.35)"
              fontSize="9" textAnchor="middle">
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
      className="card p-4 text-left hover:border-white/[0.12] hover:bg-[#1a2235] transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">{c.name}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5 font-mono truncate">{c.image_name}:{c.image_tag}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{c.host_name}</p>
        </div>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-extrabold shrink-0', scoreCol, scoreBg)}>
          {c.grade}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        <Pill pass={c.tag_pinned}>Pinning</Pill>
        <Pill pass={c.non_root}>Non-Root</Pill>
        <Pill pass={c.privileged_safe}>Privilèges</Pill>
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>Score : <span className={cn('font-semibold', scoreCol)}>{c.score}/100</span></span>
        {c.update_available ? (
          <span className="flex items-center gap-1 text-amber-400">
            <CloudDownload className="w-3 h-3" /> Màj dispo
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> À jour
          </span>
        )}
      </div>
    </button>
  );
}

function Pill({ pass, children }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
      pass ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
    )}>
      {pass ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {children}
    </span>
  );
}
