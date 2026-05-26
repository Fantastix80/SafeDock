import React, { useState } from 'react';

export default function PermissionsView({ simulatedUsers, setSimulatedUsers, activeUserProfile, setActiveUserProfile }) {
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Lecteur');
  const [scopeType, setScopeType] = useState('all');
  const [scopeVal, setScopeVal] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const handleCreateUser = (e) => {
    e.preventDefault();
    if (!newUserName) return;

    let finalScopeValue = null;
    let finalDesc = "Accès complet";

    if (scopeType === 'tags') {
      finalScopeValue = scopeVal.split(',').map(s => s.trim()).filter(Boolean);
      finalDesc = `Limité aux tags : ${finalScopeValue.join(', ')}`;
    } else if (scopeType === 'hosts') {
      finalScopeValue = [scopeVal.trim()];
      finalDesc = `Limité à l'hôte : ${scopeVal.trim()}`;
    }

    const newUser = {
      id: Date.now(),
      name: newUserName,
      role: newUserRole,
      scopeType,
      scopeValue: finalScopeValue,
      desc: finalDesc
    };

    const updatedUsers = [...simulatedUsers, newUser];
    setSimulatedUsers(updatedUsers);
    localStorage.setItem('safedock-simulated-users', JSON.stringify(updatedUsers));

    setNewUserName('');
    setScopeVal('');
    setScopeType('all');
    setSaveStatus('✅ Nouvel utilisateur créé !');
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleDeleteUser = (id) => {
    // Ne pas supprimer l'admin principal actif
    if (id === 1) return;
    
    const updatedUsers = simulatedUsers.filter(u => u.id !== id);
    setSimulatedUsers(updatedUsers);
    localStorage.setItem('safedock-simulated-users', JSON.stringify(updatedUsers));

    if (activeUserProfile.id === id) {
      // Revenir à l'admin par défaut
      const defaultAdmin = simulatedUsers.find(u => u.id === 1);
      setActiveUserProfile(defaultAdmin);
    }
  };

  const handleSimulate = (user) => {
    setActiveUserProfile(user);
  };

  return (
    <div id="view-permissions" className="page-view">
      <section className="section-container">
        
        {/* Title & Glowing Status Header */}
        <div className="section-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>
              <i className="fa-solid fa-user-lock text-primary" style={{ marginRight: '0.5rem' }}></i>
              Matrice des Permissions & Scopes
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Définissez la visibilité et les droits d'administration SecOps des utilisateurs de votre organisation.
            </p>
          </div>
          
          {/* Active Simulation Status Card */}
          <div className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.65rem', border: '1px solid var(--primary)', backgroundColor: 'rgba(69, 120, 249, 0.05)' }}>
            <span className="pulse-dot" style={{ backgroundColor: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }}></span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Session active : <strong style={{ color: 'var(--primary)' }}>{activeUserProfile.name}</strong> ({activeUserProfile.role})
            </span>
          </div>
        </div>

        {/* Dynamic Alert for Non-Admin view */}
        {activeUserProfile.id !== 1 && (
          <div className="glass" style={{ padding: '1rem', borderRadius: '12px', border: '1px dashed var(--warning)', backgroundColor: 'rgba(245, 158, 11, 0.03)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <i className="fa-solid fa-circle-exclamation" style={{ color: 'var(--warning)', fontSize: '1.2rem' }}></i>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <strong>Mode Simulation SecOps Actif :</strong> L'intégralité des données de l'application (dashboard, barres CVE, conteneurs, alertes) est actuellement filtrée selon le scope défini pour <strong>{activeUserProfile.name}</strong>. {activeUserProfile.desc}.
              <button 
                className="btn btn-secondary" 
                onClick={() => handleSimulate(simulatedUsers.find(u => u.id === 1))}
                style={{ marginLeft: '1rem', padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '6px' }}
                type="button"
              >
                Rétablir l'accès Admin complet
              </button>
            </div>
          </div>
        )}

        {/* Layout Split */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          
          {/* Left Panel: Users Matrix Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Utilisateurs et Restrictions SecOps
              </h4>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '35px' }}>
                      <th style={{ padding: '0.5rem' }}>Utilisateur</th>
                      <th style={{ padding: '0.5rem' }}>Rôle SecOps</th>
                      <th style={{ padding: '0.5rem' }}>Restriction de Scope</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>Simulation</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedUsers.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: u.id === 1 ? 'var(--primary)' : 'var(--bg-card)', border: `1px solid ${activeUserProfile.id === u.id ? 'var(--primary)' : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span style={{ display: 'block', color: 'var(--text-primary)' }}>{u.name}</span>
                            {activeUserProfile.id === u.id && <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 'bold' }}>Session Active</span>}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span className={`badge ${u.role === 'Admin' ? 'badge-danger' : u.role === 'Auditeur' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          <i className="fa-solid fa-filter" style={{ marginRight: '0.35rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}></i>
                          {u.desc}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                          <button 
                            className={`btn ${activeUserProfile.id === u.id ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => handleSimulate(u)}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.7rem', borderRadius: '6px' }}
                            type="button"
                          >
                            {activeUserProfile.id === u.id ? 'Connecté' : 'Se connecter'}
                          </button>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                          {u.id !== 1 ? (
                            <button 
                              onClick={() => handleDeleteUser(u.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Supprimer l'utilisateur"
                              type="button"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>Système</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Explanations Bento Card */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h5 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <i className="fa-solid fa-circle-info text-primary"></i> Rôles SecOps Globaux
                </h5>
                <ul style={{ paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  <li><strong>Admin</strong> : Droits complets d'audit, configuration SMTP/Seuils globale et management de pivots.</li>
                  <li><strong>Auditeur</strong> : Droit d'inspecter, de rafraîchir à chaud et de rescanner Trivy/Dockle.</li>
                  <li><strong>Lecteur</strong> : Accès aux rapports SecOps et alertes en lecture seule sans droits de modification.</li>
                </ul>
              </div>
              
              <div>
                <h5 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <i className="fa-solid fa-filter text-primary"></i> Scoping de Ressources
                </h5>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Restreignez l'accès d'un utilisateur en lui assignant un **scope strict**. L'utilisateur ne verra **uniquement** que les machines ou tags autorisés. Toutes les statistiques globales, cumuls de CVE et logs d'audit sont automatiquement calculés et restreints dans son scope d'accès.
                </p>
              </div>
            </div>

          </div>

          {/* Right Panel: Create User Form */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', height: 'fit-content' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-user-plus text-primary"></i>
              Créer un profil
            </h4>
            
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nom complet</label>
                <input 
                  type="text" 
                  placeholder="ex: David SecOps" 
                  className="glass-input" 
                  value={newUserName} 
                  onChange={e => setNewUserName(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Rôle global</label>
                <select 
                  value={newUserRole} 
                  onChange={e => setNewUserRole(e.target.value)} 
                  className="glass-input"
                  style={{ cursor: 'pointer', fontWeight: 600 }}
                >
                  <option value="Admin">Admin (Tous les privilèges)</option>
                  <option value="Auditeur">Auditeur (Scan, lecture, refresh)</option>
                  <option value="Lecteur">Lecteur (Lecture seule)</option>
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Type de scoping</label>
                <select 
                  value={scopeType} 
                  onChange={e => setScopeType(e.target.value)} 
                  className="glass-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="all">Tout le parc (Aucune restriction)</option>
                  <option value="tags">Restreint par Tags (Filtrage tags)</option>
                  <option value="hosts">Restreint par Machine Hôte (Filtrage hôtes)</option>
                </select>
              </div>

              {scopeType !== 'all' && (
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', animation: 'fadeIn 0.2s ease-in' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {scopeType === 'tags' ? "Tags autorisés (séparés par virgules)" : "Nom exact de la machine hôte"}
                  </label>
                  <input 
                    type="text" 
                    placeholder={scopeType === 'tags' ? "ex: Production, Web" : "ex: db-node-02"} 
                    className="glass-input" 
                    value={scopeVal} 
                    onChange={e => setScopeVal(e.target.value)} 
                    required 
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    {scopeType === 'tags' 
                      ? "L'utilisateur verra les conteneurs possédant au moins un de ces tags." 
                      : "L'utilisateur verra uniquement les conteneurs tournant sur cette machine."}
                  </span>
                </div>
              )}

              <span style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', display: 'block', minHeight: '1.2rem' }}>{saveStatus}</span>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-user-plus"></i>
                <span>Créer l'utilisateur</span>
              </button>
            </form>
          </div>

        </div>
      </section>
    </div>
  );
}
