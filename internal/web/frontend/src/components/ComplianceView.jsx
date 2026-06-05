import React from 'react';
import { ShieldCheck, Bug, Boxes, Loader2 } from 'lucide-react';
import { cn, gradeColor, gradeBg } from '../lib/utils';

const UNTAGGED = 'Sans tag';

function gradeFromScore(s) {
  if (s < 40) return 'F';
  if (s < 60) return 'D';
  if (s < 75) return 'C';
  if (s < 90) return 'B';
  return 'A';
}

// ComplianceView agrège la posture de sécurité par tag : score moyen, CVE cumulées,
// conteneurs à risque. Permet de suivre la conformité par environnement / équipe.
export default function ComplianceView({ containers = [], onNavigate }) {
  const byTag = {};
  for (const c of containers) {
    const tagList = (c.tags && c.tags.length) ? c.tags : [UNTAGGED];
    for (const t of tagList) {
      const g = byTag[t] || (byTag[t] = { name: t, count: 0, scoreSum: 0, crit: 0, high: 0, med: 0, low: 0, atRisk: 0, scanned: 0 });
      g.count++;
      g.scoreSum += c.score || 0;
      g.crit += c.cve_critical || 0;
      g.high += c.cve_high || 0;
      g.med += c.cve_medium || 0;
      g.low += c.cve_low || 0;
      if ((c.score || 0) < 75) g.atRisk++;
      if (c.scanned) g.scanned++;
    }
  }

  const rows = Object.values(byTag)
    .map(g => ({ ...g, avg: Math.round(g.scoreSum / g.count) }))
    .sort((a, b) => a.avg - b.avg); // pire posture en premier

  const pill = (n, label, cls) => n > 0
    ? <span className={cn('px-1.5 py-0.5 rounded-md font-mono text-xs font-bold', cls)}>{n} {label}</span>
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F7931A]" /> Conformité par tag
        </h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">Posture de sécurité agrégée par environnement / équipe (tag). Les conteneurs multi-tags comptent dans chaque tag.</p>
      </div>

      {rows.length === 0 ? (
        <div className="card py-16 flex flex-col items-center gap-3 text-[#94A3B8]/40">
          <Boxes className="w-8 h-8" />
          <p className="text-sm font-mono">Aucun conteneur à analyser.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(g => {
            const grade = gradeFromScore(g.avg);
            const securePct = Math.round(((g.count - g.atRisk) / g.count) * 100);
            const pending = g.count - g.scanned;
            return (
              <div key={g.name} className="card p-4 flex flex-col gap-3 hover:border-[#F7931A]/20 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-heading text-sm font-semibold text-white truncate">{g.name}</p>
                    <p className="text-xs font-mono text-[#94A3B8]/60 mt-0.5">{g.count} conteneur{g.count > 1 ? 's' : ''}</p>
                  </div>
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center font-heading text-base font-extrabold shrink-0', gradeColor(g.avg), gradeBg(g.avg))}>
                    {grade}
                  </div>
                </div>

                {/* Barre de posture */}
                <div>
                  <div className="flex justify-between text-xs font-mono text-[#94A3B8]/60 mb-1">
                    <span>Score moyen</span>
                    <span className={gradeColor(g.avg)}>{g.avg}/100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${securePct}%` }} />
                  </div>
                </div>

                {/* CVE cumulées */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Bug className="w-3.5 h-3.5 text-[#94A3B8]/50" />
                  {g.crit + g.high + g.med + g.low === 0
                    ? <span className="font-mono text-xs text-emerald-400">Aucune CVE</span>
                    : <>
                        {pill(g.crit, 'C', 'bg-red-500/15 text-red-400 border border-red-500/20')}
                        {pill(g.high, 'É', 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20')}
                        {pill(g.med, 'M', 'bg-amber-500/15 text-amber-400 border border-amber-500/20')}
                        {pill(g.low, 'F', 'bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20')}
                      </>}
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-white/[0.06]">
                  <span className={g.atRisk > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {g.atRisk > 0 ? `${g.atRisk} à risque` : 'Tous sains'}
                  </span>
                  {pending > 0 && (
                    <span className="flex items-center gap-1 text-[#94A3B8]/60">
                      <Loader2 className="w-3 h-3 animate-spin text-[#F7931A]" /> {pending} en scan
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
