import React, { useState } from 'react';
import {
  Boxes, TriangleAlert, CloudDownload, CheckCircle2, XCircle,
  ArrowRight, RotateCcw, ListChecks, Clock, Zap
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
    cveCounts.high     += c.cve_high     || 0;
    cveCounts.medium   += c.cve_medium   || 0;
    cveCounts.low      += c.cve_low      || 0;
  });

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
    <div className="space-y-6">
      {/* Analytics + KPI section */}
      <div className="flex gap-4 items-start">

        {/* LEFT — Score+Chart en haut, Actions en bas */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Score + Chart côte à côte */}
          <div className="flex gap-4">
            {/* Score Gauge */}
            <div className="card p-6 w-[260px] shrink-0 flex flex-col items-center justify-center gap-3 text-center hover:border-[#F7931A]/30 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.15)]">
              <p className="font-mono text-xs font-medium text-[#94A3B8] uppercase tracking-widest">Score Global</p>
              <div className="relative w-36 h-36">
                <svg className="score-ring w-full h-full" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" />
                  <circle cx="50" cy="50" r="44" style={{ strokeDashoffset: strokeOffset, stroke }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn('font-heading text-4xl font-extrabold', gradeColor(stats.globalScore))}>
                    {stats.globalGrade}
                  </span>
                  <span className="text-xs text-[#94A3B8] mt-0.5 font-mono">{stats.globalScore}/100</span>
                </div>
              </div>
              <div>
                <p className={cn('font-heading text-base font-bold', gradeColor(stats.globalScore))}>
                  {gradeLabel(stats.globalGrade)}
                </p>
                <p className="text-sm text-[#94A3B8] mt-0.5">Posture globale du parc</p>
              </div>
            </div>

            {/* CVE Chart */}
            <div className="card p-6 flex-1 min-w-0">
              <div className="mb-4">
                <p className="font-heading text-base font-semibold text-white">Gravité des Failles (CVE)</p>
                <p className="text-sm text-[#94A3B8] mt-0.5">Vulnérabilités cumulées détectées sur vos conteneurs</p>
              </div>
              <CveChart counts={cveCounts} />
            </div>
          </div>

          {/* Actions Recommandées — pleine largeur, bouton à droite */}
          <div className="card p-6 flex items-center gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
                <Zap className="w-4 h-4 text-[#F7931A]" />
                <p className="font-heading text-base font-semibold text-white">Actions recommandées</p>
              </div>
              <div className="space-y-2.5">
                <ActionItem badge="CRITICAL" badgeClass="bg-red-500/15 text-red-400 border border-red-500/20" name="target-vuln"   desc="Faille critique sans patch." />
                <ActionItem badge="SECURITY" badgeClass="bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20" name="docker-proxy" desc="Tag latest non-épinglé." />
                <ActionItem badge="UPDATE"   badgeClass="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" name="safedock-app" desc="Mise à jour en attente." />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('actions')}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#F7931A] bg-[#F7931A]/10 hover:bg-[#F7931A]/20 border border-[#F7931A]/20 hover:border-[#F7931A]/40 transition-all duration-200 whitespace-nowrap"
            >
              Gérer les actions ({stats.warnings + stats.updatesAvailable})
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RIGHT — KPI cards empilées */}
        <div className="w-[200px] shrink-0 flex flex-col gap-4">
          <KpiCard
            icon={<Boxes className="w-4 h-4" />}
            iconClass="text-[#F7931A] bg-[#F7931A]/15 border border-[#F7931A]/30"
            value={stats.total}
            label="Conteneurs audités"
            glow="shadow-[0_0_30px_-12px_rgba(247,147,26,0.2)]"
          />
          <KpiCard
            icon={<TriangleAlert className="w-4 h-4" />}
            iconClass="text-red-400 bg-red-400/10 border border-red-400/20"
            value={stats.warnings}
            label="Alertes critiques"
            glow={stats.warnings > 0 ? 'shadow-[0_0_30px_-12px_rgba(239,68,68,0.2)]' : ''}
          />
          <KpiCard
            icon={<CloudDownload className="w-4 h-4" />}
            iconClass="text-amber-400 bg-amber-400/10 border border-amber-400/20"
            value={stats.updatesAvailable}
            label="Mises à jour"
            glow=""
          />
        </div>
      </div>

      {/* Container Cards */}
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
            <p className="text-sm font-mono">Audit SecOps en cours...</p>
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

      {/* Audit Logs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-heading text-sm font-semibold text-white">
            <Clock className="w-4 h-4 text-[#94A3B8]" />
            Historique d'audit & activités SecOps
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

function KpiCard({ icon, iconClass, value, label, glow }) {
  return (
    <div className={cn('card px-4 py-3.5 flex items-center gap-3 hover:border-white/[0.15] transition-all duration-300', glow)}>
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconClass)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-heading text-xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5 font-mono leading-tight">{label}</p>
      </div>
    </div>
  );
}

function ActionItem({ badge, badgeClass, name, desc }) {
  return (
    <div className="flex gap-2.5 text-sm leading-relaxed">
      <span className={cn('shrink-0 px-1.5 py-0.5 rounded-md font-mono text-xs font-bold h-fit tracking-wide', badgeClass)}>
        {badge}
      </span>
      <div>
        <span className="font-semibold text-white">{name} : </span>
        <span className="text-[#94A3B8]">{desc}</span>
      </div>
    </div>
  );
}

function CveChart({ counts }) {
  const bars = [
    { label: 'Critique', value: counts.critical, color: '#ef4444', glow: 'rgba(239,68,68,0.4)' },
    { label: 'Haute',    value: counts.high,     color: '#F7931A', glow: 'rgba(247,147,26,0.4)' },
    { label: 'Moyenne',  value: counts.medium,   color: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
    { label: 'Basse',    value: counts.low,       color: '#FFD600', glow: 'rgba(255,214,0,0.25)' },
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
              ? <rect x={x} y={y} width={barW} height={h} rx="5" fill={bar.color} style={{ filter: `drop-shadow(0 2px 10px ${bar.glow})` }} />
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
