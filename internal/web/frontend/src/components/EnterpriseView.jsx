import React from 'react';

export default function EnterpriseView() {
  const securityFeatures = [
    {
      icon: 'fa-key',
      title: 'Authentification Unique (SSO)',
      desc: 'Intégrez SafeDock avec votre fournisseur d\'identité (Okta, Entra ID / Azure AD, Ping Identity) via SAML 2.0 ou OIDC.',
      status: 'Inactif',
      btnText: 'Configurer SAML'
    },
    {
      icon: 'fa-shield-halved',
      title: 'Authentification Double Facteur (MFA)',
      desc: 'Forcez tous les auditeurs SecOps de votre entreprise à activer la validation TOTP (Google Authenticator, Duo Security).',
      status: 'Inactif',
      btnText: 'Forcer le MFA'
    },
    {
      icon: 'fa-users-gear',
      title: 'Annuaire d\'Entreprise (LDAP/AD)',
      desc: 'Synchronisez automatiquement les rôles et permissions des utilisateurs depuis votre annuaire LDAP ou Active Directory.',
      status: 'Inactif',
      btnText: 'Connecter l\'Annuaire'
    }
  ];

  return (
    <div id="view-enterprise" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-building-shield text-primary"></i>
            Paramètres SecOps d'Entreprise
          </h3>
          <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', fontWeight: 'bold' }}>
            LICENCE ENTERPRISE
          </span>
        </div>

        {/* Feature Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '1.5rem' }}>
          {securityFeatures.map((f, idx) => (
            <div key={idx} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
              <div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(69, 120, 249, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: 'var(--primary)', marginBottom: '1rem' }}>
                  <i className={`fa-solid ${f.icon}`}></i>
                </div>
                
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>{f.title}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>{f.desc}</p>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Statut global :</span>
                  <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontSize: '0.65rem', padding: '0.15rem 0.4rem', fontWeight: 'bold' }}>{f.status}</span>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem 0.75rem', borderRadius: '8px' }}
                  disabled
                  type="button"
                >
                  {f.btnText}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* RBAC Permission Matrix Section */}
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', marginTop: '2rem' }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Matrice de rôles & permissions (RBAC)</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>Assignez et contrôlez finement les capacités des différents profils d'auditeurs de votre infrastructure.</p>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  <th style={{ padding: '0.5rem 1rem' }}>Permission</th>
                  <th style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>Lecteur</th>
                  <th style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>Auditeur SecOps</th>
                  <th style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>Administrateur</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Visualiser les conteneurs et scores</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Lancer des audits de sécurité manuels</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Déclencher le déploiement de conteneurs (Recreate/Rollout)</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                </tr>
                <tr>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Modifier les configurations SecOps globales & s'authentifier aux registres</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </section>
    </div>
  );
}
