import React, { useState, useEffect } from 'react';

export default function DetailDrawer({ 
  container, 
  isOpen, 
  onClose, 
  onTriggerRollout, 
  isRolloutLoading, 
  rolloutStatusMsg,
  onAudit
}) {
  const [activeTab, setActiveTab] = useState('tab-overview');

  // Reset tab on container change
  useEffect(() => {
    setActiveTab('tab-overview');
  }, [container]);

  if (!container) return null;

  const getSeverityLabel = (cveList) => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    if (!cveList) return counts;
    cveList.forEach(v => {
      const sev = v.severity ? v.severity.toLowerCase() : 'low';
      if (counts[sev] !== undefined) counts[sev]++;
    });
    return counts;
  };

  const getComplianceLabel = (dockleList) => {
    const counts = { fatal: 0, warn: 0, info: 0 };
    if (!dockleList) return counts;
    dockleList.forEach(c => {
      const lev = c.level ? c.level.toLowerCase() : 'info';
      if (counts[lev] !== undefined) counts[lev]++;
    });
    return counts;
  };

  const cveCounts = getSeverityLabel(container.vulnerabilities);
  const dockleCounts = getComplianceLabel(container.compliance_alerts);

  const totalCves = container.vulnerabilities ? container.vulnerabilities.length : 0;
  const totalCompliances = container.compliance_alerts ? container.compliance_alerts.length : 0;

  return (
    <>
      {/* Background Overlay */}
      <div 
        className={`drawer-overlay ${isOpen ? 'active' : ''}`}
        onClick={onClose}
      ></div>

      {/* Slide-out Drawer */}
      <aside className={`drawer glass ${isOpen ? 'active' : ''}`} id="container-drawer">
        <div className="drawer-header">
          <div className="drawer-title-area">
            <h3 id="drawer-container-name">{container.name}</h3>
            <span className="drawer-subtitle" id="drawer-container-image">{container.image}</span>
          </div>
          <button 
            className="btn-close-drawer" 
            id="btn-close-drawer"
            onClick={onClose}
            type="button"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="drawer-tabs">
          <button 
            className={`tab-btn ${activeTab === 'tab-overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('tab-overview')}
            type="button"
          >
            Aperçu
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tab-trivy' ? 'active' : ''}`}
            onClick={() => setActiveTab('tab-trivy')}
            type="button"
          >
            CVE (Trivy) <span className="tab-badge" id="cve-count-badge">{totalCves}</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tab-dockle' ? 'active' : ''}`}
            onClick={() => setActiveTab('tab-dockle')}
            type="button"
          >
            Linter (Dockle) <span className="tab-badge" id="dockle-count-badge">{totalCompliances}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="drawer-content">
          {/* TAB: OVERVIEW */}
          {activeTab === 'tab-overview' && (
            <div className="tab-pane active" id="tab-overview">
              <div className="drawer-section-card glass">
                <h4>Évaluation SecOps</h4>
                <div className="evaluation-grid">
                  {/* Tag Pinning */}
                  <div className="eval-item">
                    <span className={`eval-icon ${container.tag_pinned ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${container.tag_pinned ? 'fa-check' : 'fa-xmark'}`}></i>
                    </span>
                    <div className="eval-desc">
                      <strong>Image Tag Pinning</strong>
                      <span id="eval-text-pinning">
                        {container.tag_pinned ? "Image immuable référencée par digest SHA256" : "Alerte : image de conteneur mutable (ex: :latest)"}
                      </span>
                    </div>
                  </div>

                  {/* Non-Root */}
                  <div className="eval-item">
                    <span className={`eval-icon ${container.non_root ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${container.non_root ? 'fa-check' : 'fa-xmark'}`}></i>
                    </span>
                    <div className="eval-desc">
                      <strong>Utilisateur Non-Root</strong>
                      <span id="eval-text-root">
                        {container.non_root ? "Exécuté sous un utilisateur non-privilégié sécurisé" : "Danger : conteneur exécuté sous l'utilisateur root"}
                      </span>
                    </div>
                  </div>

                  {/* Privileged */}
                  <div className="eval-item">
                    <span className={`eval-icon ${container.privileged_safe ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${container.privileged_safe ? 'fa-check' : 'fa-xmark'}`}></i>
                    </span>
                    <div className="eval-desc">
                      <strong>Privilèges Standard</strong>
                      <span id="eval-text-privileged">
                        {container.privileged_safe ? "Aucun privilège d'hôte abusif accordé" : "Danger : conteneur exécuté en mode PRIVILÉGIÉ"}
                      </span>
                    </div>
                  </div>

                  {/* Mounts */}
                  <div className="eval-item">
                    <span className={`eval-icon ${container.mounts_safe ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${container.mounts_safe ? 'fa-check' : 'fa-xmark'}`}></i>
                    </span>
                    <div className="eval-desc">
                      <strong>Montages Système</strong>
                      <span id="eval-text-mounts">
                        {container.mounts_safe ? "Aucun montage de répertoire système sensible hôte" : "Danger : montage sensible de l'hôte détecté (/var/run/docker.sock, etc.)"}
                      </span>
                    </div>
                  </div>

                  {/* Secrets */}
                  <div className="eval-item">
                    <span className={`eval-icon ${!container.secret_leaks || container.secret_leaks.length === 0 ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${!container.secret_leaks || container.secret_leaks.length === 0 ? 'fa-check' : 'fa-xmark'}`}></i>
                    </span>
                    <div className="eval-desc">
                      <strong>Variables d'Environnement</strong>
                      <span id="eval-text-secrets">
                        {!container.secret_leaks || container.secret_leaks.length === 0 
                          ? "Aucune fuite de mot de passe ou clé API détectée" 
                          : `${container.secret_leaks.length} secret(s) critique(s) révélé(s) en clair`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Volume Mounts */}
              <div className="drawer-section-card glass">
                <h4>Partages de volumes sensibles</h4>
                <div className="mounts-list" id="drawer-mounts-list">
                  {!container.volumes || container.volumes.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aucun montage sensible détecté.</div>
                  ) : (
                    container.volumes.map((m, idx) => (
                      <div key={idx} className="mount-item">
                        <i className="fa-solid fa-folder-open" style={{ marginRight: '0.5rem', color: 'var(--primary)' }}></i>
                        {m}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Secrets Leak List */}
              <div className="drawer-section-card glass">
                <h4>Secrets détectés en clair</h4>
                <div className="secrets-list" id="drawer-secrets-list">
                  {!container.secret_leaks || container.secret_leaks.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aucun secret critique divulgué.</div>
                  ) : (
                    container.secret_leaks.map((leak, idx) => (
                      <div key={idx} className="secret-item">
                        <span className="sec-key"><i className="fa-solid fa-key" style={{ marginRight: '0.5rem' }}></i>{leak.key}</span>
                        <span className="sec-val">{leak.value_snippet || '••••••••'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TRIVY CVEs */}
          {activeTab === 'tab-trivy' && (
            <div className="tab-pane active" id="tab-trivy">
              <div className="scan-summary-bar">
                <div className="severity-stat critical">
                  <span className="count" id="trivy-crit-count">{cveCounts.critical}</span>
                  <span className="label">Critique</span>
                </div>
                <div className="severity-stat high">
                  <span className="count" id="trivy-high-count">{cveCounts.high}</span>
                  <span className="label">Haute</span>
                </div>
                <div className="severity-stat medium">
                  <span className="count" id="trivy-med-count">{cveCounts.medium}</span>
                  <span className="label">Moyenne</span>
                </div>
                <div className="severity-stat low">
                  <span className="count" id="trivy-low-count">{cveCounts.low}</span>
                  <span className="label">Basse</span>
                </div>
              </div>

              {totalCves === 0 ? (
                <div className="empty-state" id="trivy-empty">
                  <i className="fa-solid fa-circle-check text-success"></i>
                  <p>Félicitations ! Aucune faille de sécurité détectée par Trivy.</p>
                </div>
              ) : (
                <div className="vuln-list" id="trivy-vuln-list">
                  {container.vulnerabilities.map((v, idx) => {
                    const sev = v.severity ? v.severity.toLowerCase() : 'low';
                    return (
                      <div key={idx} className={`vuln-item ${sev}`}>
                        <div className="vuln-item-header">
                          <span className="vuln-cve">{v.cve_id}</span>
                          <span className={`badge badge-${sev === 'critical' || sev === 'high' ? 'danger' : 'warning'}`} style={{ fontSize: '0.65rem' }}>
                            {v.severity}
                          </span>
                        </div>
                        <span className="vuln-pkg">Paquet : <strong>{v.package_name}</strong> (v{v.current_version} &rarr; v{v.fixed_version || 'N/A'})</span>
                        <div className="vuln-title">{v.title}</div>
                        <div className="vuln-desc">{v.description}</div>
                        {v.primary_url && (
                          <a href={v.primary_url} target="_blank" rel="noopener noreferrer" className="vuln-link">
                            <i className="fa-solid fa-arrow-up-right-from-square"></i> Consulter le rapport CVE
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: DOCKLE COMPLIANCE */}
          {activeTab === 'tab-dockle' && (
            <div className="tab-pane active" id="tab-dockle">
              <div className="scan-summary-bar">
                <div className="severity-stat fatal">
                  <span className="count" id="dockle-fatal-count">{dockleCounts.fatal}</span>
                  <span className="label">FATAL</span>
                </div>
                <div className="severity-stat warn">
                  <span className="count" id="dockle-warn-count">{dockleCounts.warn}</span>
                  <span className="label">WARN</span>
                </div>
                <div className="severity-stat info">
                  <span className="count" id="dockle-info-count">{dockleCounts.info}</span>
                  <span className="label">INFO</span>
                </div>
              </div>

              {totalCompliances === 0 ? (
                <div className="empty-state" id="dockle-empty">
                  <i className="fa-solid fa-circle-check text-success"></i>
                  <p>Image 100% conforme aux meilleures pratiques Docker.</p>
                </div>
              ) : (
                <div className="compliance-list" id="dockle-compliance-list">
                  {container.compliance_alerts.map((c, idx) => {
                    const level = c.level ? c.level.toLowerCase() : 'info';
                    return (
                      <div key={idx} className={`compliance-item ${level}`}>
                        <div className="compliance-item-header">
                          <span className="compliance-code">{c.code}</span>
                          <span className={`badge badge-${level === 'fatal' ? 'danger' : level === 'warn' ? 'warning' : 'success'}`} style={{ fontSize: '0.65rem' }}>
                            {c.level}
                          </span>
                        </div>
                        <div className="compliance-title">{c.title}</div>
                        {c.alerts && c.alerts.length > 0 && (
                          <ul className="compliance-detail-list">
                            {c.alerts.map((a, aIdx) => <li key={aIdx}>{a}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer with Overhauled Dual Buttons */}
        <div className="drawer-footer">
          <div className="drawer-footer-buttons">
            {/* Rechercher MAJ (Primary Blue Button) */}
            <button 
              className={`btn btn-primary ${isRolloutLoading ? 'disabled' : ''}`}
              id="btn-trigger-update"
              onClick={() => onTriggerRollout(container.id, container.name)}
              disabled={isRolloutLoading}
              type="button"
            >
              <i className={`fa-solid fa-sync ${isRolloutLoading ? 'fa-spin' : ''}`}></i> 
              <span>Rechercher MAJ</span>
            </button>
            
            {/* Auditer Sécurité (Secondary Outlined Button) */}
            <button 
              className="btn btn-secondary"
              id="btn-trigger-audit"
              onClick={onAudit}
              type="button"
            >
              <i className="fa-solid fa-shield-halved"></i> 
              <span>Auditer Sécurité</span>
            </button>
          </div>
          
          {rolloutStatusMsg.text && (
            <div className={`update-status-msg ${rolloutStatusMsg.type}`}>
              {rolloutStatusMsg.text}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
