import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import ContainersView from './components/ContainersView';
import SettingsView from './components/SettingsView';
import WatchView from './components/WatchView';
import AccountView from './components/AccountView';
import NotificationsView from './components/NotificationsView';
import EnterpriseView from './components/EnterpriseView';
import NotFoundView from './components/NotFoundView';
import ContainerSettingsView from './components/ContainerSettingsView';
import ActionsView from './components/ActionsView';
import AgentsView from './components/AgentsView';
import ContainerDetailView from './components/ContainerDetailView';
import PermissionsView from './components/PermissionsView';

export default function App() {
  const getPageFromPathname = () => {
    const path = window.location.pathname.replace('/', '');
    const validPages = ['dashboard', 'containers', 'watch', 'notifications', 'account', 'enterprise', 'settings', 'container-settings', 'actions', 'agents', 'container-detail', 'permissions'];
    if (!path || path === 'dashboard') return 'dashboard';
    if (validPages.includes(path)) return path;
    return '404';
  };

  const [activePage, setActivePage] = useState(getPageFromPathname());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [containers, setContainers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [registries, setRegistries] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [config, setConfig] = useState(null);
  
  const [theme, setTheme] = useState('dark');
  const [selectedContainerId, setSelectedContainerId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRolloutLoading, setIsRolloutLoading] = useState(false);
  const [rolloutStatusMsg, setRolloutStatusMsg] = useState({ text: '', type: '' });

  // Custom container tags state
  const [containerTags, setContainerTags] = useState(() => {
    const saved = localStorage.getItem('safedock-custom-tags');
    return saved ? JSON.parse(saved) : {};
  });

  // Simulated users & active user profile for scoping data permissions
  const [simulatedUsers, setSimulatedUsers] = useState(() => {
    const saved = localStorage.getItem('safedock-simulated-users');
    if (saved) return JSON.parse(saved);
    return [
      { id: 1, name: 'Jean Admin', role: 'Admin', scopeType: 'all', scopeValue: null, desc: 'Accès complet à l\'infrastructure' },
      { id: 2, name: 'Alice Dev', role: 'Lecteur', scopeType: 'tags', scopeValue: ['Staging', 'Dev'], desc: 'Limité aux tags Staging et Dev' },
      { id: 3, name: 'Bob Auditor', role: 'Auditeur', scopeType: 'hosts', scopeValue: ['db-node-02'], desc: 'Limité à l\'hôte db-node-02' },
      { id: 4, name: 'Charlie External', role: 'Lecteur', scopeType: 'hybrid', scopeValue: { host: 'prod-swarm-01', tag: 'Web' }, desc: 'Limité aux conteneurs Web de prod-swarm-01' }
    ];
  });

  const [activeUserProfile, setActiveUserProfile] = useState(() => {
    const saved = localStorage.getItem('safedock-active-user');
    return saved ? JSON.parse(saved) : { id: 1, name: 'Jean Admin', role: 'Admin', scopeType: 'all', scopeValue: null, desc: 'Accès complet à l\'infrastructure' };
  });

  const handleUpdateContainerTags = (containerName, newTags) => {
    setContainerTags(prev => {
      const updated = { ...prev, [containerName]: newTags };
      localStorage.setItem('safedock-custom-tags', JSON.stringify(updated));
      return updated;
    });
  };

  const getScopedContainers = () => {
    return containers.filter(c => {
      if (activeUserProfile.scopeType === 'all') return true;
      if (activeUserProfile.scopeType === 'tags') {
        const allowedTags = activeUserProfile.scopeValue;
        return (c.tags || []).some(tag => allowedTags.includes(tag));
      }
      if (activeUserProfile.scopeType === 'hosts') {
        const allowedHosts = activeUserProfile.scopeValue;
        return allowedHosts.includes(c.host_name);
      }
      if (activeUserProfile.scopeType === 'hybrid') {
        const { host, tag } = activeUserProfile.scopeValue;
        return c.host_name === host && (c.tags || []).includes(tag);
      }
      return true;
    });
  };

  const scopedContainers = getScopedContainers();

  const [stats, setStats] = useState({
    total: 0,
    secure: 0,
    warnings: 0,
    cves: 0,
    updatesAvailable: 0,
    globalGrade: 'A',
    globalScore: 100
  });

  // Calculate statistics when containers or profile changes
  useEffect(() => {
    const count = scopedContainers.length;
    if (count === 0) {
      setStats({
        total: 0,
        secure: 0,
        warnings: 0,
        cves: 0,
        updatesAvailable: 0,
        globalGrade: 'A',
        globalScore: 100
      });
      return;
    }

    let sumScore = 0;
    let critCount = 0;
    let updatesAvail = 0;

    scopedContainers.forEach(c => {
      sumScore += c.score;
      if (c.score < 75) {
        critCount++;
      }
      if (c.update_available) {
        updatesAvail++;
      }
    });

    const avgScore = Math.round(sumScore / count);
    
    // Assign global grade letter
    let globalGrade = 'A';
    if (avgScore < 40) globalGrade = 'F';
    else if (avgScore < 60) globalGrade = 'D';
    else if (avgScore < 75) globalGrade = 'C';
    else if (avgScore < 90) globalGrade = 'B';

    setStats({
      total: count,
      secure: count - critCount,
      warnings: critCount,
      cves: scopedContainers.reduce((acc, c) => acc + (c.cve_critical || 0) + (c.cve_high || 0) + (c.cve_medium || 0) + (c.cve_low || 0), 0),
      updatesAvailable: updatesAvail,
      globalGrade: globalGrade,
      globalScore: avgScore
    });
  }, [containers, activeUserProfile]);

  // Load theme and initial data on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('safedock-theme') || 'dark';
    setTheme(savedTheme);
    applyThemeClass(savedTheme);

    fetchAllData();

    // Listen to popstate event for HTML5 History routing
    const handlePopState = () => {
      setActivePage(getPageFromPathname());
    };
    window.addEventListener('popstate', handlePopState);

    // Set up polling interval to keep dashboard fresh (every 10 seconds)
    const interval = setInterval(() => {
      fetchContainers();
      fetchAuditLogs();
    }, 10000);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(interval);
    };
  }, []);

  const applyThemeClass = (targetTheme) => {
    const html = document.documentElement;
    if (targetTheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  };

  const handleToggleTheme = (nextTheme) => {
    setTheme(nextTheme);
    applyThemeClass(nextTheme);
    localStorage.setItem('safedock-theme', nextTheme);
  };

  // Asynchronous API Fetchers
  const fetchAllData = () => {
    fetchConfig();
    fetchContainers();
    fetchAuditLogs();
    fetchRegistries();
    fetchContainerOverrides();
  };

  const fetchConfig = () => {
    return fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Error fetching config:", err));
  };

  const fetchContainers = () => {
    return fetch('/api/containers')
      .then(res => res.json())
      .then(data => {
        const processed = (data || []).map(c => {
          const non_root = !c.is_root;
          const privileged_safe = !c.is_privileged;
          
          let score = 100;
          if (!c.tag_pinned) score -= 25;
          if (c.is_root) score -= 25;
          if (c.is_privileged) score -= 30;
          if (c.secret_leaks && c.secret_leaks.length > 0) {
            score -= Math.min(20, c.secret_leaks.length * 10);
          }
          if (score < 0) score = 0;
          
          let grade = 'A';
          if (score < 40) grade = 'F';
          else if (score < 60) grade = 'D';
          else if (score < 75) grade = 'C';
          else if (score < 90) grade = 'B';
          
          const update_available = !c.tag_pinned && (c.image_tag === 'latest' || c.image_tag === 'dev');

          // Determine Host Name and Tags for Multi-Host visual representation
          let host_name = 'prod-swarm-01';
          let tags = ['Production', 'Web'];
          
          const nameLower = (c.name || '').toLowerCase();
          if (nameLower.includes('db') || nameLower.includes('redis') || nameLower.includes('postgres') || nameLower.includes('sql')) {
            host_name = 'db-node-02';
            tags = ['Database', 'Critical', 'Back-End'];
          } else if (nameLower.includes('gateway') || nameLower.includes('payment') || nameLower.includes('api')) {
            host_name = 'prod-swarm-01';
            tags = ['Production', 'API', 'Gateway'];
          } else if (nameLower.includes('test') || nameLower.includes('dev') || nameLower.includes('demo')) {
            host_name = 'stage-aws-us-east';
            tags = ['Staging', 'Dev', 'Internal'];
          } else if (nameLower.includes('backup') || nameLower.includes('cron')) {
            host_name = 'edge-node-02';
            tags = ['Backup', 'Cron', 'System'];
          } else {
          // Assign random/default hosts based on ID
            const hosts = ['prod-swarm-01', 'db-node-02', 'stage-aws-us-east', 'edge-node-02'];
            const idCode = c.id ? c.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
            host_name = hosts[idCode % hosts.length] || 'prod-swarm-01';
            tags = ['App', 'Docker'];
          }

          // Apply user custom tags override
          if (containerTags[c.name]) {
            tags = containerTags[c.name];
          }
          
          let cve_critical = 0;
          let cve_high = 0;
          let cve_medium = 0;
          let cve_low = 0;

          if (score < 40) {
            cve_critical = 2;
            cve_high = 5;
            cve_medium = 8;
            cve_low = 12;
          } else if (score < 60) {
            cve_critical = 0;
            cve_high = 3;
            cve_medium = 6;
            cve_low = 10;
          } else if (score < 75) {
            cve_critical = 0;
            cve_high = 1;
            cve_medium = 4;
            cve_low = 8;
          } else if (score < 90) {
            cve_critical = 0;
            cve_high = 0;
            cve_medium = 2;
            cve_low = 5;
          } else {
            cve_critical = 0;
            cve_high = 0;
            cve_medium = 0;
            cve_low = 1;
          }

          return {
            ...c,
            non_root,
            privileged_safe,
            score,
            grade,
            update_available,
            host_name,
            tags,
            cve_critical,
            cve_high,
            cve_medium,
            cve_low
          };
        });
        setContainers(processed);
      })
      .catch(err => console.error("Error fetching containers:", err));
  };

  const fetchAuditLogs = () => {
    return fetch('/api/audit-logs')
      .then(res => res.json())
      .then(data => setAuditLogs(data || []))
      .catch(err => console.error("Error fetching audit logs:", err));
  };

  const fetchRegistries = () => {
    return fetch('/api/registries')
      .then(res => res.json())
      .then(data => setRegistries(data || []))
      .catch(err => console.error("Error fetching registries:", err));
  };

  const fetchContainerOverrides = () => {
    return fetch('/api/containers/settings')
      .then(res => res.json())
      .then(data => setOverrides(data || {}))
      .catch(err => console.error("Error fetching overrides:", err));
  };

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    Promise.all([fetchContainers(), fetchAuditLogs()])
      .finally(() => {
        setTimeout(() => setIsRefreshing(false), 1000);
      });
  };

  // API Mutators
  const handleSaveGlobalSettings = (settingsData) => {
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsData)
    })
      .then(res => {
        if (!res.ok) throw new Error("Error saving global settings");
        return fetchConfig();
      });
  };

  const handleAddRegistry = (serverAddress, username, password) => {
    const payload = { server_address: serverAddress, username, password };
    return fetch('/api/registries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Error adding registry");
        return fetchRegistries();
      });
  };

  const handleDeleteRegistry = (id) => {
    const payload = { id: id };
    return fetch('/api/registries/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Error deleting registry");
        return fetchRegistries();
      });
  };

  const handleSaveOverride = (containerName, cveSeverityThreshold, allowRootUser, allowPrivilegedMode) => {
    const payload = {
      container_name: containerName,
      cve_severity_threshold: cveSeverityThreshold,
      allow_root_user: allowRootUser,
      allow_privileged_mode: allowPrivilegedMode
    };
    return fetch('/api/containers/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Error saving override");
        return fetchContainerOverrides();
      });
  };

  const handleDeleteOverride = (containerName) => {
    const payload = { container_name: containerName };
    return fetch('/api/containers/settings/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("Error deleting override");
        return fetchContainerOverrides();
      });
  };

  const handleTriggerRollout = (containerId, containerName) => {
    setIsRolloutLoading(true);
    setRolloutStatusMsg({ text: "Recherche de mise à jour distante...", type: "success" });

    fetch('/api/containers/rollout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: containerId, action: 'recreate' })
    })
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => { throw new Error(text); });
        }
        return res.json();
      })
      .then(data => {
        setRolloutStatusMsg({ text: `Pivot de déploiement réussi : ${data.message || 'Conteneur recréé avec succès.'}`, type: 'success' });
        fetchAllData();
      })
      .catch(err => {
        setRolloutStatusMsg({ text: `Déploiement bloqué / Échoué : ${err.message}`, type: 'error' });
      })
      .finally(() => {
        setIsRolloutLoading(false);
        setTimeout(() => setRolloutStatusMsg({ text: '', type: '' }), 10000);
      });
  };

  const handleSelectContainer = (containerId) => {
    setSelectedContainerId(containerId);
    handleNavigate('container-detail');
  };

  const handleNavigate = (page) => {
    if (page === 'dashboard') {
      window.history.pushState(null, '', '/');
    } else {
      window.history.pushState(null, '', '/' + page);
    }
    setActivePage(page);
    if (page !== 'container-settings' && page !== 'container-detail') {
      setSelectedContainerId(null); // Keep container ID for settings and cockpit!
    }
  };

  const selectedContainer = containers.find(c => c.id === selectedContainerId);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e18]">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          activePage={activePage}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onRefresh={handleRefreshAll}
          isRefreshing={isRefreshing}
          onNavigate={handleNavigate}
        />

        {/* View Router */}
        <main className="flex-1 overflow-y-auto p-6">
          {activePage === 'dashboard' && (
            <DashboardView
              containers={scopedContainers}
              auditLogs={auditLogs}
              stats={stats}
              onSelectContainer={handleSelectContainer}
              onRefreshLogs={fetchAuditLogs}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'containers' && (
            <ContainersView
              containers={scopedContainers}
              onSelectContainer={handleSelectContainer}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'actions' && (
            <ActionsView
              containers={scopedContainers}
              onTriggerRollout={handleTriggerRollout}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'agents' && (
            <AgentsView />
          )}

          {activePage === 'watch' && (
            <WatchView />
          )}

          {activePage === 'notifications' && (
            <NotificationsView />
          )}

          {activePage === 'account' && (
            <AccountView />
          )}

          {activePage === 'permissions' && (
            <PermissionsView
              simulatedUsers={simulatedUsers}
              setSimulatedUsers={setSimulatedUsers}
              activeUserProfile={activeUserProfile}
              setActiveUserProfile={(prof) => {
                setActiveUserProfile(prof);
                localStorage.setItem('safedock-active-user', JSON.stringify(prof));
              }}
            />
          )}

          {activePage === 'settings' && (
            <SettingsView
              config={config}
              registries={registries}
              onSaveGlobalSettings={handleSaveGlobalSettings}
              onAddRegistry={handleAddRegistry}
              onDeleteRegistry={handleDeleteRegistry}
            />
          )}

          {activePage === 'container-settings' && (
            <ContainerSettingsView
              containerId={selectedContainerId}
              containers={scopedContainers}
              overrides={overrides}
              onSaveOverride={handleSaveOverride}
              onDeleteOverride={handleDeleteOverride}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'container-detail' && (
            <ContainerDetailView
              containerId={selectedContainerId}
              containers={scopedContainers}
              overrides={overrides}
              onSaveOverride={handleSaveOverride}
              onDeleteOverride={handleDeleteOverride}
              onTriggerRollout={handleTriggerRollout}
              isRolloutLoading={isRolloutLoading}
              rolloutStatusMsg={rolloutStatusMsg}
              onNavigate={handleNavigate}
              containerTags={containerTags}
              onUpdateTags={handleUpdateContainerTags}
            />
          )}

          {activePage === '404' && (
            <NotFoundView onNavigate={handleNavigate} />
          )}
        </main>
      </div>
    </div>
  );
}
