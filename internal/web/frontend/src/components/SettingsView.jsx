import React, { useState, useEffect } from 'react';

export default function SettingsView({ 
  config, 
  registries, 
  onSaveGlobalSettings, 
  onAddRegistry, 
  onDeleteRegistry 
}) {
  const [activeTab, setActiveTab] = useState('smtp');

  // Global settings inputs
  const [severity, setSeverity] = useState('HIGH');
  const [allowRoot, setAllowRoot] = useState(false);
  const [allowPrivileged, setAllowPrivileged] = useState(false);

  // SMTP Settings inputs
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTo, setSmtpTo] = useState('');
  const [smtpTlsSkip, setSmtpTlsSkip] = useState(false);

  // General Preferences inputs
  const [pollInterval, setPollInterval] = useState('10');
  const [defaultView, setDefaultView] = useState('dashboard');
  const [uiLanguage, setUiLanguage] = useState('fr');

  // Registry addition inputs
  const [regServer, setRegServer] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');

  // Mock Multi-Host Agents list
  const [agents, setAgents] = useState([
    { name: 'prod-swarm-01', ip: '192.168.1.90', status: 'connected', version: 'v0.9.5' },
    { name: 'db-node-02', ip: '192.168.1.91', status: 'connected', version: 'v0.9.5' },
    { name: 'stage-aws-us-east', ip: '10.0.4.15', status: 'connected', version: 'v0.9.5' },
    { name: 'edge-node-02', ip: '192.168.1.95', status: 'offline', version: 'v0.9.3' }
  ]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentIp, setNewAgentIp] = useState('');

  // Mock Users list
  const [users, setUsers] = useState([
    { username: 'Hell0W0rld', email: 'secops-admin@safedock.local', role: 'Administrateur' },
    { username: 'Reader01', email: 'reader@safedock.local', role: 'Lecteur' },
    { username: 'AuditBot', email: 'bot@safedock.local', role: 'Auditeur SecOps' }
  ]);
  const [newUsername, setNewUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('Lecteur');

  // Save status msg
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (config) {
      setSeverity(config.SecOps?.MaxSeverityAllowed || 'HIGH');
      setAllowRoot(config.SecOps?.AllowRoot || false);
      setAllowPrivileged(config.SecOps?.AllowPrivileged || false);
      
      setSmtpHost(config.SMTP?.Host || '');
      setSmtpPort(config.SMTP?.Port !== undefined && config.SMTP?.Port !== null ? String(config.SMTP.Port) : '');
      setSmtpUser(config.SMTP?.User || '');
      setSmtpPass(''); // Keep blank for security
      setSmtpFrom(config.SMTP?.From || '');
      setSmtpTo(config.SMTP?.To || '');
      setSmtpTlsSkip(config.SMTP?.TLSSkipVerify || false);
    }
  }, [config]);

  const handleGlobalSubmit = (e) => {
    if (e) e.preventDefault();
    setSaveStatus('Enregistrement...');
    
    const settingsData = {
      secops_max_severity_allowed: severity,
      secops_allow_root: allowRoot,
      secops_allow_privileged: allowPrivileged,
      smtp_host: smtpHost,
      smtp_port: smtpPort ? parseInt(smtpPort, 10) : 0,
      smtp_user: smtpUser,
      smtp_password: smtpPass,
      smtp_from: smtpFrom,
      smtp_to: smtpTo,
      smtp_tls_skip_verify: smtpTlsSkip
    };

    onSaveGlobalSettings(settingsData)
      .then(() => {
        setSaveStatus('✅ Paramètres sauvegardés avec succès !');
        setTimeout(() => setSaveStatus(''), 4000);
      })
      .catch(err => {
        setSaveStatus('❌ Erreur de sauvegarde.');
        setTimeout(() => setSaveStatus(''), 4000);
      });
  };

  const handleRegistrySubmit = (e) => {
    e.preventDefault();
    if (!regServer || !regUser || !regPass) return;
    onAddRegistry(regServer, regUser, regPass).then(() => {
      setRegServer('');
      setRegUser('');
      setRegPass('');
      setSaveStatus('✅ Registre privé enregistré !');
      setTimeout(() => setSaveStatus(''), 4000);
    });
  };

  const handleAddAgent = (e) => {
    e.preventDefault();
    if (!newAgentName || !newAgentIp) return;
    setAgents(prev => [...prev, { name: newAgentName, ip: newAgentIp, status: 'connected', version: 'v0.9.5' }]);
    setNewAgentName('');
    setNewAgentIp('');
    setSaveStatus('✅ Agent hôte enregistré avec succès !');
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername || !newUserEmail) return;
    setUsers(prev => [...prev, { username: newUsername, email: newUserEmail, role: newUserRole }]);
    setNewUsername('');
    setNewUserEmail('');
    setNewUserRole('Lecteur');
    setSaveStatus('✅ Invitation utilisateur envoyée !');
    setTimeout(() => setSaveStatus(''), 4000);
  };

  return (
    <div id="view-settings" className="page-view">
      <div className="glass" style={{ padding: '2rem 2.5rem', borderRadius: '16px' }}>
        
        {/* Settings Title Area */}
        <div className="settings-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
          <div className="settings-title-area">
            <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-header)', fontWeight: 800 }}>
              <i className="fa-solid fa-sliders"></i> Configuration Globale de Sécurité
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Ajustez les seuils, configurez les connexions distantes, la messagerie et gérez les accès d'entreprise.
            </p>
          </div>
        </div>

        {/* Multi-Tab Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '2rem', minHeight: '380px' }}>
          
          {/* Sidebar Tab Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderRight: '1px solid var(--border-color)', paddingRight: '1rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', paddingLeft: '0.5rem', marginBottom: '0.25rem' }}>Paramètres de base</span>
            <button 
              className={`tab-btn ${activeTab === 'smtp' ? 'active' : ''}`}
              onClick={() => setActiveTab('smtp')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-envelope"></i> SMTP / Alertes
            </button>
            <button 
              className={`tab-btn ${activeTab === 'seuils' ? 'active' : ''}`}
              onClick={() => setActiveTab('seuils')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-shield-halved"></i> Seuils SecOps
            </button>
            <button 
              className={`tab-btn ${activeTab === 'prefs' ? 'active' : ''}`}
              onClick={() => setActiveTab('prefs')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-gear"></i> Préférences
            </button>

            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', paddingLeft: '0.5rem', marginTop: '1rem', marginBottom: '0.25rem' }}>Administration</span>
            <button 
              className={`tab-btn ${activeTab === 'registries' ? 'active' : ''}`}
              onClick={() => setActiveTab('registries')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-key"></i> Registres Privés
            </button>
            <button 
              className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-users"></i> Utilisateurs
            </button>
            <button 
              className={`tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-server"></i> Multi-Hôtes / Agents
            </button>
            <button 
              className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
              type="button"
            >
              <i className="fa-solid fa-building-shield"></i> Sécurité Entreprise
            </button>
          </div>

          {/* Form Content Pane */}
          <div style={{ paddingLeft: '0.5rem' }}>
            
            {/* TAB: SMTP */}
            {activeTab === 'smtp' && (
              <div>
                <h4 style={{ margin: '0 0 1.25rem 0' }}>Configuration du Serveur d'alerte SMTP</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hôte du serveur SMTP</label>
                    <input type="text" placeholder="smtp.domain.com" className="glass-input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Port SMTP</label>
                    <input type="number" placeholder="587" className="glass-input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Utilisateur SMTP</label>
                    <input type="text" placeholder="user@domain.com" className="glass-input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Mot de passe SMTP</label>
                    <input type="password" placeholder="•••••••• (inchangé)" className="glass-input" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expéditeur de l'alerte</label>
                    <input type="email" placeholder="alerts@safedock.local" className="glass-input" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Destinataire de l'alerte</label>
                    <input type="email" placeholder="admin@domain.com" className="glass-input" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
                  </div>
                </div>

                <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ignorer la vérification TLS (STARTTLS)</span>
                  <label className="switch-toggle">
                    <input type="checkbox" checked={smtpTlsSkip} onChange={(e) => setSmtpTlsSkip(e.target.checked)} />
                    <span className="slider-toggle"></span>
                  </label>
                </div>

                <button type="button" className="btn btn-accent" onClick={handleGlobalSubmit} style={{ alignSelf: 'flex-end', height: '35px' }}>
                  <i className="fa-solid fa-save"></i> Enregistrer SMTP
                </button>
              </div>
            )}

            {/* TAB: SEUILS */}
            {activeTab === 'seuils' && (
              <div>
                <h4 style={{ margin: '0 0 1.25rem 0' }}>Seuils de tolérance SecOps globaux</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tolérance de sévérité des failles CVE globale</label>
                    <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="glass-input" style={{ fontWeight: 600, cursor: 'pointer' }}>
                      <option value="CRITICAL">CRITICAL (Bloque toutes les failles critiques)</option>
                      <option value="HIGH">HIGH (Bloque critiques et hautes)</option>
                      <option value="MEDIUM">MEDIUM (Bloque critiques, hautes et moyennes)</option>
                      <option value="LOW">LOW (Bloque toutes les failles sauf info)</option>
                      <option value="NONE">NONE (Bloque toutes les failles, même mineures)</option>
                    </select>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Autoriser l'utilisateur root</span>
                      <label className="switch-toggle">
                        <input type="checkbox" checked={allowRoot} onChange={(e) => setAllowRoot(e.target.checked)} />
                        <span className="slider-toggle"></span>
                      </label>
                    </div>
                    <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Autoriser le mode privilégié</span>
                      <label className="switch-toggle">
                        <input type="checkbox" checked={allowPrivileged} onChange={(e) => setAllowPrivileged(e.target.checked)} />
                        <span className="slider-toggle"></span>
                      </label>
                    </div>
                  </div>
                </div>

                <button type="button" className="btn btn-accent" onClick={handleGlobalSubmit} style={{ alignSelf: 'flex-end', height: '35px' }}>
                  <i className="fa-solid fa-save"></i> Enregistrer les seuils globaux
                </button>
              </div>
            )}

            {/* TAB: PREFERENCES */}
            {activeTab === 'prefs' && (
              <div>
                <h4 style={{ margin: '0 0 1.25rem 0' }}>Préférences générales de l'application</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Intervalle de rafraîchissement d'audit en tâche de fond (Secondes)</label>
                    <select value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} className="glass-input">
                      <option value="5">5 secondes (Temps réel extrême)</option>
                      <option value="10">10 secondes (Défaut SecOps)</option>
                      <option value="30">30 secondes</option>
                      <option value="60">60 secondes (Optimal hôtes limités)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Page d'atterrissage par défaut</label>
                    <select value={defaultView} onChange={(e) => setDefaultView(e.target.value)} className="glass-input">
                      <option value="dashboard">Dashboard principal</option>
                      <option value="containers">Statuts des conteneurs</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Langue de l'interface (UI)</label>
                    <select value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value)} className="glass-input">
                      <option value="fr">Français (Défaut)</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>

                <button type="button" className="btn btn-accent" onClick={() => {
                  setSaveStatus('✅ Préférences enregistrées !');
                  setTimeout(() => setSaveStatus(''), 3000);
                }} style={{ alignSelf: 'flex-end', height: '35px' }}>
                  <i className="fa-solid fa-save"></i> Enregistrer les préférences
                </button>
              </div>
            )}

            {/* TAB: REGISTRIES */}
            {activeTab === 'registries' && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Comptes de registres Docker privés</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Associez vos accès sécurisés pour les analyses de tags privés et de digests SHA256.</p>
                
                {/* List credentials */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  {registries.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>Aucun registre privé configuré.</div>
                  ) : (
                    registries.map(reg => (
                      <div key={reg.id} className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.8rem' }}>
                          <strong style={{ color: 'var(--primary)' }}>{reg.server_address}</strong> 
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({reg.username})</span>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-accent" 
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '6px' }}
                          onClick={() => onDeleteRegistry(reg.id)}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Registration Form */}
                <form onSubmit={handleRegistrySubmit} className="glass" style={{ padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-plus-circle"></i> Associer un registre privé</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '0.5rem' }}>
                    <input type="text" placeholder="registry.gitlab.com" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={regServer} onChange={(e) => setRegServer(e.target.value)} required />
                    <input type="text" placeholder="user-deploy" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={regUser} onChange={(e) => setRegUser(e.target.value)} required />
                    <input type="password" placeholder="Token / Pass" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={regPass} onChange={(e) => setRegPass(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '6px', alignSelf: 'flex-end' }}>
                    <i className="fa-solid fa-key"></i> Enregistrer les identifiants
                  </button>
                </form>
              </div>
            )}

            {/* TAB: USERS */}
            {activeTab === 'users' && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Gestion des Utilisateurs SecOps</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Gérez les privilèges d'accès et invitez de nouveaux auditeurs dans l'espace SafeDock.</p>
                
                {/* Users List Table */}
                <div className="glass" style={{ padding: '0.75rem', borderRadius: '12px', marginBottom: '1.25rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        <th style={{ padding: '0.5rem' }}>Identifiant</th>
                        <th style={{ padding: '0.5rem' }}>Adresse Email</th>
                        <th style={{ padding: '0.5rem' }}>Rôle de Sécurité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.username} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                          <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{u.username}</td>
                          <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace' }}>{u.email}</td>
                          <td style={{ padding: '0.6rem 0.5rem' }}>
                            <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', fontWeight: 'bold' }}>{u.role}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add User Form */}
                <form onSubmit={handleAddUser} className="glass" style={{ padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-plus-circle"></i> Inviter un nouvel utilisateur</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr', gap: '0.5rem' }}>
                    <input type="text" placeholder="Nom de l'utilisateur" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
                    <input type="email" placeholder="email@domain.com" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                    <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="glass-input" style={{ fontSize: '0.75rem', height: '32px', cursor: 'pointer' }}>
                      <option value="Lecteur">Lecteur</option>
                      <option value="Auditeur SecOps">Auditeur SecOps</option>
                      <option value="Administrateur">Administrateur</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '6px', alignSelf: 'flex-end' }}>
                    <i className="fa-solid fa-paper-plane"></i> Envoyer l'invitation
                  </button>
                </form>
              </div>
            )}

            {/* TAB: AGENTS */}
            {activeTab === 'agents' && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Gestion des Hôtes de Multi-Hébergement (Agents)</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Associez vos agents daemon distants pour surveiller plusieurs hôtes Docker en temps réel.</p>
                
                {/* Agents List Table */}
                <div className="glass" style={{ padding: '0.75rem', borderRadius: '12px', marginBottom: '1.25rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        <th style={{ padding: '0.5rem' }}>Hôte</th>
                        <th style={{ padding: '0.5rem' }}>Adresse IP</th>
                        <th style={{ padding: '0.5rem' }}>Statut de connexion</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map(a => (
                        <tr key={a.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                          <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>
                            <i className="fa-solid fa-server" style={{ marginRight: '0.4rem', color: 'var(--primary)', fontSize: '0.75rem' }}></i>
                            {a.name}
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace' }}>{a.ip}</td>
                          <td style={{ padding: '0.6rem 0.5rem' }}>
                            <span className="status-indicator online" style={{ fontSize: '0.75rem', color: a.status === 'connected' ? 'var(--success)' : 'var(--danger)' }}>
                              <span className="pulse-dot" style={{ backgroundColor: a.status === 'connected' ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 8px ${a.status === 'connected' ? 'var(--success)' : 'var(--danger)'}` }}></span>
                              {a.status === 'connected' ? 'Connecté' : 'Hors ligne'}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{a.version}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Agent Form */}
                <form onSubmit={handleAddAgent} className="glass" style={{ padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-plus-circle"></i> Enrôler un nouvel agent hôte</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input type="text" placeholder="Nom de l'hôte (ex: edge-node-03)" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} required />
                    <input type="text" placeholder="Adresse IP (ex: 192.168.1.96)" className="glass-input" style={{ fontSize: '0.75rem', padding: '0.5rem' }} value={newAgentIp} onChange={(e) => setNewAgentIp(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '6px', alignSelf: 'flex-end' }}>
                    <i className="fa-solid fa-server"></i> Connecter l'Agent
                  </button>
                </form>
              </div>
            )}

            {/* TAB: SECURITY */}
            {activeTab === 'security' && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Paramètres de Sécurité Globale d'Entreprise</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Configurez le contrôle d'accès d'identité (SSO/MFA) et la matrice RBAC globale.</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h5 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>Authentification unique SAML / SSO</h5>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Intégrez SafeDock avec votre fournisseur d'identité (Okta, Azure AD).</p>
                    </div>
                    <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontSize: '0.65rem', padding: '0.15rem 0.4rem', fontWeight: 'bold' }}>Désactivé</span>
                  </div>

                  <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h5 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>Validation Double Facteur (MFA)</h5>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Forcez l'utilisation de TOTP pour l'authentification.</p>
                    </div>
                    <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', fontSize: '0.65rem', padding: '0.15rem 0.4rem', fontWeight: 'bold' }}>Désactivé</span>
                  </div>
                </div>

                {/* RBAC matrix */}
                <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px' }}>
                  <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Aperçu de la Matrice RBAC</strong>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Permission</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Lecteur</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Auditeur</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>Visualiser les métriques</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>Lancer des audits</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>Gérer les configurations</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-xmark text-muted"></i></td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><i className="fa-solid fa-circle-check text-success"></i></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Global Save Status Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '2rem', alignItems: 'center' }}>
          <span id="settings-save-status" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', fontWeight: 600 }}>{saveStatus}</span>
        </div>

      </div>
    </div>
  );
}
