import React, { useState, useEffect } from 'react';

export default function SettingsView({ 
  config, 
  registries, 
  overrides, 
  containers, 
  onSaveGlobalSettings, 
  onAddRegistry, 
  onDeleteRegistry, 
  onSaveOverride, 
  onDeleteOverride 
}) {
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

  // Registry addition inputs
  const [regServer, setRegServer] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');

  // Override addition inputs
  const [targetContainer, setTargetContainer] = useState('');
  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');

  // Save status msg
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (config) {
      setSeverity(config.cve_severity_threshold || 'HIGH');
      setAllowRoot(config.allow_root_user || false);
      setAllowPrivileged(config.allow_privileged_mode || false);
      
      setSmtpHost(config.smtp_host || '');
      setSmtpPort(config.smtp_port !== undefined ? String(config.smtp_port) : '');
      setSmtpUser(config.smtp_username || '');
      setSmtpPass(''); // Keep blank for security
      setSmtpFrom(config.smtp_from || '');
      setSmtpTo(config.smtp_to || '');
      setSmtpTlsSkip(config.smtp_skip_tls_verify || false);
    }
  }, [config]);

  const handleGlobalSubmit = (e) => {
    e.preventDefault();
    setSaveStatus('Enregistrement...');
    
    const settingsData = {
      cve_severity_threshold: severity,
      allow_root_user: allowRoot,
      allow_privileged_mode: allowPrivileged,
      smtp_host: smtpHost,
      smtp_port: smtpPort ? parseInt(smtpPort, 10) : 0,
      smtp_username: smtpUser,
      smtp_password: smtpPass,
      smtp_from: smtpFrom,
      smtp_to: smtpTo,
      smtp_skip_tls_verify: smtpTlsSkip
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
    });
  };

  const handleOverrideSubmit = (e) => {
    e.preventDefault();
    if (!targetContainer) return;
    
    // Parse helper
    const allowRootVal = ovrAllowRoot === '' ? null : ovrAllowRoot === 'true';
    const allowPrivilegeVal = ovrAllowPrivilege === '' ? null : ovrAllowPrivilege === 'true';

    onSaveOverride(targetContainer, ovrSeverity || '', allowRootVal, allowPrivilegeVal).then(() => {
      setTargetContainer('');
      setOvrSeverity('');
      setOvrAllowRoot('');
      setOvrAllowPrivilege('');
    });
  };

  return (
    <div id="view-settings" className="page-view">
      <div className="glass" style={{ padding: '2rem 2.5rem', borderRadius: '16px' }}>
        <div className="settings-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
          <div className="settings-title-area">
            <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-header)', fontWeight: 800 }}>
              <i className="fa-solid fa-shield-halved"></i> Configuration SecOps SafeDock
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Ajustez la sensibilité de la politique de sécurité globale et gérez les surcharges spécifiques.
            </p>
          </div>
        </div>
        
        <form onSubmit={handleGlobalSubmit} className="settings-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section SecOps */}
          <div className="settings-section">
            <h4>Seuils SecOps actifs</h4>
            <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Tolérance de sévérité des failles CVE
                </label>
                <select 
                  value={severity} 
                  onChange={(e) => setSeverity(e.target.value)} 
                  className="glass-input" 
                  style={{ fontWeight: 600, cursor: 'pointer' }}
                >
                  <option value="CRITICAL">CRITICAL (Bloque toutes les failles critiques)</option>
                  <option value="HIGH">HIGH (Bloque critiques et hautes - conseillé)</option>
                  <option value="MEDIUM">MEDIUM (Bloque critiques, hautes et moyennes)</option>
                  <option value="LOW">LOW (Bloque toutes les failles sauf info)</option>
                  <option value="NONE">NONE (Bloque toutes les failles, même mineures)</option>
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Autoriser l'utilisateur root</span>
                  <label className="switch-toggle">
                    <input 
                      type="checkbox" 
                      checked={allowRoot} 
                      onChange={(e) => setAllowRoot(e.target.checked)} 
                    />
                    <span className="slider-toggle"></span>
                  </label>
                </div>
                <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Autoriser le mode privilégié</span>
                  <label className="switch-toggle">
                    <input 
                      type="checkbox" 
                      checked={allowPrivileged} 
                      onChange={(e) => setAllowPrivileged(e.target.checked)} 
                    />
                    <span className="slider-toggle"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Section SMTP */}
          <div className="settings-section">
            <h4>Serveur d'alerte SMTP</h4>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Hôte du serveur SMTP
                </label>
                <input 
                  type="text" 
                  placeholder="smtp.domain.com" 
                  className="glass-input" 
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Port SMTP
                </label>
                <input 
                  type="number" 
                  placeholder="587" 
                  className="glass-input" 
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                />
              </div>
            </div>
            
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Utilisateur SMTP
                </label>
                <input 
                  type="text" 
                  placeholder="user@domain.com" 
                  className="glass-input" 
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Mot de passe SMTP
                </label>
                <input 
                  type="password" 
                  placeholder="•••••••• (inchangé)" 
                  className="glass-input" 
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Expéditeur de l'alerte
                </label>
                <input 
                  type="email" 
                  placeholder="alerts@safedock.local" 
                  className="glass-input" 
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Destinataire de l'alerte
                </label>
                <input 
                  type="email" 
                  placeholder="admin@domain.com" 
                  className="glass-input" 
                  value={smtpTo}
                  onChange={(e) => setSmtpTo(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group-checkbox glass" style={{ display: 'flex', alignItems: 'center', justifySpaceBetween: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '1rem', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ignorer la vérification TLS (STARTTLS)</span>
              <label className="switch-toggle">
                <input 
                  type="checkbox" 
                  checked={smtpTlsSkip} 
                  onChange={(e) => setSmtpTlsSkip(e.target.checked)} 
                />
                <span className="slider-toggle"></span>
              </label>
            </div>
          </div>

          {/* Section Registries */}
          <div className="settings-section" onClick={(e) => e.stopPropagation()}>
            <h4>Comptes de registres Docker privés</h4>
            
            {/* List credentials */}
            <div id="settings-registries-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {registries.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun registre privé configuré.</div>
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
                      onClick={() => onDeleteRegistry(reg.server_address)}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Registration Form */}
            <div className="glass" style={{ padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <strong style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-plus-circle"></i> Associer un registre privé</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  placeholder="registry.gitlab.com" 
                  className="glass-input" 
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                  value={regServer}
                  onChange={(e) => setRegServer(e.target.value)}
                />
                <input 
                  type="text" 
                  placeholder="user-deploy" 
                  className="glass-input" 
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                  value={regUser}
                  onChange={(e) => setRegUser(e.target.value)}
                />
                <input 
                  type="password" 
                  placeholder="Token / Pass" 
                  className="glass-input" 
                  style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
              </div>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '6px', alignSelf: 'flex-end' }}
                onClick={handleRegistrySubmit}
              >
                <i className="fa-solid fa-key"></i> Enregistrer les identifiants
              </button>
            </div>
          </div>

          {/* Section Overrides */}
          <div className="settings-section" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginBottom: '0.5rem' }}>Surcharges de sécurité spécifiques par conteneur</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Configurez des règles particulières pour certains conteneurs afin de surcharger les seuils globaux ci-dessus.
            </p>
            
            {/* List overrides */}
            <div className="glass" style={{ padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 700, height: '30px' }}>
                    <th style={{ padding: '0.5rem' }}>Nom du conteneur</th>
                    <th style={{ padding: '0.5rem' }}>Tolérance CVE</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Autoriser root</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Autoriser privilégié</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(overrides).length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Aucune surcharge active.
                      </td>
                    </tr>
                  ) : (
                    Object.keys(overrides).map(name => {
                      const ovr = overrides[name];
                      return (
                        <tr key={name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>{name}</td>
                          <td style={{ padding: '0.5rem' }}>{ovr.cve_severity_threshold || <span style={{ color: 'var(--text-muted)' }}>Hériter</span>}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            {ovr.allow_root_user === null ? '-' : ovr.allow_root_user ? 'Oui' : 'Non'}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            {ovr.allow_privileged_mode === null ? '-' : ovr.allow_privileged_mode ? 'Oui' : 'Non'}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            <button 
                              type="button" 
                              className="btn btn-accent" 
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', borderRadius: '6px' }}
                              onClick={() => onDeleteOverride(name)}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Creation Form */}
            <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <strong style={{ fontSize: '0.85rem' }}><i className="fa-solid fa-plus-circle"></i> Ajouter ou modifier une surcharge</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '1rem', alignItems: 'end' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Conteneur</label>
                  <select 
                    value={targetContainer}
                    onChange={(e) => setTargetContainer(e.target.value)}
                    className="glass-input" 
                    style={{ fontSize: '0.75rem', padding: '0.5rem', cursor: 'pointer', height: '35px' }}
                  >
                    <option value="">-- Sélectionner un conteneur --</option>
                    {containers.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tolérance CVE</label>
                  <select 
                    value={ovrSeverity}
                    onChange={(e) => setOvrSeverity(e.target.value)}
                    className="glass-input" 
                    style={{ fontSize: '0.75rem', padding: '0.5rem', cursor: 'pointer', height: '35px' }}
                  >
                    <option value="">Hériter de la globale</option>
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                    <option value="NONE">NONE</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Autoriser root</label>
                  <select 
                    value={ovrAllowRoot}
                    onChange={(e) => setOvrAllowRoot(e.target.value)}
                    className="glass-input" 
                    style={{ fontSize: '0.75rem', padding: '0.5rem', cursor: 'pointer', height: '35px' }}
                  >
                    <option value="">Hériter de la globale</option>
                    <option value="true">Autorisé</option>
                    <option value="false">Interdit</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Autoriser privilégié</label>
                  <select 
                    value={ovrAllowPrivilege}
                    onChange={(e) => setOvrAllowPrivilege(e.target.value)}
                    className="glass-input" 
                    style={{ fontSize: '0.75rem', padding: '0.5rem', cursor: 'pointer', height: '35px' }}
                  >
                    <option value="">Hériter de la globale</option>
                    <option value="true">Autorisé</option>
                    <option value="false">Interdit</option>
                  </select>
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', borderRadius: '6px', alignSelf: 'flex-end', height: '35px' }}
                onClick={handleOverrideSubmit}
              >
                <i className="fa-solid fa-save"></i> Enregistrer la surcharge
              </button>
            </div>
          </div>

          {/* Documentation Section */}
          <div className="settings-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
            <h4 style={{ marginBottom: '0.75rem' }}>Documentation explicative des règles de sécurité</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px' }}>
                <h5 style={{ color: 'var(--warning)', marginBottom: '0.5rem', fontSize: '0.85rem' }}><i className="fa-solid fa-user-shield"></i> Autoriser root & mode privilégié</h5>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Par défaut, exécuter des conteneurs en tant qu'utilisateur <code>root</code> ou avec les privilèges de l'hôte (<code>privileged</code>) représente un risque majeur d'élévation de privilèges en cas de faille ou d'évasion de conteneur.
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '0.5rem' }}>
                  <strong>Comportement SafeDock :</strong> Si vous choisissez d'autoriser ces options (soit de manière globale, soit par conteneur spécifique), SafeDock n'élèvera pas d'alertes bloquantes et n'interdira pas les déploiements de mises à jour automatiques. Cependant, pour préserver votre visibilité de SecOps, SafeDock affichera toujours un avertissement de score sur votre tableau de bord.
                </p>
              </div>
              <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px' }}>
                <h5 style={{ color: 'var(--info)', marginBottom: '0.5rem', fontSize: '0.85rem' }}><i className="fa-solid fa-key"></i> Comptes de registres Docker privés</h5>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Pour vérifier la disponibilité de mises à jour, SafeDock interroge le registre distant de chaque conteneur pour en récupérer le <code>Digest SHA256</code> immuable de l'image.
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '0.5rem' }}>
                  <strong>Utilité de la configuration :</strong> Si vous déployez des images d'entreprise hébergées sur des registres privés (GitLab Registry, AWS ECR, Docker Hub privé), SafeDock aura besoin d'identifiants d'authentification pour interroger ces registres de manière sécurisée sans retourner d'erreur <code>401 Unauthorized</code> ou bloquer les flux d'audits automatiques.
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1rem', alignItems: 'center' }}>
            <span id="settings-save-status" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', fontWeight: 600 }}>{saveStatus}</span>
            <button type="submit" className="btn btn-accent" id="btn-save-settings-submit"><i class="fa-solid fa-save"></i> Enregistrer les paramètres globaux</button>
          </div>
        </form>
      </div>
    </div>
  );
}
