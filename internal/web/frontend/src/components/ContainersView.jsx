import React, { useState } from 'react';

export default function ContainersView({ containers, onSelectContainer, onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // 1. Column Sorting Logic
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to page 1 on sort change
  };

  // Helper to render sort icons
  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <i className="fa-solid fa-sort" style={{ marginLeft: '0.4rem', opacity: 0.35 }}></i>;
    }
    return sortDirection === 'asc' 
      ? <i className="fa-solid fa-chevron-up" style={{ marginLeft: '0.4rem', color: 'var(--primary)' }}></i>
      : <i className="fa-solid fa-chevron-down" style={{ marginLeft: '0.4rem', color: 'var(--primary)' }}></i>;
  };

  // Filter list by search term
  const filteredContainers = containers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.image.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort list
  const sortedContainers = [...filteredContainers].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    // Boolean mapping
    if (typeof aVal === 'boolean') {
      aVal = aVal ? 1 : 0;
      bVal = bVal ? 1 : 0;
    }
    
    // Numeric handling
    if (typeof aVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // String handling
    aVal = (aVal || '').toString().toLowerCase();
    bVal = (bVal || '').toString().toLowerCase();
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // 2. Pagination Calculations
  const totalItems = sortedContainers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const activePageNum = currentPage > totalPages ? totalPages : currentPage;
  const indexOfLastItem = activePageNum * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedContainers.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div id="view-containers" className="page-view">
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-cubes"></i> 
            Statuts et métadonnées de sécurité
          </h3>
          
          {/* Overhauled Search Box without the weird borders */}
          <div className="search-box-container">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input 
              type="text" 
              id="containers-table-search" 
              placeholder="Rechercher un conteneur..." 
              className="glass-input search-input" 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to page 1 on search
              }}
            />
          </div>
        </div>
        
        <div className="glass" style={{ padding: '1.5rem', overflowX: 'auto', marginTop: '1.5rem', borderRadius: '12px' }}>
          <table className="semantic-containers-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '40px' }}>
                <th style={{ padding: '0.75rem 1rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('score')}>
                  Statut SecOps {renderSortIcon('score')}
                </th>
                <th style={{ padding: '0.75rem 1rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                  Nom du conteneur {renderSortIcon('name')}
                </th>
                <th style={{ padding: '0.75rem 1rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('image')}>
                  Image et version {renderSortIcon('image')}
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('tag_pinned')}>
                  Digest immuable {renderSortIcon('tag_pinned')}
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('non_root')}>
                  Utilisateur non-root {renderSortIcon('non_root')}
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('privileged_safe')}>
                  Privilèges {renderSortIcon('privileged_safe')}
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('secret_leaks')}>
                  Secrets {renderSortIcon('secret_leaks')}
                </th>
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
              ) : currentItems.length === 0 ? (
                <tr style={{ color: 'var(--text-muted)' }}>
                  <td colSpan="8" style={{ padding: '2rem', textAlign: 'center' }}>
                    Aucun conteneur ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                currentItems.map(c => {
                  const grade = c.grade ? c.grade.toLowerCase() : 'f';
                  let scoreClass = 'score-a';
                  if (c.score < 60) scoreClass = 'score-f';
                  else if (c.score < 90) scoreClass = 'score-c';

                  return (
                    <tr 
                      key={c.id} 
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', cursor: 'pointer' }}
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
                        <i className={`fa-solid ${c.tag_pinned ? 'fa-circle-check text-success' : 'fa-circle-xmark text-danger'}`} style={{ fontSize: '1.1rem' }}></i>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <i className={`fa-solid ${c.non_root ? 'fa-circle-check text-success' : 'fa-circle-xmark text-danger'}`} style={{ fontSize: '1.1rem' }}></i>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <i className={`fa-solid ${c.privileged_safe ? 'fa-shield-halved text-success' : 'fa-triangle-exclamation text-warning'}`} style={{ fontSize: '1.1rem' }}></i>
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
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          {/* Inspect (Eye) Button - Brand Primary Blue */}
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectContainer(c.id);
                            }}
                            title="Inspecter le conteneur (Détails)"
                            type="button"
                          >
                            <i className="fa-solid fa-eye" style={{ fontSize: '0.85rem' }}></i>
                          </button>
                          
                          {/* Settings (Cog) Button - Secondary Bordered */}
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('settings');
                            }}
                            title="Configurer les surcharges"
                            type="button"
                          >
                            <i className="fa-solid fa-cog" style={{ fontSize: '0.85rem' }}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* 3. Overhauled Pagination Component */}
          {totalPages > 1 && (
            <div className="pagination-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Affichage de <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{indexOfFirstItem + 1}</span> à <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{Math.min(indexOfLastItem, totalItems)}</span> sur <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalItems}</span> conteneurs
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button 
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '8px' }}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={activePageNum === 1}
                  type="button"
                >
                  <i className="fa-solid fa-chevron-left"></i> Précédent
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    className={`btn ${activePageNum === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', borderRadius: '8px', minWidth: '30px' }}
                    onClick={() => setCurrentPage(i + 1)}
                    type="button"
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '8px' }}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={activePageNum === totalPages}
                  type="button"
                >
                  Suivant <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
