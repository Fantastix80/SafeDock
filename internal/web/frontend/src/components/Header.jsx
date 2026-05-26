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
      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
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
          title: 'Tableau de bord de sécurité',
          desc: currentTime || 'Analyse en temps réel de votre hôte Docker'
        };
      case 'containers':
        return {
          title: 'Statuts et métadonnées de sécurité',
          desc: 'Liste complète de vos conteneurs actifs et évaluation SecOps'
        };
      case 'watch':
        return {
          title: 'Veille SecOps & Menaces',
          desc: 'Bulletins de vulnérabilités en temps réel et guides de durcissement Docker'
        };
      case 'notifications':
        return {
          title: 'Centre de Notifications',
          desc: 'Alertes et événements de sécurité récents de vos infrastructures'
        };
      case 'account':
        return {
          title: 'Mon Compte SecOps',
          desc: 'Gérez votre identité, vos préférences d\'alertes et vos jetons d\'accès'
        };
      case 'settings':
        return {
          title: 'Configuration de sécurité',
          desc: 'Règles SecOps globales, accès et surcharges de politiques'
        };
      case 'container-settings':
        return {
          title: 'Surcharges SecOps du conteneur',
          desc: 'Seuils de tolérance spécifiques à ce conteneur'
        };
      case 'actions':
        return {
          title: 'Actions SecOps requises',
          desc: 'Déploiements, rollouts et correctifs à appliquer'
        };
      case 'agents':
        return {
          title: 'Agents SecOps',
          desc: 'Gestion des agents de surveillance distribués'
        };
      case 'permissions':
        return {
          title: 'Gestion des Permissions',
          desc: 'Contrôle d\'accès, rôles et périmètres utilisateurs'
        };
      case 'container-detail':
        return {
          title: 'Cockpit du conteneur',
          desc: 'Détails, scans de vulnérabilités et conformité'
        };
      case '404':
        return {
          title: 'Accès Bloqué — 404',
          desc: 'La ressource demandée n\'existe pas ou a été déplacée'
        };
      default:
        return {
          title: 'SafeDock SecOps',
          desc: 'Analyse en temps réel'
        };
    }
  };

  const meta = getPageMeta();

  return (
    <header className="main-header">
      {/* Page title */}
      <div className="header-title">
        <h2>{meta.title}</h2>
        <p>{meta.desc}</p>
      </div>

      {/* Right-side controls */}
      <div className="header-actions">
        {/* Theme toggle */}
        <div
          className="theme-switch-pill"
          onClick={() => onToggleTheme(theme === 'light' ? 'dark' : 'light')}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Basculer le thème"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onToggleTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <div className="theme-switch-slider"></div>
          <button
            className={`theme-switch-btn ${theme === 'dark' ? 'active' : ''}`}
            data-theme="dark"
            title="Thème Nuit"
            type="button"
            tabIndex={-1}
          >
            <i className="fa-solid fa-moon" aria-hidden="true"></i>
          </button>
          <button
            className={`theme-switch-btn ${theme === 'light' ? 'active' : ''}`}
            data-theme="light"
            title="Thème Clair"
            type="button"
            tabIndex={-1}
          >
            <i className="fa-solid fa-sun" aria-hidden="true"></i>
          </button>
        </div>

        <div className="header-separator" role="separator"></div>

        {/* User profile */}
        <div className="user-profile" style={{ position: 'relative' }}>
          {/* Avatar + name → navigates to account */}
          <img
            src="/avatar.png"
            alt="Avatar utilisateur"
            className="user-avatar"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('account');
            }}
          />
          <div
            className="user-info"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate('account');
            }}
          >
            <span className="user-name">Hell0W0rld</span>
            <span className="user-role">SecOps Admin</span>
          </div>

          {/* Chevron → toggles dropdown */}
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-2)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            aria-label="Menu utilisateur"
            aria-expanded={isDropdownOpen}
          >
            <i
              className={`fa-solid fa-chevron-down`}
              style={{
                fontSize: '0.65rem',
                transition: 'transform 0.15s ease',
                transform: isDropdownOpen ? 'rotate(180deg)' : 'none'
              }}
              aria-hidden="true"
            ></i>
          </button>

          {/* Dropdown */}
          {isDropdownOpen && (
            <div
              className="profile-dropdown"
              onClick={(e) => e.stopPropagation()}
              role="menu"
            >
              <div className="profile-dropdown-header">
                <div className="pd-name">Hell0W0rld</div>
                <div className="pd-email">secops-admin@safedock.local</div>
              </div>

              <button
                className="dropdown-item-btn"
                role="menuitem"
                onClick={() => { setIsDropdownOpen(false); onNavigate('account'); }}
              >
                <i className="fa-solid fa-user-gear" aria-hidden="true"></i>
                Mon compte
              </button>

              <button
                className="dropdown-item-btn"
                role="menuitem"
                onClick={() => { setIsDropdownOpen(false); onNavigate('notifications'); }}
              >
                <i className="fa-solid fa-bell" aria-hidden="true"></i>
                Préférences d'alertes
              </button>

              <button
                className="dropdown-item-btn"
                role="menuitem"
                onClick={() => { setIsDropdownOpen(false); onNavigate('settings'); }}
              >
                <i className="fa-solid fa-sliders" aria-hidden="true"></i>
                Paramètres globaux
              </button>

              <button
                className="dropdown-item-btn"
                role="menuitem"
                onClick={() => { setIsDropdownOpen(false); onNavigate('settings'); }}
              >
                <i className="fa-solid fa-building-shield" aria-hidden="true"></i>
                Paramètres d'organisation
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
