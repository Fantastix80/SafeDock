import React, { useState, useEffect } from 'react';

export default function ContainerDetailView({ 
  containerId, 
  containers, 
  overrides, 
  onSaveOverride, 
  onDeleteOverride, 
  onTriggerRollout, 
  isRolloutLoading, 
  rolloutStatusMsg, 
  onNavigate 
}) {
  const container = containers.find(c => c.id === containerId);
  const [activeTab, setActiveTab] = useState('trivy');

  // Trivy state
  const [trivyReport, setTrivyReport] = useState(null);
  const [trivyLoading, setTrivyLoading] = useState(false);
  const [trivyError, setTrivyError] = useState('');

  // Dockle state
  const [dockleReport, setDockleReport] = useState(null);
  const [dockleLoading, setDockleLoading] = useState(false);
  const [dockleError, setDockleError] = useState('');

  // Surcharges Settings Inputs
  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // 1. Fetch Trivy Scan
  const fetchTrivy = () => {
    if (!containerId) return;
    setTrivyLoading(true);
    setTrivyError('');
    fetch(`/api/containers/${containerId}/trivy`)
      .then(res => {
        if (!res.ok) throw new Error("Erreur de scan Trivy");
        return res.json();
      })
      .then(data => setTrivyReport(data))
      .catch(err => setTrivyError(err.message))
      .finally(() => setTrivyLoading(false));
  };

  // 2. Fetch Dockle Scan
  const fetchDockle = () => {
    if (!containerId) return;
    setDockleLoading(true);
    setDockleError('');
    fetch(`/api/containers/${containerId}/dockle`)
      .then(res => {
        if (!res.ok) throw new Error("Erreur de scan Dockle");
        return res.json();
      })
      .then(data => setDockleReport(data))
      .catch(err => setDockleError(err.message))
      .finally(() => setDockleLoading(false));
  };

  // Trigger loading reports on mount / container change
  useEffect(() => {
    if (container) {
      fetchTrivy();
      fetchDockle();
    }
  }, [containerId]);

  // Load current overrides
  useEffect(() => {
    if (container) {
      const ovr = overrides[container.name];
      if (ovr) {
        setOvrSeverity(ovr.cve_severity_threshold || '');
        setOvrAllowRoot(ovr.allow_root_user === null ? '' : String(ovr.allow_root_user));
        setOvrAllowPrivilege(ovr.allow_privileged_mode === null ? '' : String(ovr.allow_privileged_mode));
      } else {
        setOvrSeverity('');
        setOvrAllowRoot('');
        setOvrAllowPrivilege('');
      }
    }
  }, [overrides, container]);

  if (!container) {
    return (
      <div className="page-view" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>
          <h4>Conteneur non sélectionné ou inactif</h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Veuillez retourner sur la liste des conteneurs actifs.</p>
          <button className="btn btn-secondary" onClick={() => onNavigate('containers')}>
            Retour aux conteneurs
          </button>
        </div>
      </div>
    );
  }

  const handleSaveOverrideLocal = () => {
    setSaveStatus('Enregistrement...');
    const allowRootVal = ovrAllowRoot === '' ? null : ovrAllowRoot === 'true';
    const allowPrivilegeVal = ovrAllowPrivilege === '' ? null : ovrAllowPrivilege === 'true';

    onSaveOverride(container.name, ovrSeverity, allowRootVal, allowPrivilegeVal)
      .then(() => {
        setSaveStatus('✅ Paramètres sauvegardés !');
        setTimeout(() => setSaveStatus(''), 4000);
      })
      .catch(() => {
        setSaveStatus('❌ Erreur d\'enregistrement.');
        setTimeout(() => setSaveStatus(''), 4000);
      });
  };

  const handleDeleteOverrideLocal = () => {
    setSaveStatus('Suppression...');
    onDeleteOverride(container.name)
      .then(() => {
        setOvrSeverity('');
        setOvrAllowRoot('');
        setOvrAllowPrivilege('');
        setSaveStatus('🗑️ Surcharge supprimée (Héritage actif) !');
        setTimeout(() => setSaveStatus(''), 4000);
      })
      .catch(() => {
        setSaveStatus('❌ Erreur de suppression.');
        setTimeout(() => setSaveStatus(''), 4000);
      });
  };

  const hasOverride = !!overrides[container.name];
  const grade = container.grade ? container.grade.toLowerCase() : 'f';
  let scoreClass = 'score-a';
  if (container.score < 50) scoreClass = 'score-f';
  else if (container.score < 75) scoreClass = 'score-c';

  return (
    <div id="view-container-detail" className="page-view">
      <section className="section-container">
        
        {/* Header with back button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => onNavigate('containers')}
            type="button"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>Retour</span>
          </button>
          <div>
            <h3 style={{ margin: 0 }}>Cockpit de Sécurité Individuelle</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nom de la machine : <strong>{container.host_name}</strong></span>
          </div>
        </div>

        {/* Cockpit Split Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          
          {/* Left Panel: Container Summary Cockpit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Main Score and Status Card */}
            <div className="glass" style={{ padding: '2rem 1.5rem', borderRadius: '12px', textAlign: 'center', height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div className={`card-badge-score ${scoreClass}`} style={{ width: '80px', height: '80px', fontSize: '2.5rem', borderRadius: '16px' }}>
                  {container.grade || 'F'}
                </div>
              </div>

              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>{container.name}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', margin: '0.25rem 0 1rem 0' }}>
                {container.image_name}:{container.image_tag}
              </span>

              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1.5rem', paddingTop: '1.25rem', textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.6rem' }}>Évaluation des Règles</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Digest Immuable :</span>
                    <span className={`badge ${container.tag_pinned ? 'badge-success' : 'badge-danger'}`} style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>
                      {container.tag_pinned ? 'Conforme' : 'Défaut'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Non-Root User :</span>
                    <span className={`badge ${container.non_root ? 'badge-success' : 'badge-danger'}`} style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>
                      {container.non_root ? 'Conforme' : 'Défaut'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Mode Privilégié :</span>
                    <span className={`badge ${container.privileged_safe ? 'badge-success' : 'badge-warning'}`} style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>
                      {container.privileged_safe ? 'Sécurisé' : 'Vulnérable'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Secrets fuités :</span>
                    {container.secret_leaks && container.secret_leaks.length > 0 ? (
                      <span className="badge badge-danger" style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>
                        {container.secret_leaks.length} fuite(s)
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>0 fuites</span>
                    )}
                  </div>
                </div>
              </div>

              {/* General details list */}
              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1.5rem', paddingTop: '1.25rem', textAlign: 'left', fontSize: '0.8rem', lineHeight: '1.4' }}>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Identifiants système</span>
                <div><span style={{ color: 'var(--text-secondary)' }}>Container ID :</span> <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{container.id}</code></div>
                <div style={{ marginTop: '0.25rem' }}><span style={{ color: 'var(--text-secondary)' }}>SHA256 :</span> <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{container.current_digest || '-'}</code></div>
              </div>
            </div>

          </div>

          {/* Right Panel: Cockpit Tabs */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            
            {/* Segments/Tabs selector */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
              <button 
                className={`tab-btn ${activeTab === 'trivy' ? 'active' : ''}`}
                onClick={() => setActiveTab('trivy')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-bug"></i> Sûreté (Trivy CVEs)
              </button>
              <button 
                className={`tab-btn ${activeTab === 'dockle' ? 'active' : ''}`}
                onClick={() => setActiveTab('dockle')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-list-check"></i> Conformité (Dockle)
              </button>
              <button 
                className={`tab-btn ${activeTab === 'lifecycle' ? 'active' : ''}`}
                onClick={() => setActiveTab('lifecycle')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-arrows-spin"></i> Cycle de vie & Pivot
              </button>
              <button 
                className={`tab-btn ${activeTab === 'overrides' ? 'active' : ''}`}
                onClick={() => setActiveTab('overrides')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-sliders"></i> Surcharges SecOps
              </button>
            </div>

            {/* Tab content renders */}
            <div>
              
              {/* TAB: TRIVY CVEs */}
              {activeTab === 'trivy' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Rapport de Vulnérabilités (Trivy CLI Scan)</h4>
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }} onClick={fetchTrivy} disabled={trivyLoading}>
                      <i className={`fa-solid fa-arrows-rotate ${trivyLoading ? 'fa-spin' : ''}`}></i>
                      <span style={{ marginLeft: '0.4rem' }}>Rescanner</span>
                    </button>
                  </div>

                  {trivyLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Scan de vulnérabilités en cours d'exécution...</p>
                    </div>
                  ) : trivyError ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem', border: '1px dashed var(--danger)', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <i className="fa-solid fa-circle-exclamation"></i> Échec du scan : {trivyError}
                    </div>
                  ) : !trivyReport || !trivyReport.vulnerabilities || trivyReport.vulnerabilities.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid var(--success)', borderRadius: '8px' }}>
                      <i className="fa-solid fa-shield-halved" style={{ fontSize: '2.5rem', color: 'var(--success)', marginBottom: '0.85rem' }}></i>
                      <h4 style={{ color: 'var(--success)', margin: '0 0 0.25rem 0' }}>Aucune faille détectée</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>L'analyse Trivy ne relève aucune vulnérabilité connue sur cette image !</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '350px', overflowY: 'auto' }}>
                      {trivyReport.vulnerabilities.map((v, i) => (
                        <div key={i} className="glass" style={{ padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{v.vulnerability_id || 'CVE-ID'}</strong>
                            <span className={`badge ${v.severity === 'CRITICAL' || v.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {v.severity}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{v.description || 'Aucune description fournie.'}</div>
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', display: 'flex', gap: '1rem', color: 'var(--text-muted)' }}>
                            <span>Paquet : <code>{v.pkg_name} ({v.installed_version})</code></span>
                            {v.fixed_version && <span style={{ color: 'var(--success)' }}>Correctif : <code>{v.fixed_version}</code></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: DOCKLE COMPLIANCE */}
              {activeTab === 'dockle' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Rapport de conformité d'image (Dockle Linter)</h4>
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }} onClick={fetchDockle} disabled={dockleLoading}>
                      <i className={`fa-solid fa-arrows-rotate ${dockleLoading ? 'fa-spin' : ''}`}></i>
                      <span style={{ marginLeft: '0.4rem' }}>Rescanner</span>
                    </button>
                  </div>

                  {dockleLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Audit de conformité Dockle en cours...</p>
                    </div>
                  ) : dockleError ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem', border: '1px dashed var(--danger)', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <i className="fa-solid fa-circle-exclamation"></i> Échec Dockle : {dockleError}
                    </div>
                  ) : !dockleReport || !dockleReport.assessments || dockleReport.assessments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid var(--success)', borderRadius: '8px' }}>
                      <i className="fa-solid fa-circle-check" style={{ fontSize: '2.5rem', color: 'var(--success)', marginBottom: '0.85rem' }}></i>
                      <h4 style={{ color: 'var(--success)', margin: '0 0 0.25rem 0' }}>Conformité d'image parfaite</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aucun problème de structure, d'utilisateur root ou de secrets n'a été détecté dans les couches de l'image !</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '350px', overflowY: 'auto' }}>
                      {dockleReport.assessments.map((a, i) => (
                        <div key={i} className="glass" style={{ padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Code : <code>{a.code || 'DKL_RULE'}</code></strong>
                            <span className="badge" style={{ backgroundColor: a.level === 'FATAL' || a.level === 'WARN' ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255, 255, 255, 0.03)', color: a.level === 'FATAL' || a.level === 'WARN' ? 'var(--warning)' : 'var(--text-secondary)', fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {a.level}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{a.message || 'Règle enfreinte.'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: LIFECYCLE ACTIONS */}
              {activeTab === 'lifecycle' && (
                <div>
                  <h4 style={{ marginBottom: '1rem' }}>Pivot de déploiement et cycle de vie</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                    Le pivotement de cycle de vie de SafeDock vous permet de remplacer et de recréer de manière transactionnelle un conteneur déployé par sa dernière version de sécurité saine.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Déclencher le pivot pivotement (Rollout)</strong>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Rechercher une mise à jour, valider les règles SecOps et recréer le conteneur.</span>
                      </div>
                      
                      <button 
                        className={`btn btn-primary ${isRolloutLoading ? 'disabled' : ''}`}
                        onClick={() => onTriggerRollout(container.id, container.name)}
                        disabled={isRolloutLoading}
                        style={{ padding: '0.6rem 1.25rem', borderRadius: '8px' }}
                        type="button"
                      >
                        {isRolloutLoading ? (
                          <i className="fa-solid fa-circle-notch fa-spin"></i>
                        ) : (
                          <i className="fa-solid fa-rotate"></i>
                        )}
                        <span style={{ marginLeft: '0.4rem' }}>Lancer le Pivot</span>
                      </button>
                    </div>

                    {rolloutStatusMsg && rolloutStatusMsg.text && (
                      <div className={`glass`} style={{ padding: '1rem', borderRadius: '10px', border: `1px solid ${rolloutStatusMsg.type === 'error' ? 'var(--danger)' : 'var(--success)'}`, backgroundColor: rolloutStatusMsg.type === 'error' ? 'rgba(239, 68, 68, 0.03)' : 'rgba(16, 185, 129, 0.03)' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: rolloutStatusMsg.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
                          {rolloutStatusMsg.text}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: SEC OVERS (Embedded Settings Settings View) */}
              {activeTab === 'overrides' && (
                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Règles de Surcharge SecOps</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Définissez des seuils de tolérance spécifiques à ce conteneur pour contourner ou durcir les règles globales.</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* Severity select */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tolérance de sévérité des failles CVE pour ce conteneur</label>
                      <select value={ovrSeverity} onChange={e => setOvrSeverity(e.target.value)} className="glass-input" style={{ cursor: 'pointer', fontWeight: 600 }}>
                        <option value="">Hériter des règles globales (HIGH)</option>
                        <option value="CRITICAL">CRITICAL (Bloque toutes les failles critiques)</option>
                        <option value="HIGH">HIGH (Bloque critiques et hautes)</option>
                        <option value="MEDIUM">MEDIUM (Bloque critiques, hautes et moyennes)</option>
                        <option value="LOW">LOW (Bloque toutes les failles sauf info)</option>
                        <option value="NONE">NONE (Bloque toutes les failles, même mineures)</option>
                      </select>
                    </div>

                    {/* Allow root */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Autoriser l'utilisateur root dans ce conteneur</label>
                      <select value={ovrAllowRoot} onChange={e => setOvrAllowRoot(e.target.value)} className="glass-input" style={{ cursor: 'pointer' }}>
                        <option value="">Hériter des règles globales</option>
                        <option value="true">Autorisé (SafeDock n'interdira pas le déploiement)</option>
                        <option value="false">Interdit (Bloque si root détecté)</option>
                      </select>
                    </div>

                    {/* Allow privileged */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Autoriser le mode privilégié dans ce conteneur</label>
                      <select value={ovrAllowPrivilege} onChange={e => setOvrAllowPrivilege(e.target.value)} className="glass-input" style={{ cursor: 'pointer' }}>
                        <option value="">Hériter des règles globales</option>
                        <option value="true">Autorisé (SafeDock n'interdira pas le déploiement)</option>
                        <option value="false">Interdit (Bloque si privilégié détecté)</option>
                      </select>
                    </div>

                    {/* Actions save overrides buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{saveStatus}</span>
                      
                      {hasOverride && (
                        <button type="button" className="btn btn-accent" onClick={handleDeleteOverrideLocal} style={{ padding: '0.5rem 1rem', borderRadius: '8px' }}>
                          <i className="fa-solid fa-trash"></i>
                          <span style={{ marginLeft: '0.4rem' }}>Supprimer la surcharge</span>
                        </button>
                      )}

                      <button type="button" className="btn btn-primary" onClick={handleSaveOverrideLocal} style={{ padding: '0.5rem 1.25rem', borderRadius: '8px' }}>
                        <i className="fa-solid fa-save"></i>
                        <span style={{ marginLeft: '0.4rem' }}>Enregistrer la surcharge</span>
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
