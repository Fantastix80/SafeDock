import React, { useState, useEffect } from 'react';

export default function Header({ 
  activePage, 
  theme, 
  onToggleTheme, 
  onRefresh, 
  isRefreshing,
  onNavigate 
}) {
  const [currentTime, setCurrentTime] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
      setCurrentTime(now.toLocaleDateString('fr-FR', options));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const closeDropdown = () => setIsDropdownOpen(false);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [isDropdownOpen]);

  const getPageMeta = () => {
    switch (activePage) {
      case 'dashboard':
        return {
          title: "Tableau de bord de sécurité",
          desc: currentTime || "Analyse en temps réel de votre hôte Docker"
        };
      case 'containers':
        return {
          title: "Statuts et métadonnées de sécurité",
          desc: "Liste complète de vos conteneurs actifs et évaluation SecOps"
        };
      case 'watch':
        return {
          title: "Veille SecOps & Menaces",
          desc: "Bulletins de vulnérabilités en temps réel et guides de durcissement Docker"
        };
      case 'notifications':
        return {
          title: "Centre de Notifications",
          desc: "Alertes et événements de sécurité récents de vos infrastructures"
        };
      case 'account':
        return {
          title: "Mon Compte SecOps",
          desc: "Gérez votre identité, vos préférences d'alertes et vos jetons d'accès"
        };
      case 'settings':
        return {
          title: "Configuration de sécurité",
          desc: "Ajustez les règles SecOps globales et configurez vos accès et surcharges"
        };
      case 'container-settings':
        return {
          title: "Surcharges SecOps du conteneur",
          desc: "Définissez des seuils de tolérance spécifiques à ce conteneur particulier"
        };
      case '404':
        return {
          title: "Accès Bloqué - 404 Not Found",
          desc: "La ressource demandée n'existe pas ou a été déplacée"
        };
      default:
        return {
          title: "SafeDock SecOps",
          desc: "Analyse en temps réel"
        };
    }
  };

  const meta = getPageMeta();

  return (
    <header className="main-header" style={{ position: 'relative' }}>
      <div className="header-title">
        <h2>{meta.title}</h2>
        <p>{meta.desc}</p>
      </div>
      <div className="header-actions">
        {/* Capsule Theme Switcher */}
        <div 
          className="theme-switch-pill" 
          id="theme-toggle-pill"
          onClick={() => onToggleTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <div className="theme-switch-slider"></div>
          <button 
            className={`theme-switch-btn ${theme === 'dark' ? 'active' : ''}`}
            data-theme="dark"
            title="Thème Nuit"
            type="button"
          >
            <i className="fa-solid fa-moon"></i>
          </button>
          <button 
            className={`theme-switch-btn ${theme === 'light' ? 'active' : ''}`}
            data-theme="light"
            title="Thème Clair"
            type="button"
          >
            <i className="fa-solid fa-sun"></i>
          </button>
        </div>

        {/* Separator line */}
        <div className="header-separator"></div>

        {/* Clickable User Profile Dropdown */}
        <div 
          className="user-profile" 
          onClick={(e) => {
            e.stopPropagation();
            setIsDropdownOpen(!isDropdownOpen);
          }}
          style={{ position: 'relative', cursor: 'pointer', userSelect: 'none' }}
        >
          <img src="/avatar.png" alt="Hell0W0rld" className="user-avatar" />
          <div className="user-info">
            <span className="user-name">Hell0W0rld</span>
            <span className="user-role">SecOps Admin</span>
          </div>
          
          <i className="fa-solid fa-chevron-down" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}></i>

          {/* Profile Dropdown Card */}
          {isDropdownOpen && (
            <div 
              className="glass" 
              style={{ 
                position: 'absolute', 
                top: '55px', 
                right: '0', 
                width: '230px', 
                padding: '0.75rem', 
                borderRadius: '12px', 
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)', 
                border: '1px solid var(--border-color)', 
                zIndex: 100, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.25rem',
                textAlign: 'left'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Hell0W0rld</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>secops-admin@safedock.local</div>
              </div>

              <div 
                className="dropdown-item-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                onClick={() => {
                  setIsDropdownOpen(false);
                  onNavigate('account');
                }}
              >
                <i className="fa-solid fa-user-gear" style={{ width: '15px' }}></i> Mon compte
              </div>

              <div 
                className="dropdown-item-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                onClick={() => {
                  setIsDropdownOpen(false);
                  onNavigate('account');
                }}
              >
                <i className="fa-solid fa-bell" style={{ width: '15px' }}></i> Préférences d'alertes
              </div>

              <div 
                className="dropdown-item-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                onClick={() => {
                  setIsDropdownOpen(false);
                  onNavigate('settings');
                }}
              >
                <i className="fa-solid fa-sliders" style={{ width: '15px' }}></i> Paramètres globaux
              </div>

              <div 
                className="dropdown-item-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                onClick={() => {
                  setIsDropdownOpen(false);
                  onNavigate('settings');
                }}
              >
                <i className="fa-solid fa-building-shield" style={{ width: '15px' }}></i> Paramètres d'organisation
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
