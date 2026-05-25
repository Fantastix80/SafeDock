import React, { useState } from 'react';

export default function ContainersView({ containers, onSelectContainer }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredContainers = containers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.image.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="view-containers" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-cubes"></i> 
            Statuts et métadonnées de sécurité
          </h3>
          <div className="filters">
            <input 
              type="text" 
              id="containers-table-search" 
              placeholder="Rechercher un conteneur..." 
              className="glass-input" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: '240px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="glass" style={{ padding: '1.5rem', overflowX: 'auto', marginTop: '1.5rem', borderRadius: '12px' }}>
          <table className="semantic-containers-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '40px' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Statut SecOps</th>
                <th style={{ padding: '0.75rem 1rem' }}>Nom du conteneur</th>
                <th style={{ padding: '0.75rem 1rem' }}>Image et version</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Digest immuable</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Utilisateur non-root</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Privilèges</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Secrets</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody id="containers-table-rows">
              {containers.length === 0 ? (
                <tr style={{ color: 'var(--text-muted)' }}>
                  <td colSpan="8" style={{ padding: '2rem', textAlign: 'center' }}>
                    Chargement du tableau des conteneurs...
                  </td>
                </tr>
              ) : filteredContainers.length === 0 ? (
                <tr style={{ color: 'var(--text-muted)' }}>
                  <td colSpan="8" style={{ padding: '2rem', textAlign: 'center' }}>
                    Aucun conteneur ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredContainers.map(c => {
                  const grade = c.grade ? c.grade.toLowerCase() : 'f';
                  let scoreClass = 'score-a';
                  if (c.score < 60) scoreClass = 'score-f';
                  else if (c.score < 90) scoreClass = 'score-c';

                  return (
                    <tr 
                      key={c.id} 
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
                      onClick={() => onSelectContainer(c.id)}
                    >
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div className={`card-badge-score ${scoreClass}`} style={{ width: '32px', height: '32px', fontSize: '1rem' }}>
                          {c.grade || 'F'}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.image}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <i className={`fa-solid ${c.tag_pinned ? 'fa-circle-check text-success' : 'fa-circle-xmark text-red'}`} style={{ fontSize: '1.1rem' }}></i>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <i className={`fa-solid ${c.non_root ? 'fa-circle-check text-success' : 'fa-circle-xmark text-red'}`} style={{ fontSize: '1.1rem' }}></i>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <i className={`fa-solid ${c.privileged_safe ? 'fa-shield-halved text-success' : 'fa-triangle-exclamation text-yellow'}`} style={{ fontSize: '1.1rem' }}></i>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {c.secret_leaks && c.secret_leaks.length > 0 ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                            {c.secret_leaks.length} FUITE(S)
                          </span>
                        ) : (
                          <i className="fa-solid fa-circle-check text-success" style={{ fontSize: '1.1rem' }}></i>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <button 
                          className="btn btn-accent" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectContainer(c.id);
                          }}
                          type="button"
                        >
                          <i className="fa-solid fa-magnifying-glass"></i> Inspecter
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
