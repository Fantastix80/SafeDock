import React, { useState } from 'react';
import {
  Boxes, Search, ArrowUpDown, ChevronUp, ChevronDown,
  Server, Eye, Settings2, CheckCircle2, XCircle, ShieldCheck, TriangleAlert
} from 'lucide-react';
import { cn, gradeColor, gradeBg } from '../lib/utils';

export default function ContainersView({ containers, onSelectContainer, onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-25" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-[#F7931A]" />
      : <ChevronDown className="w-3 h-3 ml-1 text-[#F7931A]" />;
  };

  const filtered = containers.filter(c => {
    const t = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(t) ||
      (c.image_name || '').toLowerCase().includes(t) ||
      (c.image_tag || '').toLowerCase().includes(t) ||
      (c.host_name || '').toLowerCase().includes(t) ||
      (c.tags || []).join(' ').toLowerCase().includes(t)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    av = (av || '').toString().toLowerCase();
    bv = (bv || '').toString().toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total = sorted.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  const safePage = Math.min(page, totalPages);
  const slice = sorted.slice((safePage - 1) * perPage, safePage * perPage);

  const thBase = "px-5 py-4 text-left font-mono text-xs font-medium text-[#94A3B8]/60 uppercase tracking-widest select-none";
  const thSort = cn(thBase, "cursor-pointer hover:text-[#94A3B8] transition-colors");

  const tagColor = (tag) => {
    if (['Production', 'Critical'].includes(tag))       return 'bg-red-500/10 text-red-400 border border-red-500/20';
    if (['Database', 'Back-End', 'API'].includes(tag))  return 'bg-[#F7931A]/10 text-[#F7931A] border border-[#F7931A]/20';
    if (['Staging', 'Dev'].includes(tag))               return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    return 'bg-white/[0.04] text-[#94A3B8] border border-white/[0.06]';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-heading text-base font-semibold text-white">
          <Boxes className="w-5 h-5 text-[#94A3B8]" />
          Inventaire des conteneurs
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]/50 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-64 pl-9 pr-3 py-2 text-sm rounded-xl bg-[#0F1115] border border-white/[0.08] text-white placeholder-[#94A3B8]/40 focus:outline-none focus:border-[#F7931A]/40 transition-colors font-mono"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className={thSort} onClick={() => handleSort('score')}>
                  <span className="flex items-center">Score <SortIcon field="score" /></span>
                </th>
                <th className={thSort} onClick={() => handleSort('name')}>
                  <span className="flex items-center">Conteneur <SortIcon field="name" /></span>
                </th>
                <th className={thSort} onClick={() => handleSort('host_name')}>
                  <span className="flex items-center">Hôte <SortIcon field="host_name" /></span>
                </th>
                <th className={thSort} onClick={() => handleSort('image_name')}>
                  <span className="flex items-center">Image <SortIcon field="image_name" /></span>
                </th>
                <th className={thBase}>Tags</th>
                <th className={cn(thSort, 'text-center')} onClick={() => handleSort('tag_pinned')}>
                  <span className="flex items-center justify-center">Digest <SortIcon field="tag_pinned" /></span>
                </th>
                <th className={cn(thSort, 'text-center')} onClick={() => handleSort('non_root')}>
                  <span className="flex items-center justify-center">Root <SortIcon field="non_root" /></span>
                </th>
                <th className={cn(thSort, 'text-center')} onClick={() => handleSort('privileged_safe')}>
                  <span className="flex items-center justify-center">Privilèges <SortIcon field="privileged_safe" /></span>
                </th>
                <th className={cn(thBase, 'text-center')}>Secrets</th>
                <th className={cn(thBase, 'text-right')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-5 py-14 text-center text-[#94A3B8]/40 font-mono text-sm">
                    Chargement des conteneurs...
                  </td>
                </tr>
              ) : slice.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-5 py-14 text-center text-[#94A3B8]/40 font-mono text-sm">
                    Aucun résultat pour cette recherche.
                  </td>
                </tr>
              ) : (
                slice.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectContainer(c.id)}
                    className="border-b border-white/[0.03] hover:bg-[#F7931A]/[0.02] cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center font-heading text-base font-extrabold', gradeColor(c.score), gradeBg(c.score))}>
                        {c.grade}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-heading font-semibold text-white group-hover:text-white text-base">{c.name}</td>
                    <td className="px-5 py-4 text-[#94A3B8]">
                      <span className="flex items-center gap-1.5 font-mono text-sm">
                        <Server className="w-4 h-4 text-[#94A3B8]/40" />
                        {c.host_name}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-[#94A3B8]/70 text-sm">{c.image_name}:{c.image_tag}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {(c.tags || []).map((t, i) => (
                          <span key={i} className={cn('px-2.5 py-0.5 rounded-md font-mono text-sm font-medium', tagColor(t))}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center"><BoolIcon ok={c.tag_pinned} /></td>
                    <td className="px-5 py-4 text-center"><BoolIcon ok={c.non_root} /></td>
                    <td className="px-5 py-4 text-center">
                      {c.privileged_safe
                        ? <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto" />
                        : <TriangleAlert className="w-4 h-4 text-amber-400 mx-auto" />
                      }
                    </td>
                    <td className="px-5 py-4 text-center">
                      {c.secret_leaks && c.secret_leaks.length > 0
                        ? <span className="px-2 py-0.5 rounded-md font-mono text-sm font-bold bg-red-500/15 text-red-400 border border-red-500/20">
                            {c.secret_leaks.length} FUITE{c.secret_leaks.length > 1 ? 'S' : ''}
                          </span>
                        : <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                      }
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onSelectContainer(c.id)}
                          title="Inspecter"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F7931A]/10 text-[#F7931A] hover:bg-[#F7931A]/20 border border-[#F7931A]/20 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { onSelectContainer(c.id); onNavigate('container-settings'); }}
                          title="Configurer"
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] text-[#94A3B8] hover:bg-white/[0.08] hover:text-white border border-white/[0.06] transition-colors"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] gap-4 flex-wrap">
          <div className="flex items-center gap-3 font-mono text-sm text-[#94A3B8]">
            <span>
              {total > 0 ? (safePage - 1) * perPage + 1 : 0}–{Math.min(safePage * perPage, total)} sur {total}
            </span>
            <div className="flex items-center gap-1.5">
              <span>Par page :</span>
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="bg-[#0F1115] border border-white/[0.08] text-white rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:border-[#F7931A]/40 cursor-pointer"
              >
                {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex gap-1">
              <PageBtn onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={safePage === 1}>
                <ChevronUp className="w-3 h-3 -rotate-90" /> Préc.
              </PageBtn>
              {Array.from({ length: totalPages }, (_, i) => (
                <PageBtn key={i} onClick={() => setPage(i + 1)} active={safePage === i + 1}>
                  {i + 1}
                </PageBtn>
              ))}
              <PageBtn onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={safePage === totalPages}>
                Suiv. <ChevronDown className="w-3 h-3 -rotate-90" />
              </PageBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BoolIcon({ ok }) {
  return ok
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
    : <XCircle className="w-4 h-4 text-red-400 mx-auto" />;
}

function PageBtn({ onClick, disabled, active, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-0.5 px-2.5 py-1 text-xs rounded-xl font-mono transition-all duration-200',
        active
          ? 'bg-[#F7931A]/15 text-[#F7931A] font-semibold border border-[#F7931A]/30'
          : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.05] border border-transparent',
        'disabled:opacity-30 disabled:cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}
