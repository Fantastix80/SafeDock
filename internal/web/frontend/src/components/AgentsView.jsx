import React, { useState } from 'react';

export default function AgentsView() {
  const [agents, setAgents] = useState([
    { name: 'prod-swarm-01', ip: '192.168.1.90', status: 'connected', version: 'v0.9.5', containers: 12, cpu: '14%', memory: '2.4 GB / 8 GB' },
    { name: 'db-node-02', ip: '192.168.1.91', status: 'connected', version: 'v0.9.5', containers: 4, cpu: '8%', memory: '1.8 GB / 4 GB' },
    { name: 'stage-aws-us-east', ip: '10.0.4.15', status: 'connected', version: 'v0.9.5', containers: 6, cpu: '22%', memory: '3.1 GB / 8 GB' },
    { name: 'edge-node-02', ip: '192.168.1.95', status: 'offline', version: 'v0.9.3', containers: 0, cpu: '0%', memory: '0 GB / 2 GB' }
  ]);

  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentIp, setNewAgentIp] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const handleAddAgent = (e) => {
    e.preventDefault();
    if (!newAgentName || !newAgentIp) return;
    setSaveStatus('Enrôlement...');
    setTimeout(() => {
      setAgents(prev => [...prev, {
        name: newAgentName,
        ip: newAgentIp,
        status: 'connected',
        version: 'v0.9.5',
        containers: 0,
        cpu: '2%',
        memory: '0.4 GB / 4 GB'
      }]);
      setNewAgentName('');
      setNewAgentIp('');
      setSaveStatus('✅ Nouvel agent hôte connecté avec succès !');
      setTimeout(() => setSaveStatus(''), 4000);
    }, 1000);
  };

  return (
    <div id="view-agents" className="page-view">
      <section className="section-container">
        
        {/* Title */}
        <div className="section-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h3>
              <i className="fa-solid fa-server text-primary" style={{ marginRight: '0.5rem' }}></i>
              Gestion des Agents Multi-Hôtes
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Enrôlez et administrez des daemons Docker décentralisés sur plusieurs serveurs physiques ou cloud.
            </p>
          </div>
        </div>

        {/* Outer Split Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
          
          {/* Left panel: Active Agents List Table & Guides */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* List Card */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Agents Actifs ({agents.filter(a => a.status === 'connected').length} / {agents.length})
              </h4>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '35px' }}>
                      <th style={{ padding: '0.5rem' }}>Nom de l'hôte</th>
                      <th style={{ padding: '0.5rem' }}>Adresse IP</th>
                      <th style={{ padding: '0.5rem' }}>Statut</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>Conteneurs</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>CPU / RAM</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map(a => (
                      <tr key={a.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <i className="fa-solid fa-server" style={{ color: a.status === 'connected' ? 'var(--primary)' : 'var(--text-muted)', fontSize: '0.8rem' }}></i>
                          {a.name}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.ip}</td>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span className="status-indicator online" style={{ fontSize: '0.75rem', color: a.status === 'connected' ? 'var(--success)' : 'var(--danger)' }}>
                            <span className="pulse-dot" style={{ backgroundColor: a.status === 'connected' ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 8px ${a.status === 'connected' ? 'var(--success)' : 'var(--danger)'}` }}></span>
                            {a.status === 'connected' ? 'Connecté' : 'Hors ligne'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{a.containers}</td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {a.status === 'connected' ? `${a.cpu} • ${a.memory}` : '-'}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{a.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Premium Setup instructions guide */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setShowGuide(!showGuide)}
              >
                <h4 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fa-solid fa-circle-info" style={{ color: 'var(--primary)' }}></i>
                  Comment installer un Agent sur une machine distante ?
                </h4>
                <i className={`fa-solid ${showGuide ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}></i>
              </div>

              {showGuide && (
                <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', animation: 'fadeIn 0.2s ease-in' }}>
                  <p>Pour lier un nouvel hôte Linux / Docker à votre console SafeDock SecOps, exécutez la commande d'enrôlement automatique ci-dessous en tant que <code>root</code> sur le serveur cible :</p>
                  
                  <div style={{ position: 'relative', marginTop: '0.75rem', marginBottom: '1.25rem' }}>
                    <code style={{ display: 'block', padding: '1rem', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--primary)', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre' }}>
                      curl -sSL https://safedock.local/install.sh | bash -s -- --token sd_agent_tok_8a92b8cd19f08831 --server 192.168.1.90
                    </code>
                  </div>

                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '0.5rem' }}><i className="fa-solid fa-list-check" style={{ marginRight: '0.4rem' }}></i> Pré-requis :</strong>
                  <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: 0 }}>
                    <li>Système d'exploitation Linux (Ubuntu, Debian, CentOS, AlmaLinux ou Rocky).</li>
                    <li>Docker Engine v20.10+ installé et en cours d'exécution.</li>
                    <li>Le port <code>2375</code> ou <code>2376</code> (TLS) accessible en local/réseau interne pour le docker-proxy.</li>
                  </ul>
                </div>
              )}
            </div>

          </div>

          {/* Right panel: Enroll Agent Form */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', height: 'fit-content' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-plus-circle" style={{ color: 'var(--primary)' }}></i>
              Enrôler un hôte
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Ajoutez l'adresse IP et le nom d'un hôte sur lequel l'agent SafeDock SecOps Daemon est déjà déployé ou en cours de déploiement.
            </p>

            <form onSubmit={handleAddAgent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nom d'affichage de l'hôte</label>
                <input 
                  type="text" 
                  placeholder="ex: edge-node-03" 
                  className="glass-input" 
                  value={newAgentName} 
                  onChange={e => setNewAgentName(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Adresse IP du daemon</label>
                <input 
                  type="text" 
                  placeholder="ex: 192.168.1.96" 
                  className="glass-input" 
                  value={newAgentIp} 
                  onChange={e => setNewAgentIp(e.target.value)} 
                  required 
                />
              </div>

              <span style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', display: 'block', minHeight: '1.2rem' }}>{saveStatus}</span>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-server"></i>
                <span>Connecter l'Agent</span>
              </button>
            </form>
          </div>

        </div>
      </section>
    </div>
  );
}
