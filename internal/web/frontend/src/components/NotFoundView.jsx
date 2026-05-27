import React from 'react';
import { TriangleAlert, HouseIcon } from 'lucide-react';

export default function NotFoundView({ onNavigate }) {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="relative max-w-lg w-full text-center card p-10 border-red-500/20 overflow-hidden hover:border-red-500/30 transition-all duration-300">
        {/* Glow */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-40 h-40 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        <TriangleAlert className="w-12 h-12 text-red-400 mx-auto mb-4 animate-pulse" />

        <h1 className="font-heading text-7xl font-black text-white tracking-tighter mb-1">404</h1>
        <h2 className="font-heading text-lg font-bold text-white mb-4">Rupture du Périmètre de Sécurité</h2>

        <div className="bg-[#0A0C10] border border-white/[0.06] rounded-xl p-3 mb-6 text-left font-mono text-xs text-[#94A3B8]">
          <span className="text-[#94A3B8]/30">[root@safedock]# </span>
          <span className="text-red-400">access --request-uri="{window.location.pathname}"</span>
          <br />
          <span className="text-red-500 font-bold">ERROR:</span>
          <span className="text-[#94A3B8]/50"> Route non autorisée. Code 0x04F4. Hôte sécurisé.</span>
        </div>

        <p className="text-sm text-[#94A3B8] mb-6 leading-relaxed">
          La ressource demandée n'a pu être localisée sur ce nœud Docker. Retournez au centre de commandement sécurisé.
        </p>

        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#F7931A]/15 text-[#F7931A] hover:bg-[#F7931A]/25 border border-[#F7931A]/25 hover:border-[#F7931A]/50 transition-all hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.3)]"
        >
          <HouseIcon className="w-4 h-4" />
          Retourner au Tableau de Bord
        </button>
      </div>
    </div>
  );
}
