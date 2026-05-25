import React, { useState } from 'react';

export default function AccountView() {
  const [user, setUser] = useState({
    username: 'Hell0W0rld',
    email: 'secops-admin@safedock.local',
    fullName: 'Jean SecOps',
    role: 'Administrateur Principal',
    organization: 'SafeDock Corp'
  });

  const [notificationSettings, setNotificationSettings] = useState({
    cveAlerts: true,
    statusChanges: true,
    deployments: false,
    secretLeaks: true,
    enableThreshold: true,
    minSeverity: 'CRITICAL'
  });

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSaveStatus('Enregistrement...');
    setTimeout(() => {
      setSaveStatus('✅ Vos préférences de compte ont été mises à jour !');
      setTimeout(() => setSaveStatus(''), 4000);
    }, 800);
  };

  return (
    <div id="view-account" className="page-view">
      <section className="section-container">
        
        {/* Header Title */}
        <div className="section-header" style={{ marginBottom: '1.5rem' }}>
          <h3>
            <i className="fa-solid fa-user-shield text-primary" style={{ marginRight: '0.5rem' }}></i>
            Mon Compte & Préférences SecOps
          </h3>
        </div>

        {/* Outer Layout Split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          
          {/* Left panel: Custom Profile Card */}
          <div className="glass" style={{ padding: '2rem 1.5rem', borderRadius: '12px', textAlign: 'center', height: 'fit-content' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px', margin: '0 auto 1.5rem auto' }}>
              <img 
                src="/avatar.png" 
                alt={user.fullName} 
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
                <div><span style={{ color: 'var(--text-secondary)' }}>Status SSO :</span> <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>Désactivé</span></div>
              </div>
            </div>
          </div>

          {/* Right panel: Restructured Cards Forms */}
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Section 1: La Partie Compte */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-address-card" style={{ fontSize: '1rem', color: 'var(--primary)' }}></i>
                La partie compte
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Nom Complet</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    value={user.fullName} 
                    onChange={e => setUser(prev => ({ ...prev, fullName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Adresse Email</label>
                  <input 
                    type="email" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    value={user.email} 
                    onChange={e => setUser(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Nom d'utilisateur</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    value={user.username} 
                    onChange={e => setUser(prev => ({ ...prev, username: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Organisation</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    value={user.organization} 
                    onChange={e => setUser(prev => ({ ...prev, organization: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 2: La Partie Sécurité */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-lock" style={{ fontSize: '1rem', color: 'var(--primary)' }}></i>
                La partie sécurité
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Nouveau mot de passe</label>
                  <input 
                    type="password" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    placeholder="••••••••••••"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>Confirmer le mot de passe</label>
                  <input 
                    type="password" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px' }} 
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {/* MFA Switch Toggle */}
              <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem' }}>Validation Double Facteur (2FA / TOTP)</strong>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sécuriser l'accès avec un code temporaire authentifié sur votre appareil mobile.</span>
                </div>
                <label className="switch-toggle">
                  <input 
                    type="checkbox" 
                    checked={mfaEnabled} 
                    onChange={e => setMfaEnabled(e.target.checked)} 
                  />
                  <span className="slider-toggle"></span>
                </label>
              </div>
            </div>

            {/* Section 3: La Partie Notifications */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-bell" style={{ fontSize: '1rem', color: 'var(--primary)' }}></i>
                La partie notifications
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
                Sélectionnez précisément les événements pour lesquels vous souhaitez être averti par e-mail et fixez vos seuils d'alertes.
              </p>
              
              {/* Event types checkboxes list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem', paddingLeft: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.cveAlerts} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, cveAlerts: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Alertes sur les failles de sécurité (CVE)</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.statusChanges} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, statusChanges: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Changements de statuts de conteneurs (Start/Stop)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.deployments} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, deployments: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Déploiements et Rollouts pivots effectués</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.secretLeaks} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, secretLeaks: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Fuites de secrets détectées (SecOps)</span>
                </label>
              </div>

              {/* Gravity Threshold Configuration */}
              <div className="glass" style={{ padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={notificationSettings.enableThreshold} 
                    onChange={e => setNotificationSettings(prev => ({ ...prev, enableThreshold: e.target.checked }))} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Filtrer par niveau de criticité minimum</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vous ne recevrez que les alertes de ce niveau de gravité ou plus élevé.</span>
                  </div>
                </label>

                {notificationSettings.enableThreshold && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', animation: 'fadeIn 0.2s ease-in' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Niveau seuil minimum</label>
                    <select 
                      value={notificationSettings.minSeverity} 
                      onChange={e => setNotificationSettings(prev => ({ ...prev, minSeverity: e.target.value }))}
                      className="glass-input"
                      style={{ cursor: 'pointer', fontWeight: 600 }}
                    >
                      <option value="CRITICAL">CRITICAL (Alertes critiques uniquement)</option>
                      <option value="HIGH">HIGH (Critique et Haute gravité)</option>
                      <option value="MEDIUM">MEDIUM (Critique, Haute et Moyenne)</option>
                      <option value="LOW">LOW (Toutes les alertes, même basses)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Form Footer Save Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{saveStatus}</span>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1.75rem', borderRadius: '8px' }}>
                <i className="fa-solid fa-save"></i>
                <span style={{ marginLeft: '0.4rem' }}>Enregistrer les préférences</span>
              </button>
            </div>

          </form>
        </div>
      </section>
    </div>
  );
}
