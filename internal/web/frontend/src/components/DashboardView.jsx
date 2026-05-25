import React, { useState } from 'react';

export default function DashboardView({ containers, auditLogs, stats, onSelectContainer, onRefreshLogs }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredContainers = containers.filter(c => {
    if (activeFilter === 'secure') return c.score >= 75;
    if (activeFilter === 'warning') return c.score < 75;
    return true;
  });

  // Circular gauge config
  const circumference = 276.46;
  const score = stats.globalScore || 100;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = "var(--success)";
  let badgeClass = "badge badge-success";
  let statusText = "Excellent";

  if (score < 60) {
    strokeColor = "var(--danger)";
    badgeClass = "badge badge-danger";
    statusText = "Vulnérable";
  } else if (score < 90) {
    strokeColor = "var(--warning)";
    badgeClass = "badge badge-warning";
    statusText = "Améliorable";
  }

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
  };

  const getLogStatusClass = (status) => {
    switch (status) {
      case 'SUCCESS':
      case 'CLEAN':
        return 'status-log-success';
      case 'BLOCKED':
        return 'status-log-blocked';
      case 'FAILED':
      default:
        return 'status-log-failed';
    }
  };

  // Calculate aggregated CVE counts across all containers
  const cveCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  (containers || []).forEach(c => {
    if (c.vulnerabilities) {
      c.vulnerabilities.forEach(v => {
        const sev = v.severity ? v.severity.toLowerCase() : 'low';
        if (cveCounts[sev] !== undefined) {
          cveCounts[sev]++;
        }
      });
    }
  });

  const chartWidth = 500;
  const chartHeight = 200;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const maxVal = Math.max(cveCounts.critical, cveCounts.high, cveCounts.medium, cveCounts.low, 5);
  const baselineY = chartHeight - paddingBottom;
  const drawingHeight = baselineY - paddingTop;

  const getBarHeight = (val) => {
    return (val / maxVal) * (drawingHeight - 15);
  };

  const getBarY = (val) => {
    return baselineY - getBarHeight(val);
  };

  // Helper to draw clean paths for rounded top bars
  const drawBarPath = (x, y, w, h, rx = 6) => {
    if (h <= 0) return '';
    const r = Math.min(rx, h);
    return `
      M ${x},${y + h}
      L ${x},${y + r}
      A ${r},${r} 0 0 1 ${x + r},${y}
      L ${x + w - r},${y}
      A ${r},${r} 0 0 1 ${x + w},${y + r}
      L ${x + w},${y + h}
      Z
    `.replace(/\s+/g, ' ').trim();
  };

  const barWidth = 45;
  const gap = 55;
  const startX = paddingLeft + 45;

  const severityData = [
    { label: 'Critique', count: cveCounts.critical, color: '#EF4444', glow: 'rgba(239, 68, 68, 0.45)' },
    { label: 'Haute', count: cveCounts.high, color: '#F97316', glow: 'rgba(249, 115, 22, 0.4)' },
    { label: 'Moyenne', count: cveCounts.medium, color: '#FBBF24', glow: 'rgba(251, 191, 36, 0.4)' },
    { label: 'Basse', count: cveCounts.low, color: '#4578F9', glow: 'rgba(69, 120, 249, 0.4)' }
  ];

  return (
    <div id="view-dashboard" className="page-view">
      {/* Overhauled 3-Card Summary Stats Row */}
      <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* Audited Containers Count */}
        <div className="stat-card glass">
          <div className="stat-icon bg-blue">
            <i className="fa-solid fa-box"></i>
          </div>
          <div className="stat-data">
            <span className="stat-value" id="stat-containers-count">{stats.total}</span>
            <span className="stat-label">Conteneurs Audités</span>
          </div>
        </div>

        {/* Alerts Count */}
        <div className="stat-card glass">
          <div className="stat-icon bg-red">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div className="stat-data">
            <span className="stat-value" id="stat-alerts-count">{stats.warnings}</span>
            <span className="stat-label">Alertes Critiques</span>
          </div>
        </div>

        {/* Pending Updates Count */}
        <div className="stat-card glass">
          <div className="stat-icon bg-yellow">
            <i className="fa-solid fa-cloud-arrow-down"></i>
          </div>
          <div className="stat-data">
            <span className="stat-value" id="stat-updates-count">{stats.updatesAvailable}</span>
            <span className="stat-label">Mises à Jour Dispo</span>
          </div>
        </div>
      </section>

      {/* Visual Analytics Row: Chart + Circular Gauge */}
      <section className="dashboard-visuals">
        {/* Left: Custom SVG CVE Severity Bar Chart */}
        <div className="glass chart-card">
          <div className="chart-header">
            <div>
              <h3>Gravité des Failles de Sécurité (CVE)</h3>
              <p>Nombre total de vulnérabilités en cours détectées sur vos conteneurs</p>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: 'var(--primary)' }}></span>
                <span>Cumul global</span>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', height: '140px', marginTop: '0.5rem' }}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
              
              {/* Baseline Axis */}
              <line 
                x1={paddingLeft} 
                y1={baselineY} 
                x2={chartWidth - paddingRight} 
                y2={baselineY} 
                stroke="var(--border-color)" 
                strokeWidth="1.5" 
              />

              {/* Grid Lines */}
              {[...Array(4)].map((_, i) => {
                const step = Math.ceil(maxVal / 4);
                const val = (i + 1) * step;
                const gridY = baselineY - (val / maxVal) * (drawingHeight - 15);
                return (
                  <g key={val}>
                    <line 
                      x1={paddingLeft} 
                      y1={gridY} 
                      x2={chartWidth - paddingRight} 
                      y2={gridY} 
                      stroke="var(--border-color)" 
                      strokeWidth="1" 
                      strokeDasharray="4,4" 
                    />
                    <text 
                      x={paddingLeft - 8} 
                      y={gridY + 4} 
                      fill="var(--text-secondary)" 
                      fontSize="10" 
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Render Severity Bars */}
              {severityData.map((data, idx) => {
                const x = startX + idx * (barWidth + gap);
                const h = getBarHeight(data.count);
                const y = baselineY - h;

                return (
                  <g key={data.label}>
                    {/* Glowing background bar */}
                    {h > 0 && (
                      <path 
                        d={drawBarPath(x, y, barWidth, h, 6)} 
                        fill={data.color}
                        opacity="0.1"
                        style={{ filter: `drop-shadow(0 2px 10px ${data.glow})` }}
                      />
                    )}

                    {/* Main Bar */}
                    {h > 0 ? (
                      <path 
                        d={drawBarPath(x, y, barWidth, h, 6)} 
                        fill={data.color}
                      />
                    ) : (
                      // Draw a tiny baseline indicator when 0 CVEs
                      <rect 
                        x={x} 
                        y={baselineY - 2} 
                        width={barWidth} 
                        height={2} 
                        fill="var(--border-color)" 
                        rx="1" 
                      />
                    )}

                    {/* Count Text on top of Bar */}
                    <text 
                      x={x + barWidth / 2} 
                      y={h > 0 ? y - 6 : baselineY - 8} 
                      fill={h > 0 ? 'var(--text-primary)' : 'var(--text-muted)'} 
                      fontSize="11" 
                      fontWeight="700" 
                      textAnchor="middle"
                    >
                      {data.count}
                    </text>

                    {/* X Axis Label */}
                    <text 
                      x={x + barWidth / 2} 
                      y={chartHeight - 8} 
                      fill="var(--text-secondary)" 
                      fontSize="11" 
                      fontWeight="600" 
                      textAnchor="middle"
                    >
                      {data.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right: Circular SecOps Gauge Circle Card */}
        <div className="stat-card glass score-card">
          <div className="score-container">
            <div className="score-circle">
              <svg className="score-ring" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44"></circle>
                <circle 
                  cx="50" 
                  cy="50" 
                  r="44" 
                  id="score-ring-progress"
                  style={{ strokeDashoffset, stroke: strokeColor }}
                ></circle>
                <text 
                  x="50" 
                  y="50" 
                  textAnchor="middle" 
                  dominantBaseline="central" 
                  className="score-grade-text"
                >
                  {stats.globalGrade}
                </text>
              </svg>
            </div>
          </div>
          <div className="score-info">
            <h3>Score SecOps Global</h3>
            <p>Posture globale de sécurité de vos conteneurs actifs</p>
            <span className={badgeClass} id="global-status-badge">{statusText}</span>
          </div>
        </div>
      </section>

      {/* Containers Grid Section */}
      <section className="section-container">
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-list-check"></i> 
            Statuts des conteneurs en cours d'audit
          </h3>
          <div className="filters">
            <button 
              className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
              type="button"
            >
              Tous
            </button>
            <button 
              className={`filter-btn ${activeFilter === 'secure' ? 'active' : ''}`}
              onClick={() => setActiveFilter('secure')}
              type="button"
            >
              Sains
            </button>
            <button 
              className={`filter-btn ${activeFilter === 'warning' ? 'active' : ''}`}
              onClick={() => setActiveFilter('warning')}
              type="button"
            >
              Alertes
            </button>
          </div>
        </div>

        {containers.length === 0 ? (
          <div className="loading-state" id="containers-loading">
            <div className="spinner"></div>
            <p>Audit SecOps en cours de génération...</p>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="empty-state" id="containers-empty">
            <i className="fa-solid fa-folder-open"></i>
            <p>Aucun conteneur ne correspond au filtre actif.</p>
          </div>
        ) : (
          <div className="containers-grid" id="containers-list">
            {filteredContainers.map(c => {
              const grade = c.grade ? c.grade.toLowerCase() : 'f';
              let scoreClass = 'score-a';
              if (c.score < 60) scoreClass = 'score-f';
              else if (c.score < 90) scoreClass = 'score-c';

              return (
                <div 
                  key={c.id} 
                  className={`container-card glass grade-${grade}`}
                  onClick={() => onSelectContainer(c.id)}
                >
                  <div className="card-top">
                    <div className="card-title-group">
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0 }}>{c.name}</h4>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>({c.host_name})</span>
                      </div>
                      <span className="card-image-name">{c.image_name}:{c.image_tag}</span>
                    </div>
                    <div className={`card-badge-score ${scoreClass}`}>
                      {c.grade || 'F'}
                    </div>
                  </div>

                  <div className="card-indicators">
                    <span className={`indicator-pill ${c.tag_pinned ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${c.tag_pinned ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i> Pinning
                    </span>
                    <span className={`indicator-pill ${c.non_root ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${c.non_root ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i> Non-Root
                    </span>
                    <span className={`indicator-pill ${c.privileged_safe ? 'pass' : 'fail'}`}>
                      <i className={`fa-solid ${c.privileged_safe ? 'fa-circle-check' : 'fa-circle-xmark'}`}></i> Privilèges
                    </span>
                  </div>

                  <div className="card-bottom">
                    <span>Score : {c.score}/100</span>
                    {c.update_available ? (
                      <span className="update-tag update-avail">
                        <i className="fa-solid fa-cloud-arrow-down"></i> Mises à jour dispos
                      </span>
                    ) : (
                      <span className="update-tag">
                        <i className="fa-solid fa-check-double"></i> À jour
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Audit Logs Table Section */}
      <section className="section-container" style={{ marginTop: '3.5rem' }}>
        <div className="section-header">
          <h3>
            <i className="fa-solid fa-clock-rotate-left"></i> 
            Historique d'audit & activités SecOps
          </h3>
          <button 
            className="filter-btn" 
            id="btn-refresh-logs" 
            style={{ fontSize: '0.75rem' }}
            onClick={onRefreshLogs}
            type="button"
          >
            <i className="fa-solid fa-sync"></i> Recharger
          </button>
        </div>

        <div className="glass" style={{ padding: '1rem', overflowX: 'auto' }}>
          <table className="audit-logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, height: '35px' }}>
                <th style={{ padding: '0.5rem 1rem' }}>Date</th>
                <th style={{ padding: '0.5rem 1rem' }}>Conteneur</th>
                <th style={{ padding: '0.5rem 1rem' }}>Image / digest ciblé</th>
                <th style={{ padding: '0.5rem 1rem' }}>Statut</th>
                <th style={{ padding: '0.5rem 1rem' }}>Détails / motif</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>CVEs (C/H/M)</th>
              </tr>
            </thead>
            <tbody id="audit-logs-rows">
              {auditLogs.length === 0 ? (
                <tr style={{ color: 'var(--text-muted)' }}>
                  <td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    Aucun journal d'activité disponible.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                    <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{log.container_name}</td>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.image_ref || '-'}</td>
                    <td style={{ padding: '0.85rem 1rem' }} className={getLogStatusClass(log.status)}>
                      {log.status === 'SUCCESS' || log.status === 'CLEAN' ? 'SUCCÈS' : log.status === 'BLOCKED' ? 'BLOQUÉ' : 'ÉCHEC'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.message}</td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>
                      {log.status === 'SUCCESS' || log.status === 'CLEAN' ? '-' : `${log.cve_critical || 0}/${log.cve_high || 0}/${log.cve_medium || 0}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
