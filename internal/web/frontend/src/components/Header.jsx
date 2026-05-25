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
      case 'settings':
        return {
          title: "Configuration de sécurité",
          desc: "Ajustez les règles SecOps globales et configurez vos accès et surcharges"
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

        <button 
          className={`btn btn-primary ${isRefreshing ? 'disabled' : ''}`} 
          id="btn-global-refresh"
          onClick={onRefresh}
          disabled={isRefreshing}
          type="button"
        >
          <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
          <span>Lancer un Audit Global</span>
        </button>
      </div>
    </header>
  );
}
