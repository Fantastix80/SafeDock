import React, { useState, useEffect } from 'react';

export default function ContainerSettingsView({ 
  containerId,
  containers, 
  overrides, 
  onSaveOverride, 
  onDeleteOverride, 
  onNavigate 
}) {
  const container = containers.find(c => c.id === containerId);

  if (!container) {
    return (
      <div className="page-view" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>
          <h4>Conteneur non trouvé</h4>
          <p>Le conteneur demandé n'existe pas ou n'est plus actif.</p>
          <button className="btn btn-secondary" onClick={() => onNavigate('containers')}>
            Retour aux conteneurs
          </button>
        </div>
      </div>
    );
  }

  // Inputs
  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Load current overrides if they exist
  useEffect(() => {
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
  }, [overrides, container]);

  const handleSave = () => {
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

  const handleDelete = () => {
    if (!overrides[container.name]) return;
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

  return (
    <div id="view-container-settings" className="page-view">
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
            <h3 style={{ margin: 0 }}>Configuration spécifique du conteneur</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nom de la machine : <strong>{container.host_name}</strong></span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          
          {/* Left panel: Info status card */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', height: 'fit-content' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800 }}>{container.name}</h4>
            <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
              {container.image_name}:{container.image_tag}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Statut de règle :</span>
                {hasOverride ? (
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', marginLeft: '0.5rem', fontWeight: 'bold' }}>Surcharge active</span>
                ) : (
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', marginLeft: '0.5rem', fontWeight: 'bold' }}>Héritage global</span>
                )}
              </div>
              
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Score SecOps actuel :</span>
                <strong style={{ color: 'var(--primary)', marginLeft: '0.5rem' }}>{container.score}/100 ({container.grade})</strong>
              </div>
            </div>
          </div>

          {/* Right panel: Overrides configuration form */}
          <div className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 1.5rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Règles de Surcharge</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Severity threshold */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Tolérance de sévérité des failles CVE pour ce conteneur
                </label>
                <select 
                  value={ovrSeverity} 
                  onChange={(e) => setOvrSeverity(e.target.value)} 
                  className="glass-input" 
                  style={{ fontWeight: 600, cursor: 'pointer' }}
                >
                  <option value="">Hériter des règles globales (HIGH)</option>
                  <option value="CRITICAL">CRITICAL (Bloque toutes les failles critiques)</option>
                  <option value="HIGH">HIGH (Bloque critiques et hautes)</option>
                  <option value="MEDIUM">MEDIUM (Bloque critiques, hautes et moyennes)</option>
                  <option value="LOW">LOW (Bloque toutes les failles sauf info)</option>
                  <option value="NONE">NONE (Bloque toutes les failles, même mineures)</option>
                </select>
              </div>

              {/* Allow Root */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Autoriser l'utilisateur root dans ce conteneur
                </label>
                <select 
                  value={ovrAllowRoot} 
                  onChange={(e) => setOvrAllowRoot(e.target.value)} 
                  className="glass-input" 
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Hériter des règles globales</option>
                  <option value="true">Autorisé (SafeDock n'interdira pas le déploiement)</option>
                  <option value="false">Interdit (Bloque si root détecté)</option>
                </select>
              </div>

              {/* Allow Privileged */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Autoriser le mode privilégié dans ce conteneur
                </label>
                <select 
                  value={ovrAllowPrivilege} 
                  onChange={(e) => setOvrAllowPrivilege(e.target.value)} 
                  className="glass-input" 
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Hériter des règles globales</option>
                  <option value="true">Autorisé (SafeDock n'interdira pas le déploiement)</option>
                  <option value="false">Interdit (Bloque si privilégié détecté)</option>
                </select>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{saveStatus}</span>
                
                {hasOverride && (
                  <button 
                    type="button" 
                    className="btn btn-accent" 
                    onClick={handleDelete}
                    style={{ padding: '0.6rem 1.25rem', borderRadius: '8px' }}
                  >
                    <i className="fa-solid fa-trash"></i>
                    <span style={{ marginLeft: '0.4rem' }}>Supprimer la surcharge</span>
                  </button>
                )}
                
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleSave}
                  style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
                >
                  <i className="fa-solid fa-save"></i>
                  <span style={{ marginLeft: '0.4rem' }}>Enregistrer</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
