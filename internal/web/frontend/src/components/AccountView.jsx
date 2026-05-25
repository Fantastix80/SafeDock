import React, { useState } from 'react';

export default function AccountView() {
  const [user, setUser] = useState({
    username: 'Hell0W0rld',
    email: 'secops-admin@safedock.local',
    fullName: 'Jean SecOps',
    role: 'Administrateur Principal',
    organization: 'SafeDock Corp',
    apiToken: 'sd_live_a89bc213efd07b4619d08e5c202a',
    showToken: false
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    criticalOnly: false,
    dailyReport: true
  });

  return (
    <div id="view-account" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-user-shield text-primary"></i>
            Compte Utilisateur SecOps
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          
          {/* Avatar and Profile Status */}
          <div className="glass" style={{ padding: '2rem 1.5rem', borderRadius: '12px', textAlign: 'center', height: 'fit-content' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px', margin: '0 auto 1.5rem auto' }}>
              <img 
                src="/avatar.png" 
                alt={user.username} 
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)', padding: '3px' }} 
              />
              <span className="pulse-dot" style={{ position: 'absolute', bottom: '5px', right: '5px', width: '14px', height: '14px', border: '2px solid var(--bg-card)', backgroundColor: 'var(--success)' }}></span>
            </div>
            
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>{user.fullName}</h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>@{user.username}</span>
            
            <div className="badge badge-success" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
              <i className="fa-solid fa-shield-halved" style={{ marginRight: '0.4rem' }}></i> {user.role}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '2rem', paddingTop: '1.5rem', textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Détails d'appartenance</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Organisation :</span> <strong style={{ color: 'var(--text-primary)' }}>{user.organization}</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Session IP :</span> <code style={{ fontSize: '0.75rem' }}>192.168.1.100</code></div>
              </div>
            </div>
          </div>

          {/* Form Settings & API Credentials */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Form Settings */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Paramètres de Profil</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Nom Complet</label>
                  <input type="text" className="glass-input" style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} value={user.fullName} readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Adresse Email</label>
                  <input type="email" className="glass-input" style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} value={user.email} readOnly />
                </div>
              </div>
            </div>

            {/* API Keys */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Clés d'API & Sécurité</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>Utilisez ce jeton pour authentifier vos requêtes ou robots d'audit SafeDock externes.</p>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type={user.showToken ? 'text' : 'password'} 
                  className="glass-input" 
                  style={{ flexGrow: 1, fontFamily: 'monospace', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem' }} 
                  value={user.apiToken} 
                  readOnly 
                />
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0 0.85rem', borderRadius: '8px' }}
                  onClick={() => setUser(prev => ({ ...prev, showToken: !prev.showToken }))}
                  type="button"
                >
                  <i className={`fa-solid ${user.showToken ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* Notifications Preferences */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Préférences de Notifications</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.emailAlerts} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, emailAlerts: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Alertes email instantanées</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>M'envoyer un email dès qu'une fuite de secret ou une faille critique est détectée.</span>
                  </div>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.criticalOnly} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, criticalOnly: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Uniquement les alertes critiques</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Filtrer les notifications par email pour ne garder que le niveau CRITICAL.</span>
                  </div>
                </label>
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
