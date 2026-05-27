import React, { useState } from 'react';
import {
  ScanSearch, Shield, Package, AlertTriangle, CheckCircle2,
  Loader2, ExternalLink, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { cn } from '../lib/utils';

const SEV_BADGE = {
  CRITICAL: 'bg-red-500/15 text-red-400 border border-red-500/20',
  HIGH:     'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/20',
  MEDIUM:   'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  LOW:      'bg-[#FFD600]/15 text-[#FFD600] border border-[#FFD600]/20',
  UNKNOWN:  'bg-white/[0.06] text-[#94A3B8] border border-white/[0.08]',
};

const SEV_DOT = {
  CRITICAL: 'bg-red-400',
  HIGH:     'bg-[#F7931A]',
  MEDIUM:   'bg-amber-400',
  LOW:      'bg-[#FFD600]',
  UNKNOWN:  'bg-[#94A3B8]/40',
};

const QUICK_IMAGES = [
  { image: 'nginx',   tag: 'latest' },
  { image: 'ubuntu',  tag: '22.04' },
  { image: 'python',  tag: '3.11-slim' },
  { image: 'node',    tag: '20-alpine' },
];

export default function AuditView() {
  const [image, setImage]   = useState('');
  const [tag, setTag]       = useState('latest');
  const [state, setState]   = useState('idle'); // idle | scanning | done | error
  const [results, setResults] = useState(null);
  const [error, setError]   = useState('');
  const [sevFilter, setSevFilter] = useState('ALL');

  const handleScan = async (e) => {
    e.preventDefault();
    const img = image.trim();
    if (!img) return;
    setState('scanning');
    setError('');
    setResults(null);
    setSevFilter('ALL');

    try {
      const res = await fetch('/api/audit/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img, tag: (tag.trim() || 'latest') }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Erreur serveur (HTTP ${res.status})`);
      }
      const data = await res.json();
      setResults(data);
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  const quickFill = (img, t) => { setImage(img); setTag(t); };

  return (
    <div className="space-y-5">
      {/* Scan form */}
      <div className="card p-5">
        <div className="flex items-center gap-2 pb-4 mb-4 border-b border-white/[0.06]">
          <ScanSearch className="w-5 h-5 text-[#F7931A]" />
          <h2 className="font-heading text-base font-semibold text-white">Audit d'Image Docker</h2>
          <span className="ml-auto text-sm text-[#94A3B8] font-mono">Trivy + Grype</span>
        </div>

        <form onSubmit={handleScan}>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px] space-y-1.5">
              <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Image Docker</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]/40 pointer-events-none" />
                <input
                  type="text"
                  value={image}
                  onChange={e => setImage(e.target.value)}
                  placeholder="nginx, ubuntu, python…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono"
                  required
                />
              </div>
            </div>
            <div className="w-40 space-y-1.5">
              <label className="font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-wider">Tag / Version</label>
              <input
                type="text"
                value={tag}
                onChange={e => setTag(e.target.value)}
                placeholder="latest"
                className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={state === 'scanning' || !image.trim()}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {state === 'scanning'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ScanSearch className="w-4 h-4" />
              }
              {state === 'scanning' ? 'Analyse…' : "Lancer l'audit"}
            </button>
          </div>

          {/* Quick-fill chips */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-[#94A3B8]/40 font-mono">Exemples :</span>
            {QUICK_IMAGES.map(({ image: qi, tag: qt }) => (
              <button
                key={qi + qt}
                type="button"
                onClick={() => quickFill(qi, qt)}
                className="px-2.5 py-1 text-xs font-mono rounded-lg bg-white/[0.04] text-[#94A3B8] hover:text-white hover:bg-white/[0.07] border border-white/[0.06] transition-colors"
              >
                {qi}:{qt}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* ── Scanning ── */}
      {state === 'scanning' && (
        <div className="card p-10 flex flex-col items-center gap-5 text-center">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-[#F7931A]/20 border-t-[#F7931A] animate-spin" />
            <div className="absolute inset-[6px] rounded-full border border-[#F7931A]/10 border-t-[#FFD600]/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <Shield className="absolute inset-0 m-auto w-8 h-8 text-[#F7931A]" />
          </div>
          <div>
            <p className="font-heading text-base font-semibold text-white">Analyse SecOps en cours</p>
            <p className="text-sm text-[#94A3B8] mt-1 font-mono">{image.trim()}:{tag.trim() || 'latest'}</p>
          </div>
          <div className="space-y-2 w-full max-w-sm text-left">
            {[
              'Récupération des métadonnées de l\'image…',
              'Extraction des couches OS et dépendances…',
              'Croisement avec les bases CVE (NVD, GHSA, OSV)…',
              'Calcul du score de sécurité SecOps…',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F7931A] shrink-0 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                <span className="text-sm font-mono text-[#94A3B8]/60">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {state === 'error' && (
        <div className="card p-5 border-red-500/25 bg-red-500/[0.03]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-heading text-base font-semibold text-white">Audit échoué</p>
              <p className="text-sm text-[#94A3B8] mt-1 font-mono break-all">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Idle placeholder ── */}
      {state === 'idle' && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#F7931A]/10 border border-[#F7931A]/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-[#F7931A]" />
          </div>
          <div className="max-w-md">
            <p className="font-heading text-base font-semibold text-white">Prêt pour l'audit</p>
            <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
              Renseignez une image Docker et lancez l'analyse pour obtenir un rapport de vulnérabilités complet — CVEs par sévérité, versions corrigées et recommandations SecOps.
            </p>
          </div>
          <div className="flex items-start gap-3 mt-2 p-4 rounded-xl bg-[#0A0C10] border border-white/[0.06] max-w-md text-left">
            <Info className="w-4 h-4 text-[#F7931A] shrink-0 mt-0.5" />
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              L'audit est indépendant de vos conteneurs actifs. Idéal pour <strong className="text-white">tester une image avant déploiement</strong> ou comparer plusieurs versions.
            </p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {state === 'done' && results && (
        <ResultsPanel
          results={results}
          image={image.trim()}
          tag={tag.trim() || 'latest'}
          sevFilter={sevFilter}
          setSevFilter={setSevFilter}
        />
      )}
    </div>
  );
}

/* ─────────────── Results ─────────────── */

function ResultsPanel({ results, image, tag, sevFilter, setSevFilter }) {
  const vulns  = results.vulnerabilities || [];
  const summary = results.summary || {};
  const total = (summary.critical || 0) + (summary.high || 0) + (summary.medium || 0) + (summary.low || 0);
  const isClean = total === 0;

  const filtered = sevFilter === 'ALL' ? vulns : vulns.filter(v => v.severity === sevFilter);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isClean
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : <AlertTriangle className="w-5 h-5 text-[#F7931A]" />
              }
              <h3 className="font-heading text-base font-semibold text-white">
                {isClean
                  ? 'Aucune vulnérabilité détectée'
                  : `${total} vulnérabilité${total > 1 ? 's' : ''} détectée${total > 1 ? 's' : ''}`}
              </h3>
            </div>
            <p className="text-sm text-[#94A3B8] font-mono">{image}:{tag}</p>
            {results.os && (
              <p className="text-xs text-[#94A3B8]/50 font-mono mt-0.5">OS : {results.os}</p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'critical', label: 'CRITICAL', bg: 'bg-red-500/10  border-red-500/20  text-red-400' },
              { key: 'high',     label: 'HIGH',     bg: 'bg-[#F7931A]/10 border-[#F7931A]/20 text-[#F7931A]' },
              { key: 'medium',   label: 'MEDIUM',   bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
              { key: 'low',      label: 'LOW',      bg: 'bg-[#FFD600]/10 border-[#FFD600]/20 text-[#FFD600]' },
            ].map(({ key, label, bg }) => (
              <div key={key} className={cn('px-3 py-2 rounded-xl border text-center min-w-[90px]', bg)}>
                <p className="font-heading text-2xl font-bold leading-none">{summary[key] || 0}</p>
                <p className="font-mono text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {vulns.length > 0 && (
        <div className="card overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-white/[0.06] flex-wrap gap-y-2">
            <span className="font-mono text-xs text-[#94A3B8]/50 mr-1 uppercase tracking-wider">Sévérité :</span>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setSevFilter(f)}
                className={cn(
                  'px-3 py-1 text-xs rounded-xl font-mono font-medium transition-colors',
                  sevFilter === f
                    ? 'bg-[#F7931A]/15 text-[#F7931A] border border-[#F7931A]/30'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border border-transparent'
                )}
              >
                {f}{f !== 'ALL' && summary[f.toLowerCase()] != null ? ` (${summary[f.toLowerCase()]})` : ''}
              </button>
            ))}
            <span className="ml-auto font-mono text-xs text-[#94A3B8]/40">
              {filtered.length} entrée{filtered.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['CVE ID', 'Sévérité', 'Paquet', 'Installé', 'Correctif', 'Description'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-mono text-xs font-medium text-[#94A3B8]/50 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-10 text-center text-sm text-[#94A3B8]/40 font-mono">
                      Aucune vulnérabilité pour ce niveau de sévérité.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v, i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${v.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-xs text-[#F7931A] hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {v.id}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('flex items-center gap-1.5 w-fit px-2 py-0.5 rounded-md font-mono text-xs font-bold', SEV_BADGE[v.severity] || SEV_BADGE.UNKNOWN)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', SEV_DOT[v.severity] || SEV_DOT.UNKNOWN)} />
                          {v.severity || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white font-medium">
                        {v.package_name || v.pkg_name || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">
                        {v.installed_version || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {v.fixed_version
                          ? <span className="text-emerald-400">{v.fixed_version}</span>
                          : <span className="text-red-400/60 italic">Non corrigée</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm text-[#94A3B8] max-w-xs truncate" title={v.title || v.description || ''}>
                        {v.title || v.description || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isClean && (
        <div className="card p-6 flex items-center gap-4 border-emerald-500/20 bg-emerald-500/[0.03]">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-heading text-base font-semibold text-white">Image sécurisée</p>
            <p className="text-sm text-[#94A3B8] mt-0.5">
              Aucune vulnérabilité connue détectée pour <span className="font-mono text-white">{image}:{tag}</span>.
              Cette image est prête pour le déploiement SecOps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
