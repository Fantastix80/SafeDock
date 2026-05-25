import React, { useState } from 'react';

export default function ActionsView({ containers, onTriggerRollout, onNavigate }) {
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const handleSaveAutoUpdate = () => {
    setSaveStatus('Enregistrement...');
    setTimeout(() => {
      setSaveStatus('✅ Politique de mise à jour sauvegardée !');
      setTimeout(() => setSaveStatus(''), 4000);
    }, 800);
  };

  // Compile required actions from containers
  const updatesPending = (containers || []).filter(c => c.update_available);
  const vulnerableContainers = (containers || []).filter(c => c.score < 75 && !c.update_available);

  return (
    <div id="view-actions" className="page-view">
      <section className="section-container">
        
        {/* Title Area */}
        <div className="section-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h3>
              <i className="fa-solid fa-triangle-exclamation text-warning" style={{ marginRight: '0.5rem' }}></i>
              Actions de Sécurité Nécessaires
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Consultez les mises à jour en attente d'approbation et résolvez les alertes CVE critiques actives.
            </p>
          </div>
        </div>

        {/* Grid split */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          
          {/* Left Panel: Pending Actions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Updates list card */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-cloud-arrow-down" style={{ color: 'var(--primary)', fontSize: '1rem' }}></i>
                Mises à jour prêtes à être déployées ({updatesPending.length})
              </h4>

              {updatesPending.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  Aucune mise à jour de conteneur en attente. Tout est parfaitement à jour !
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {updatesPending.map(c => (
                    <div key={c.id} className="glass" style={{ padding: '1rem', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({c.host_name})</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          Image : {c.image_name}:{c.image_tag}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.35rem', fontWeight: 600 }}>
                          <i className="fa-solid fa-circle-check"></i> Prêt pour pivot de cycle de vie sécurisé
                        </div>
                      </div>
                      <button 
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => onTriggerRollout(c.id, c.name)}
                        type="button"
                      >
                        <i className="fa-solid fa-rotate"></i>
                        <span>Déployer la MàJ</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unresolved CVE card list */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-bug" style={{ color: 'var(--danger)', fontSize: '1rem' }}></i>
                Vulnérabilités actives sans correctif automatique ({vulnerableContainers.length})
              </h4>

              {vulnerableContainers.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  Aucune vulnérabilité active non-résolue. Excellente posture !
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {vulnerableContainers.map(c => (
                    <div key={c.id} className="glass" style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({c.host_name})</span>
                        </div>
                        <span className="badge badge-danger" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', fontWeight: 'bold' }}>
                          Score SecOps : {c.score}/100
                        </span>
                      </div>
                      
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        La veille SecOps a remonté des vulnérabilités critiques de type CVE sur ce conteneur, mais aucune nouvelle version (tag digest immuable) n'est publiée par l'éditeur pour le moment.
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          <i className="fa-solid fa-shield-halved" style={{ marginRight: '0.3rem' }}></i> Recommandation : Isoler le réseau du conteneur ou durcir les variables d'environnement.
                        </span>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '6px' }}
                          onClick={() => {
                            onNavigate('containers');
                          }}
                          type="button"
                        >
                          <span>Inspecter</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Panel: Auto-Update Settings */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', height: 'fit-content' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-gear" style={{ color: 'var(--primary)', fontSize: '1rem' }}></i>
              Paramètres pivots
            </h4>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Configurez le comportement de mise à jour et de pivot du cycle de vie de SafeDock lors de la détection de versions saines.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Option toggle */}
              <div className="glass" style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={autoUpdateEnabled} 
                    onChange={e => setAutoUpdateEnabled(e.target.checked)} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Mises à jour automatiques SecOps</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: '1.3' }}>
                      Mettre à jour le conteneur automatiquement dès que tous les tests de sécurité SecOps sont validés.
                    </span>
                  </div>
                </label>
              </div>

              {!autoUpdateEnabled && (
                <div className="glass" style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'rgba(245, 158, 11, 0.04)' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-circle-exclamation"></i> Mode Notification Seul
                  </span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: '1.3' }}>
                    Le programme n'effectuera aucun déploiement automatique. Vous recevrez une alerte pour déployer manuellement chaque conteneur.
                  </span>
                </div>
              )}

              <span style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', display: 'block', minHeight: '1.2rem' }}>{saveStatus}</span>

              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleSaveAutoUpdate}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px' }}
              >
                <i className="fa-solid fa-save"></i>
                <span style={{ marginLeft: '0.4rem' }}>Sauvegarder les règles</span>
              </button>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
