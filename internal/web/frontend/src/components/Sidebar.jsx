import React from 'react';

export default function Sidebar({ 
  activePage, 
  onNavigate, 
  isCollapsed, 
  onToggleCollapse, 
  onRefresh, 
  isRefreshing 
}) {
  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      
      {/* Logo Area & Collapse Button */}
      <div className="logo-area" style={{ display: 'flex', justifyContent: isCollapsed ? 'center' : 'space-between', alignItems: 'center', width: '100%', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div className="logo-icon">
            <svg className="safedock-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--accent)" />
                  <stop offset="100%" stop-color="var(--primary)" />
                </linearGradient>
                <linearGradient id="containerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--info)" />
                  <stop offset="100%" stop-color="var(--primary)" />
                </linearGradient>
              </defs>
              {/* Outer Shield */}
              <path d="M50,8 L85,22 L85,55 C85,75 50,88 50,88 C50,88 15,75 15,55 L15,22 Z" fill="none" stroke="url(#shieldGrad)" stroke-width="6" stroke-linejoin="round" />
              {/* Inner Glow Shield */}
              <path d="M50,16 L77,27 L77,53 C77,69 50,79 50,79 C50,79 23,69 23,53 L23,27 Z" fill="none" stroke="url(#shieldGrad)" stroke-width="1.5" opacity="0.4" />
              {/* Padlock Handle Loop */}
              <path d="M41,36 L41,27 C41,21 59,21 59,27 L59,36" fill="none" stroke="url(#containerGrad)" stroke-width="4.5" stroke-linecap="round" />
              {/* Docker Container (Isometric Cube) */}
              {/* Top Face */}
              <path d="M50,34 L70,42 L50,50 L30,42 Z" fill="url(#containerGrad)" opacity="0.9" />
              {/* Left Face */}
              <path d="M30,42 L50,50 L50,70 L30,62 Z" fill="var(--primary)" opacity="0.8" />
              {/* Right Face */}
              <path d="M50,50 L70,42 L70,62 L50,70 Z" fill="var(--primary)" />
              {/* Divider lines on Isometric Cube */}
              <path d="M40,46 L40,66" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
              <path d="M60,46 L60,66" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="logo-text">
              <h1>SafeDock</h1>
            </div>
          )}
        </div>
        
        <button 
          className="sidebar-collapse-btn" 
          onClick={onToggleCollapse}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-secondary)', 
            cursor: 'pointer', 
            fontSize: '0.85rem', 
            width: '28px', 
            height: '28px', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(255, 255, 255, 0.02)', 
            border: '1px solid var(--border-color)',
            marginLeft: isCollapsed ? '0' : '0.5rem',
            marginTop: isCollapsed ? '0.75rem' : '0'
          }}
          title={isCollapsed ? "Déplier le menu" : "Replier le menu"}
          type="button"
        >
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
        </button>
      </div>
      
      {/* Navigation Links */}
      <nav className="sidebar-nav" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div 
          className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} 
          onClick={() => onNavigate('dashboard')}
          title="Dashboard"
        >
          <i className="fa-solid fa-chart-line"></i>
          <span>Dashboard</span>
        </div>
        
        <div 
          className={`nav-item ${activePage === 'containers' ? 'active' : ''}`} 
          onClick={() => onNavigate('containers')}
          title="Conteneurs"
        >
          <i className="fa-solid fa-cubes"></i>
          <span>Conteneurs</span>
        </div>
        
        <div 
          className={`nav-item ${activePage === 'watch' ? 'active' : ''}`} 
          onClick={() => onNavigate('watch')}
          title="Veille SecOps"
        >
          <i className="fa-solid fa-newspaper"></i>
          <span>Veille SecOps</span>
        </div>
        
        <div 
          className={`nav-item ${activePage === 'notifications' ? 'active' : ''}`} 
          onClick={() => onNavigate('notifications')}
          title="Notifications"
        >
          <i className="fa-solid fa-bell"></i>
          <span>Notifications</span>
        </div>

        <div 
          className={`nav-item ${activePage === 'account' ? 'active' : ''}`} 
          onClick={() => onNavigate('account')}
          title="Mon Compte"
        >
          <i className="fa-solid fa-user-shield"></i>
          <span>Mon Compte</span>
        </div>

        <div 
          className={`nav-item ${activePage === 'enterprise' ? 'active' : ''}`} 
          onClick={() => onNavigate('enterprise')}
          title="Entreprise"
        >
          <i className="fa-solid fa-building-shield"></i>
          <span>Entreprise</span>
        </div>
      </nav>

      {/* Relocated Global Audit Action */}
      <div className="sidebar-audit-action" style={{ margin: '1rem 0' }}>
        <button 
          className={`btn btn-primary ${isRefreshing ? 'disabled' : ''}`} 
          style={{ 
            width: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '0.6rem', 
            padding: isCollapsed ? '0' : '0.75rem 1rem', 
            borderRadius: isCollapsed ? '50%' : '12px',
            minWidth: isCollapsed ? '44px' : 'auto',
            height: isCollapsed ? '44px' : 'auto'
          }}
          id="btn-global-refresh"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Lancer un Audit Global"
          type="button"
        >
          <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
          <span>Audit Global</span>
        </button>
      </div>

      {/* Settings Navigation Link - Relocated to Bottom */}
      <div 
        className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} 
        onClick={() => onNavigate('settings')}
        style={{ marginBottom: '1.25rem' }}
        title="Paramètres"
      >
        <i className="fa-solid fa-sliders"></i>
        <span>Paramètres</span>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
        <div className="status-indicator online">
          <span className="pulse-dot"></span>
          <span>Démon Actif</span>
        </div>
        <span className="version" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>v0.9.5</span>
      </div>
    </aside>
  );
}
