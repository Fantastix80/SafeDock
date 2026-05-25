import React from 'react';

export default function NotFoundView({ onNavigate }) {
  return (
    <div className="page-view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '2rem', textAlign: 'center' }}>
      <div className="glass" style={{ maxWidth: '600px', width: '100%', padding: '3rem 2rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.25)', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.08)', position: 'relative', overflow: 'hidden' }}>
        
        {/* Glowing cyber aura */}
        <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0) 70%)', filter: 'blur(20px)', pointerEvents: 'none' }}></div>
        
        <div style={{ fontSize: '5rem', color: 'var(--danger)', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>
          <i className="fa-solid fa-triangle-exclamation"></i>
        </div>
        
        <h1 style={{ fontSize: '4.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0', letterSpacing: '-0.03em', fontFamily: 'monospace' }}>
          404
        </h1>
        
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          Rupture du Périmètre de Sécurité
        </h2>
        
        <div className="glass" style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '2rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}><span style={{ color: 'var(--text-muted)' }}>[root@safedock]#</span> access --request-uri="{window.location.pathname}"</p>
          <p style={{ margin: '0', color: 'var(--text-muted)' }}><span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>ERROR:</span> Route non autorisée ou inexistante. Le démon a renvoyé un code d'erreur 0x04F4. Hôte local sécurisé.</p>
        </div>
        
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>
          La ressource demandée n'a pu être localisée sur ce nœud Docker. Veuillez retourner au centre de commandement sécurisé.
        </p>
        
        <button 
          className="btn btn-primary"
          onClick={() => onNavigate('dashboard')}
          style={{ padding: '0.75rem 1.75rem', fontSize: '0.9rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
          type="button"
        >
          <i className="fa-solid fa-house-shield"></i>
          <span>Retourner au Tableau de Bord</span>
        </button>
      </div>
    </div>
  );
}
