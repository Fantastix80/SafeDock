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

      {/* Logo + collapse toggle */}
      <div className="logo-area">
        <div className="logo-icon">
          <svg className="safedock-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--info)" />
              </linearGradient>
              <linearGradient id="containerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--info)" />
                <stop offset="100%" stopColor="var(--primary)" />
              </linearGradient>
            </defs>
            {/* Outer shield */}
            <path d="M50,8 L85,22 L85,55 C85,75 50,88 50,88 C50,88 15,75 15,55 L15,22 Z" fill="none" stroke="url(#shieldGrad)" strokeWidth="6" strokeLinejoin="round" />
            {/* Inner glow */}
            <path d="M50,16 L77,27 L77,53 C77,69 50,79 50,79 C50,79 23,69 23,53 L23,27 Z" fill="none" stroke="url(#shieldGrad)" strokeWidth="1.5" opacity="0.4" />
            {/* Padlock arc */}
            <path d="M41,36 L41,27 C41,21 59,21 59,27 L59,36" fill="none" stroke="url(#containerGrad)" strokeWidth="4.5" strokeLinecap="round" />
            {/* Cube — top face */}
            <path d="M50,34 L70,42 L50,50 L30,42 Z" fill="url(#containerGrad)" opacity="0.9" />
            {/* Cube — left face */}
            <path d="M30,42 L50,50 L50,70 L30,62 Z" fill="var(--primary)" opacity="0.8" />
            {/* Cube — right face */}
            <path d="M50,50 L70,42 L70,62 L50,70 Z" fill="var(--primary)" />
            {/* Cube dividers */}
            <path d="M40,46 L40,66" stroke="#ffffff" strokeWidth="1.5" opacity="0.25" />
            <path d="M60,46 L60,66" stroke="#ffffff" strokeWidth="1.5" opacity="0.25" />
          </svg>
        </div>
        {!isCollapsed && (
          <div className="logo-text">
            <h1>SafeDock</h1>
          </div>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Déplier le menu' : 'Replier le menu'}
          type="button"
          aria-label={isCollapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          <i className={`fa-solid ${isCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`}></i>
        </button>
      </div>

      {/* Primary navigation */}
      <nav className="sidebar-nav" aria-label="Navigation principale">
        <button
          className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
          title="Dashboard"
          aria-current={activePage === 'dashboard' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-chart-line" aria-hidden="true"></i>
          <span>Dashboard</span>
        </button>

        <button
          className={`nav-item ${activePage === 'containers' ? 'active' : ''}`}
          onClick={() => onNavigate('containers')}
          title="Conteneurs"
          aria-current={activePage === 'containers' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-cubes" aria-hidden="true"></i>
          <span>Conteneurs</span>
        </button>

        <button
          className={`nav-item ${activePage === 'actions' ? 'active' : ''}`}
          onClick={() => onNavigate('actions')}
          title="Actions SecOps"
          aria-current={activePage === 'actions' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
          <span>Actions</span>
        </button>

        <button
          className={`nav-item ${activePage === 'agents' ? 'active' : ''}`}
          onClick={() => onNavigate('agents')}
          title="Agents SecOps"
          aria-current={activePage === 'agents' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-server" aria-hidden="true"></i>
          <span>Agents</span>
        </button>

        <button
          className={`nav-item ${activePage === 'watch' ? 'active' : ''}`}
          onClick={() => onNavigate('watch')}
          title="Veille SecOps"
          aria-current={activePage === 'watch' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-newspaper" aria-hidden="true"></i>
          <span>Veille SecOps</span>
        </button>

        <button
          className={`nav-item ${activePage === 'notifications' ? 'active' : ''}`}
          onClick={() => onNavigate('notifications')}
          title="Notifications"
          aria-current={activePage === 'notifications' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-bell" aria-hidden="true"></i>
          <span>Notifications</span>
        </button>

        <button
          className={`nav-item ${activePage === 'permissions' ? 'active' : ''}`}
          onClick={() => onNavigate('permissions')}
          title="Permissions"
          aria-current={activePage === 'permissions' ? 'page' : undefined}
          type="button"
        >
          <i className="fa-solid fa-user-lock" aria-hidden="true"></i>
          <span>Permissions</span>
        </button>
      </nav>

      {/* Global audit action */}
      <div className="sidebar-audit-action">
        <button
          className={`btn btn-primary w-full ${isRefreshing ? 'disabled' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Lancer un Audit Global"
          type="button"
        >
          <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`} aria-hidden="true"></i>
          {!isCollapsed && <span>Audit Global</span>}
        </button>
      </div>

      {/* Settings link */}
      <button
        className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
        title="Paramètres"
        aria-current={activePage === 'settings' ? 'page' : undefined}
        type="button"
        style={{ marginBottom: '0.375rem' }}
      >
        <i className="fa-solid fa-sliders" aria-hidden="true"></i>
        <span>Paramètres</span>
      </button>

      {/* Version label */}
      {!isCollapsed && (
        <div className="version" style={{ padding: '0 0.75rem 0.25rem' }}>
          SafeDock v1.0.0
        </div>
      )}
      {isCollapsed && (
        <div className="version" style={{ textAlign: 'center', padding: '0 0 0.25rem' }}>
          v1
        </div>
      )}
    </aside>
  );
}
