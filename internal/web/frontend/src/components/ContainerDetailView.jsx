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
  onNavigate,
  containerTags = {},
  onUpdateTags
}) {
  const container = containers.find(c => c.id === containerId);
  const [activeTab, setActiveTab] = useState('trivy');

  // Trivy state
  const [trivyReport, setTrivyReport] = useState(null);
  const [trivyLoading, setTrivyLoading] = useState(false);
  const [trivyError, setTrivyError] = useState('');
  const [cveSearch, setCveSearch] = useState('');
  const [cveFilter, setCveFilter] = useState('ALL');
  const [cveSortField, setCveSortField] = useState('severity');
  const [cveSortOrder, setCveSortOrder] = useState('desc');

  // Dockle state
  const [dockleReport, setDockleReport] = useState(null);
  const [dockleLoading, setDockleLoading] = useState(false);
  const [dockleError, setDockleError] = useState('');

  // Paramètres du conteneur inputs
  const [ovrSeverity, setOvrSeverity] = useState('');
  const [ovrAllowRoot, setOvrAllowRoot] = useState('');
  const [ovrAllowPrivilege, setOvrAllowPrivilege] = useState('');
  const [ovrScanner, setOvrScanner] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Tag editor input
  const [newTagInput, setNewTagInput] = useState('');

  // Fetch Trivy / Grype / Hybrid Scan
  const fetchTrivy = () => {
    if (!containerId) return;
    setTrivyLoading(true);
    setTrivyError('');
    
    // Detect custom scanner parameter
    const currentScanner = ovrScanner || "";
    const url = `/api/containers/${containerId}/trivy?scanner=${currentScanner}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Erreur de scan de vulnérabilités");
        return res.json();
      })
      .then(data => setTrivyReport(data))
      .catch(err => setTrivyError(err.message))
      .finally(() => setTrivyLoading(false));
  };

  // Fetch Dockle Scan
  const fetchDockle = () => {
    if (!containerId) return;
    setDockleLoading(true);
    setDockleError('');
    fetch(`/api/containers/${containerId}/dockle`)
      .then(res => {
        if (!res.ok) throw new Error("Erreur de scan de conformité Dockle");
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
        setOvrSeverity(ovr.secops_max_severity_allowed || '');
        setOvrAllowRoot(ovr.secops_allow_root === null ? '' : String(ovr.secops_allow_root));
        setOvrAllowPrivilege(ovr.secops_allow_privileged === null ? '' : String(ovr.secops_allow_privileged));
        setOvrScanner(ovr.secops_scanner || '');
      } else {
        setOvrSeverity('');
        setOvrAllowRoot('');
        setOvrAllowPrivilege('');
        setOvrScanner('');
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

    onSaveOverride(container.name, ovrSeverity, allowRootVal, allowPrivilegeVal, ovrScanner)
      .then(() => {
        setSaveStatus('✅ Paramètres sauvegardés !');
        setTimeout(() => setSaveStatus(''), 4000);
        fetchTrivy(); // Trigger scan update if scanner option was changed
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
        setOvrScanner('');
        setSaveStatus('🗑️ Surcharge supprimée (Héritage actif) !');
        setTimeout(() => setSaveStatus(''), 4000);
        fetchTrivy();
      })
      .catch(() => {
        setSaveStatus('❌ Erreur de suppression.');
        setTimeout(() => setSaveStatus(''), 4000);
      });
  };

  // Tag Management handlers
  const activeTags = containerTags[container.name] || container.tags || [];
  
  const handleAddTag = (e) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    const cleanTag = newTagInput.trim();
    if (!activeTags.includes(cleanTag)) {
      onUpdateTags(container.name, [...activeTags, cleanTag]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove) => {
    const updated = activeTags.filter(t => t !== tagToRemove);
    onUpdateTags(container.name, updated);
  };

  // CVE Table Filtering & Sorting
  const sevWeight = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };

  const getFilteredCVEs = () => {
    let list = (trivyReport && trivyReport.vulnerabilities) || [];
    
    // Search filter
    if (cveSearch) {
      const term = cveSearch.toLowerCase();
      list = list.filter(v => 
        (v.cve_id || '').toLowerCase().includes(term) ||
        (v.package_name || '').toLowerCase().includes(term) ||
        (v.description || '').toLowerCase().includes(term)
      );
    }

    // Severity filter
    if (cveFilter !== 'ALL') {
      list = list.filter(v => v.severity === cveFilter);
    }

    // Sorting
    return [...list].sort((a, b) => {
      let aVal = a[cveSortField] || '';
      let bVal = b[cveSortField] || '';

      if (cveSortField === 'severity') {
        const aW = sevWeight[a.severity] || 0;
        const bW = sevWeight[b.severity] || 0;
        return cveSortOrder === 'asc' ? aW - bW : bW - aW;
      }

      aVal = aVal.toString().toLowerCase();
      bVal = bVal.toString().toLowerCase();
      if (aVal < bVal) return cveSortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return cveSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSortCVE = (field) => {
    if (cveSortField === field) {
      setCveSortOrder(cveSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCveSortField(field);
      setCveSortOrder('desc');
    }
  };

  const filteredCVEs = getFilteredCVEs();

  const hasOverride = !!overrides[container.name];
  let scoreClass = 'score-a';
  if (container.score < 40) scoreClass = 'score-f';
  else if (container.score < 60) scoreClass = 'score-d';
  else if (container.score < 75) scoreClass = 'score-c';
  else if (container.score < 90) scoreClass = 'score-b';

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
          
          {/* Left Panel: Container Summary & Score Explanations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Main Score and Status Card */}
            <div className="glass" style={{ padding: '1.75rem 1.5rem', borderRadius: '12px', textAlign: 'center', height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div className={`card-badge-score ${scoreClass}`} style={{ width: '80px', height: '80px', fontSize: '2.5rem', borderRadius: '16px' }}>
                  {container.grade || 'F'}
                </div>
              </div>

              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>{container.name}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', margin: '0.25rem 0 1rem 0' }}>
                {container.image_name}:{container.image_tag}
              </span>

              {/* Tags Display */}
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1rem' }}>
                {activeTags.map((t, idx) => (
                  <span key={idx} className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', backgroundColor: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-secondary)' }}>
                    {t}
                  </span>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem', textAlign: 'left' }}>
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
            </div>

            {/* Score points breakdown & improvement recommendations */}
            <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px' }}>
              <h5 style={{ color: 'var(--text-primary)', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="fa-solid fa-list-check text-primary"></i>
                Détails du Score SecOps : {container.score}/100
              </h5>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.75rem' }}>
                
                {/* 1. Tag Pinned */}
                <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', paddingBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: container.tag_pinned ? 'var(--success)' : 'var(--danger)' }}>
                    <span>Tag Pinned (SHA256)</span>
                    <span>{container.tag_pinned ? "+25 pts" : "-25 pts"}</span>
                  </div>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '0.7rem' }}>
                    {container.tag_pinned 
                      ? "L'image est verrouillée par son hash cryptographique immuable." 
                      : "⚠️ Risque de mutable poisoning. Conseil : Utilisez l'image avec son digest @sha256:..."}
                  </span>
                </div>

                {/* 2. Non-Root */}
                <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', paddingBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: container.non_root ? 'var(--success)' : 'var(--danger)' }}>
                    <span>Utilisateur Non-Root</span>
                    <span>{container.non_root ? "+25 pts" : "-25 pts"}</span>
                  </div>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '0.7rem' }}>
                    {container.non_root 
                      ? "Le conteneur tourne avec des privilèges UID réduits et sécurisés." 
                      : "⚠️ Démarrage en ROOT détecté ! Conseil : Ajoutez l'instruction 'USER 1000' dans le Dockerfile."}
                  </span>
                </div>

                {/* 3. Privileged */}
                <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', paddingBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: container.privileged_safe ? 'var(--success)' : 'var(--warning)' }}>
                    <span>Mode Privilégié Restreint</span>
                    <span>{container.privileged_safe ? "+30 pts" : "-30 pts"}</span>
                  </div>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '0.7rem' }}>
                    {container.privileged_safe 
                      ? "Le conteneur n'a pas accès aux capacités du noyau de l'hôte." 
                      : "⚠️ Mode privilégié actif ! Risque majeur d'échappement. Conseil : Lancez sans '--privileged'."}
                  </span>
                </div>

                {/* 4. Sensitive Mounts / Leaks */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: (!container.secret_leaks || container.secret_leaks.length === 0) ? 'var(--success)' : 'var(--danger)' }}>
                    <span>Absence de secrets fuités</span>
                    <span>{(!container.secret_leaks || container.secret_leaks.length === 0) ? "+20 pts" : `-${Math.min(20, container.secret_leaks.length * 10)} pts`}</span>
                  </div>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', marginTop: '0.2rem', fontSize: '0.7rem' }}>
                    {(!container.secret_leaks || container.secret_leaks.length === 0)
                      ? "Aucune clé privée, mot de passe ou jeton n'a été détecté dans les variables d'env." 
                      : `⚠️ ${container.secret_leaks.length} secret(s) en clair détecté(s). Conseil : Injectez-les via Docker Secrets ou Vault.`}
                  </span>
                </div>

              </div>
            </div>

          </div>

          {/* Right Panel: Cockpit Tabs */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            
            {/* Segments/Tabs selector */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button 
                className={`tab-btn ${activeTab === 'trivy' ? 'active' : ''}`}
                onClick={() => setActiveTab('trivy')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-bug"></i> Sécurité (Failles CVE)
              </button>
              
              <button 
                className={`tab-btn ${activeTab === 'dockle' ? 'active' : ''}`}
                onClick={() => setActiveTab('dockle')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-list-check"></i> Conformité (Dockle)
              </button>
              
              <button 
                className={`tab-btn ${activeTab === 'lifecycle' ? 'active' : ''}`}
                onClick={() => setActiveTab('lifecycle')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-arrows-spin"></i> Opérations de déploiement
              </button>
              
              <button 
                className={`tab-btn ${activeTab === 'overrides' ? 'active' : ''}`}
                onClick={() => setActiveTab('overrides')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                type="button"
              >
                <i className="fa-solid fa-sliders"></i> Paramètres du conteneur
              </button>
            </div>

            {/* Tab content renders */}
            <div>
              
              {/* TAB: TRIVY CVEs (Overhauled Searchable/Sortable Table) */}
              {activeTab === 'trivy' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0 }}>Analyse des Failles CVE (Trivy / Grype)</h4>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {trivyReport && trivyReport.vulnerabilities && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                          Moteur utilisé : <strong style={{ color: 'var(--primary)' }}>{trivyReport.vulnerabilities[0]?.scanner || ovrScanner || "Trivy"}</strong>
                        </span>
                      )}
                      
                      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }} onClick={fetchTrivy} disabled={trivyLoading}>
                        <i className={`fa-solid fa-arrows-rotate ${trivyLoading ? 'fa-spin' : ''}`}></i>
                        <span style={{ marginLeft: '0.4rem' }}>Scanner</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Toolbar */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input 
                      type="text" 
                      placeholder="Rechercher par CVE, paquet, description..." 
                      className="glass-input" 
                      style={{ flexGrow: 1, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} 
                      value={cveSearch} 
                      onChange={e => setCveSearch(e.target.value)} 
                    />
                    
                    <select 
                      value={cveFilter} 
                      onChange={e => setCveFilter(e.target.value)} 
                      className="glass-input" 
                      style={{ fontSize: '0.8rem', width: '150px', cursor: 'pointer' }}
                    >
                      <option value="ALL">Toutes gravités</option>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>

                  {trivyLoading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                      <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Scan de vulnérabilités en cours...</p>
                    </div>
                  ) : trivyError ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem', border: '1px dashed var(--danger)', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <i className="fa-solid fa-circle-exclamation"></i> Échec du scan : {trivyError}
                    </div>
                  ) : filteredCVEs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'rgba(16, 185, 129, 0.02)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <i className="fa-solid fa-circle-check" style={{ fontSize: '2.5rem', color: 'var(--success)', marginBottom: '0.85rem' }}></i>
                      <h4 style={{ color: 'var(--success)', margin: '0 0 0.25rem 0' }}>Aucune faille détectée</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aucune vulnérabilité ne correspond aux critères de recherche !</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '35px', userSelect: 'none' }}>
                            <th style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={() => handleSortCVE('cve_id')}>CVE ID {cveSortField === 'cve_id' ? (cveSortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                            <th style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={() => handleSortCVE('severity')}>Sévérité {cveSortField === 'severity' ? (cveSortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                            <th style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={() => handleSortCVE('package_name')}>Paquet {cveSortField === 'package_name' ? (cveSortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                            <th style={{ padding: '0.5rem' }}>Installed / Fix</th>
                            <th style={{ padding: '0.5rem', width: '45%' }}>Description</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Détecteur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCVEs.map((v, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', verticalAlign: 'top' }}>
                              <td style={{ padding: '0.65rem 0.5rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                {v.url ? (
                                  <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{v.cve_id || v.vulnerability_id || 'CVE-ID'}</a>
                                ) : (
                                  v.cve_id || v.vulnerability_id || 'CVE-ID'
                                )}
                              </td>
                              <td style={{ padding: '0.65rem 0.5rem' }}>
                                <span className={`badge ${v.severity === 'CRITICAL' || v.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                                  {v.severity}
                                </span>
                              </td>
                              <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>{v.package_name || v.pkg_name}</td>
                              <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {v.installed_version} {v.fixed_version && <span style={{ color: 'var(--success)', display: 'block', marginTop: '0.15rem' }}>➔ {v.fixed_version}</span>}
                              </td>
                              <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                                {v.description || v.title || 'Aucune description.'}
                              </td>
                              <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                {v.scanner || "Trivy"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: DOCKLE COMPLIANCE (Corrected list parsing) */}
              {activeTab === 'dockle' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h4 style={{ margin: 0 }}>Rapport de conformité d'image (Dockle Linter)</h4>
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }} onClick={fetchDockle} disabled={dockleLoading}>
                      <i className={`fa-solid fa-arrows-rotate ${dockleLoading ? 'fa-spin' : ''}`}></i>
                      <span style={{ marginLeft: '0.4rem' }}>Scanner</span>
                    </button>
                  </div>

                  {dockleLoading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                      <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Audit de conformité Dockle en cours...</p>
                    </div>
                  ) : dockleError ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem', border: '1px dashed var(--danger)', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <i className="fa-solid fa-circle-exclamation"></i> Échec Dockle : {dockleError}
                    </div>
                  ) : !dockleReport || !dockleReport.details || dockleReport.details.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'rgba(16, 185, 129, 0.02)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <i className="fa-solid fa-circle-check" style={{ fontSize: '2.5rem', color: 'var(--success)', marginBottom: '0.85rem' }}></i>
                      <h4 style={{ color: 'var(--success)', margin: '0 0 0.25rem 0' }}>Conformité parfaite</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Aucun problème de structure, d'utilisateur root ou de secrets n'a été détecté dans les couches de l'image !</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '400px', overflowY: 'auto' }}>
                      {dockleReport.details.map((a, i) => (
                        <div key={i} className="glass" style={{ padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Code : <code>{a.code || 'DKL_RULE'}</code></strong>
                            <span className="badge" style={{ backgroundColor: a.level === 'FATAL' || a.level === 'WARN' ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255, 255, 255, 0.03)', color: a.level === 'FATAL' || a.level === 'WARN' ? '#F97316' : 'var(--text-secondary)', fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {a.level}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.35rem' }}>{a.title}</div>
                          {a.alerts && a.alerts.length > 0 && (
                            <ul style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                              {a.alerts.map((al, alIdx) => (
                                <li key={alIdx}><code>{al}</code></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: LIFECYCLE ACTIONS (Renamed, clarified, and beautifully styled) */}
              {activeTab === 'lifecycle' && (
                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Opérations de déploiement et cycle de vie</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                    Le pivotement de cycle de vie de SafeDock vous permet de remplacer et de recréer de manière transactionnelle un conteneur déployé par sa dernière version de sécurité saine. Cette opération s'effectue sans coupure de service visible (Zero-Downtime rollout).
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Déclencher le pivot de cycle de vie (Rollout)</strong>
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

              {/* TAB: CONTAINER PARAMETERS (Renamed & with Tag Manager / Scanner Options) */}
              {activeTab === 'overrides' && (
                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Paramètres du conteneur</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Définissez des seuils de tolérance spécifiques et configurez les scanners CVE de ce conteneur.</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* Tag Manager Bento section */}
                    <div className="glass" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>
                        <i className="fa-solid fa-tags text-primary" style={{ marginRight: '0.35rem' }}></i>
                        Gestion des Tags
                      </label>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Rattachez ce conteneur à des tags organisationnels ou applicatifs.</p>
                      
                      {/* Active tag list */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        {activeTags.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun tag associé.</span>
                        ) : (
                          activeTags.map((t, idx) => (
                            <span 
                              key={idx} 
                              className="badge" 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.35rem', 
                                padding: '0.2rem 0.5rem', 
                                backgroundColor: 'rgba(69, 120, 249, 0.1)', 
                                color: 'var(--primary)', 
                                border: '1px solid rgba(69, 120, 249, 0.2)',
                                fontWeight: 'bold',
                                fontSize: '0.7rem'
                              }}
                            >
                              {t}
                              <i 
                                className="fa-solid fa-xmark" 
                                style={{ cursor: 'pointer', fontSize: '0.65rem', color: 'var(--danger)' }} 
                                onClick={() => handleRemoveTag(t)}
                                title="Supprimer le tag"
                              ></i>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Tag Form */}
                      <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                          type="text" 
                          placeholder="Nouveau tag (ex: Staging, Front-End)..." 
                          className="glass-input" 
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', flexGrow: 1 }}
                          value={newTagInput}
                          onChange={e => setNewTagInput(e.target.value)}
                        />
                        <button type="submit" className="btn btn-secondary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem', borderRadius: '6px' }}>
                          Ajouter
                        </button>
                      </form>
                    </div>

                    {/* Scanner Select override options */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Moteur d'analyse de vulnérabilités spécifique</label>
                      <select value={ovrScanner} onChange={e => setOvrScanner(e.target.value)} className="glass-input" style={{ cursor: 'pointer', fontWeight: 600 }}>
                        <option value="">Hériter des paramètres globaux</option>
                        <option value="trivy">Trivy (Aqua Security)</option>
                        <option value="grype">Grype (Anchore Engine)</option>
                        <option value="hybrid">Double Scan Hybride (Trivy + Grype)</option>
                      </select>
                    </div>
                    
                    {/* Severity select */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tolérance de sévérité des failles CVE pour ce conteneur</label>
                      <select value={ovrSeverity} onChange={e => setOvrSeverity(e.target.value)} className="glass-input" style={{ cursor: 'pointer', fontWeight: 600 }}>
                        <option value="">Hériter des règles globales</option>
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
                        <span style={{ marginLeft: '0.4rem' }}>Enregistrer les paramètres</span>
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
