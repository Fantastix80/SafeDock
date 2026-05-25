import React from 'react';

export default function WatchView() {
  const securityBulletins = [
    {
      id: 'SB-2026-003',
      date: '25 Mai 2026',
      title: 'Vulnérabilité critique dans le démon de runtime containerd',
      severity: 'CRITICAL',
      summary: 'Une faille de contournement de namespace dans containerd (CVE-2026-9912) permet à un conteneur malveillant d\'exécuter du code arbitraire sur l\'hôte.',
      remediation: 'Mettez à jour containerd vers la version 1.7.15+ ou 2.0.0-rc.3+'
    },
    {
      id: 'SB-2026-002',
      date: '18 Mai 2026',
      title: 'Fuite de descripteurs de fichiers dans runc',
      severity: 'HIGH',
      summary: 'Une mauvaise fermeture de descripteur de fichier (CVE-2026-4021) permet à un attaquant disposant de privilèges root dans le conteneur d\'accéder au système de fichiers de l\'hôte.',
      remediation: 'Assurez-vous que runc est mis à jour en v1.1.13'
    },
    {
      id: 'SB-2026-001',
      date: '05 Mai 2026',
      title: 'Faiblesses de chiffrement dans Docker Desktop',
      severity: 'MEDIUM',
      summary: 'Le stockage local des identifiants de registres utilise une clé statique faible sur certaines versions Windows.',
      remediation: 'Activez l\'intégration du gestionnaire d\'identifiants Windows natif (Credential Manager).'
    }
  ];

  const bestPractices = [
    {
      title: 'Restreindre l\'accès à la socket Docker',
      desc: 'Le montage de /var/run/docker.sock équivaut à donner des privilèges root illimités sur l\'hôte. Utilisez des API proxifiées avec authentification.',
      category: 'Isolation'
    },
    {
      title: 'Activer le mode User Namespace',
      desc: 'Mapper l\'utilisateur root du conteneur sur un utilisateur sans privilèges sur l\'hôte via les userns-remap.',
      category: 'Privilèges'
    },
    {
      title: 'Définir des Read-Only Root Filesystems',
      desc: 'Exécutez vos conteneurs avec --read-only pour empêcher l\'écriture et la persistance de charges virales en cas de compromission.',
      category: 'Intégrité'
    }
  ];

  return (
    <div id="view-watch" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-newspaper text-primary"></i> 
            Veille de Sécurité SecOps & Bulletins
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          
          {/* Bulletins Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Derniers Bulletins et CVE Communes</h4>
            {securityBulletins.map(sb => (
              <div key={sb.id} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: `4px solid ${sb.severity === 'CRITICAL' ? 'var(--danger)' : sb.severity === 'HIGH' ? '#F97316' : '#FBBF24'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="badge" style={{ backgroundColor: sb.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : sb.severity === 'HIGH' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(251, 191, 36, 0.15)', color: sb.severity === 'CRITICAL' ? 'var(--danger)' : sb.severity === 'HIGH' ? '#F97316' : '#FBBF24', fontSize: '0.7rem', padding: '0.2rem 0.5rem', fontWeight: 'bold' }}>
                      {sb.severity}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{sb.id}</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sb.date}</span>
                </div>
                
                <h5 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>{sb.title}</h5>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: '1.5' }}>{sb.summary}</p>
                
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <i className="fa-solid fa-wrench text-success" style={{ marginTop: '0.15rem', fontSize: '0.85rem' }}></i>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <strong>Remédiation :</strong> {sb.remediation}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Best Practices */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Guides de Durcissement</h4>
            {bestPractices.map((bp, idx) => (
              <div key={idx} className="glass" style={{ padding: '1.25rem', borderRadius: '12px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', marginBottom: '0.5rem', display: 'inline-block' }}>
                  {bp.category}
                </span>
                <h5 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>{bp.title}</h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0', lineHeight: '1.4' }}>{bp.desc}</p>
              </div>
            ))}
            
            {/* Live RSS simulation status */}
            <div className="glass" style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(69, 120, 249, 0.03)', border: '1px dashed rgba(69, 120, 249, 0.25)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Flux de renseignement de menaces
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                <span className="pulse-dot" style={{ backgroundColor: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }}></span>
                <span>Flux synchronisé (NVD & CERT)</span>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
