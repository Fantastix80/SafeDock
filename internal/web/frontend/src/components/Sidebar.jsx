import React from 'react';

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="logo-area">
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
        <div className="logo-text">
          <h1>SafeDock</h1>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <div 
          className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} 
          onClick={() => onNavigate('dashboard')}
        >
          <i className="fa-solid fa-chart-line"></i> Dashboard
        </div>
        <div 
          className={`nav-item ${activePage === 'containers' ? 'active' : ''}`} 
          onClick={() => onNavigate('containers')}
        >
          <i className="fa-solid fa-cubes"></i> Conteneurs
        </div>
        <div 
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} 
          onClick={() => onNavigate('settings')}
        >
          <i className="fa-solid fa-sliders"></i> Paramètres
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator online">
          <span className="pulse-dot"></span>
          <span>Démon Actif</span>
        </div>
        <span className="version">v0.9.5</span>
      </div>
    </aside>
  );
}
