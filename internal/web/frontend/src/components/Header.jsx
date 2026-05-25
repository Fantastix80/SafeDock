import React, { useState, useEffect } from 'react';

export default function Header({ activePage, theme, onToggleTheme, onRefresh, isRefreshing }) {
  const [currentTime, setCurrentTime] = useState('');

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
      case 'enterprise':
        return {
          title: "Paramètres SecOps d'Entreprise",
          desc: "Gérez le MFA, l'authentification unique (SSO) et les permissions RBAC globales"
        };
      case 'settings':
        return {
          title: "Configuration de sécurité",
          desc: "Ajustez les règles SecOps globales et configurez vos accès et surcharges"
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
    <header className="main-header">
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

        {/* User Profile Card */}
        <div className="user-profile">
          <img src="/avatar.png" alt="Hell0W0rld" className="user-avatar" />
          <div className="user-info">
            <span className="user-name">Hell0W0rld</span>
            <span className="user-role">SecOps Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
