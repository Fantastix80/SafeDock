import React, { useState } from 'react';

export default function NotificationsView() {
  const [activeFilter, setActiveFilter] = useState('all');

  const notifications = [
    {
      id: 1,
      type: 'CRITICAL',
      title: 'Fuite de secret critique détectée',
      desc: 'Le conteneur "payment-gateway" révèle une clé API Stripe en clair dans ses variables d\'environnement.',
      time: 'Il y a 10 min',
      host: 'prod-swarm-01'
    },
    {
      id: 2,
      type: 'WARNING',
      title: 'Image mutable :latest en production',
      desc: 'Le conteneur "nginx-frontend" a démarré avec le tag mutable "nginx:latest" sans digest SHA256.',
      time: 'Il y a 1 heure',
      host: 'edge-node-02'
    },
    {
      id: 3,
      type: 'INFO',
      title: 'Audit de sécurité automatique réussi',
      desc: 'L\'audit global programmé a scanné 14 conteneurs. Aucun nouveau secret ou privilège abusif détecté.',
      time: 'Il y a 4 heures',
      host: 'Tous les hôtes'
    },
    {
      id: 4,
      type: 'CRITICAL',
      title: 'Conteneur démarré en mode PRIVILÉGIÉ',
      desc: 'Le conteneur "backup-daemon" a été lancé avec l\'argument --privileged. Risque de compromission totale de l\'hôte.',
      time: 'Il y a 1 jour',
      host: 'prod-swarm-01'
    }
  ];

  const filtered = notifications.filter(n => {
    if (activeFilter === 'critical') return n.type === 'CRITICAL';
    if (activeFilter === 'warning') return n.type === 'WARNING';
    if (activeFilter === 'info') return n.type === 'INFO';
    return true;
  });

  return (
    <div id="view-notifications" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-bell text-primary"></i>
            Centre de Notifications de Sécurité
          </h3>
          
          <div className="filters">
            <button 
              className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
              type="button"
            >
              Toutes
            </button>
            <button 
              className={`filter-btn ${activeFilter === 'critical' ? 'active' : ''}`}
              onClick={() => setActiveFilter('critical')}
              type="button"
            >
              Critique
            </button>
            <button 
              className={`filter-btn ${activeFilter === 'warning' ? 'active' : ''}`}
              onClick={() => setActiveFilter('warning')}
              type="button"
            >
              Alerte
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-bell-slash"></i>
              <p>Aucune notification de sécurité dans cette catégorie.</p>
            </div>
          ) : (
            filtered.map(n => (
              <div key={n.id} className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', borderLeft: `4px solid ${n.type === 'CRITICAL' ? 'var(--danger)' : n.type === 'WARNING' ? 'var(--warning)' : 'var(--primary)'}`, display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '1.5rem', marginTop: '0.15rem', color: n.type === 'CRITICAL' ? 'var(--danger)' : n.type === 'WARNING' ? 'var(--warning)' : 'var(--primary)' }}>
                  <i className={`fa-solid ${n.type === 'CRITICAL' ? 'fa-triangle-exclamation' : n.type === 'WARNING' ? 'fa-circle-exclamation' : 'fa-circle-info'}`}></i>
                </div>
                
                <div style={{ flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0' }}>{n.title}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{n.time}</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', lineHeight: '1.4' }}>{n.desc}</p>
                  
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-server" style={{ fontSize: '0.7rem' }}></i>
                    <span>Hôte : <strong>{n.host}</strong></span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
