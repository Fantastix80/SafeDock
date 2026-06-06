import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import ContainersView from './components/ContainersView';
import SettingsView from './components/SettingsView';
import WatchView from './components/WatchView';
import AccountView from './components/AccountView';
import NotificationsView from './components/NotificationsView';
import NotFoundView from './components/NotFoundView';
import ContainerSettingsView from './components/ContainerSettingsView';
import ActionsView from './components/ActionsView';
import AgentsView from './components/AgentsView';
import ContainerDetailView from './components/ContainerDetailView';
import AuditView from './components/AuditView';
import LoginView from './components/LoginView';
import InviteView from './components/InviteView';
import SetupView from './components/SetupView';
import ExceptionsView from './components/ExceptionsView';
import UsersView from './components/UsersView';
import ComplianceView from './components/ComplianceView';
import PasswordChecklist from './components/PasswordChecklist';
import { checkPassword } from './lib/passwordPolicy';
import { setSessionExpiredHandler } from './lib/session';

export default function App() {
  const getPageFromPathname = () => {
    const path = window.location.pathname.replace('/', '');
    const validPages = ['dashboard', 'containers', 'audit', 'watch', 'notifications', 'account', 'settings', 'container-settings', 'actions', 'agents', 'container-detail', 'exceptions', 'users', 'compliance'];
    if (!path || path === 'dashboard') return 'dashboard';
    if (validPages.includes(path)) return path;
    return '404';
  };

  const [authed, setAuthed] = useState(null); // null = vérification en cours, false = login, true = app
  const [needsSetup, setNeedsSetup] = useState(null); // null = inconnu, true = assistant initial, false = configuré
  const [me, setMe] = useState(null);         // profil courant (rôle, username, portée)
  const [activePage, setActivePage] = useState(getPageFromPathname());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [containers, setContainers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [registries, setRegistries] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [securityAudit, setSecurityAudit] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [config, setConfig] = useState(null);
  
  const [selectedContainerId, setSelectedContainerId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRolloutLoading, setIsRolloutLoading] = useState(false);
  const [rolloutStatusMsg, setRolloutStatusMsg] = useState({ text: '', type: '' });

  // La portée (RBAC) est désormais appliquée côté serveur : /api/containers ne renvoie
  // que les conteneurs visibles par l'utilisateur courant, avec leurs vrais tags.
  const scopedContainers = containers;
  const isAdmin = me?.role === 'admin';

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
  }, [containers]);

  const checkSession = () => {
    return fetch('/api/session')
      .then(res => res.json())
      .then(data => {
        setMe(data.authenticated ? data : null);
        setAuthed(!!data.authenticated);
      })
      .catch(() => setAuthed(false));
  };

  // Theme + routing + vérification de session au montage
  useEffect(() => {
    document.documentElement.classList.add('dark');
    // Assistant de configuration initiale : si aucun admin n'existe encore, on
    // l'affiche avant tout (login compris).
    fetch('/api/setup/status')
      .then(res => res.json())
      .then(d => setNeedsSetup(!!d.needs_setup))
      .catch(() => setNeedsSetup(false));
    checkSession();
    const handlePopState = () => setActivePage(getPageFromPathname());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Chargement des données + polling, uniquement une fois authentifié
  useEffect(() => {
    if (authed !== true) return;

    fetchAllData();
    const interval = setInterval(() => {
      fetchContainers();
      fetchAuditLogs();
    }, 10000);

    return () => clearInterval(interval);
  }, [authed]);

  const handleLogout = () => {
    fetch('/api/logout', { method: 'POST' }).finally(() => setAuthed(false));
  };

  // Centralise la détection d'expiration de session : tout 401 renvoie à l'écran de connexion.
  const handleJson = (res) => {
    if (res.status === 401) {
      setAuthed(false);
      throw new Error('Session expirée');
    }
    return res.json();
  };

  // Les composants qui appellent l'API via le helper partagé (lib/session) doivent
  // eux aussi revenir à l'écran de connexion sur 401.
  useEffect(() => { setSessionExpiredHandler(() => setAuthed(false)); }, []);

  // Asynchronous API Fetchers
  const fetchAllData = () => {
    fetchConfig();
    fetchContainers();
    fetchAuditLogs();
    fetchRegistries();
    fetchContainerOverrides();
    fetchExceptions();
    fetchTags();
    fetchAssignments();
    fetchNotifications();
    if (me?.role === 'admin') {
      fetchHosts();
      fetchUsers();
      fetchSecurityAudit();
    }
  };

  const fetchTags = () => fetch('/api/tags').then(handleJson).then(d => setTags(d || [])).catch(() => {});
  const fetchAssignments = () => fetch('/api/tags/assignments').then(handleJson).then(d => setAssignments(d || [])).catch(() => {});
  const fetchUsers = () => fetch('/api/users').then(handleJson).then(d => setUsers(d || [])).catch(() => {});
  const fetchNotifications = () => fetch('/api/notifications').then(handleJson).then(d => setNotifications(d || [])).catch(() => {});
  const fetchSecurityAudit = () => fetch('/api/audit/security').then(handleJson).then(d => setSecurityAudit(d || [])).catch(() => {});

  // ── Handlers utilisateurs (admin) ──
  const apiPost = (url, body) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  }).then(async res => { if (!res.ok) throw new Error(await res.text()); return res; });

  const handleCreateUser = (u) => apiPost('/api/users', u).then(async res => {
    const d = await res.json().catch(() => ({}));
    fetchUsers();
    return d; // { invite_link, email_sent }
  });
  const handleDeleteUser = (id) => apiPost('/api/users/delete', { id }).then(fetchUsers);
  const handleSetRole = (id, role) => apiPost('/api/users/role', { id, role }).then(fetchUsers);
  const handleResetPassword = (id, new_password) => apiPost('/api/users/password', { id, new_password });
  const handleResetMFA = (id) => apiPost('/api/users/reset-mfa', { id }).then(async res => {
    const d = await res.json().catch(() => ({}));
    fetchUsers();
    return d; // { invite_link, email_sent }
  });
  const handleSetScope = (id, payload) => apiPost('/api/users/scope', { id, ...payload }).then(fetchUsers);

  // ── Handlers tags (admin) ──
  const handleCreateTag = (name) => apiPost('/api/tags', { name }).then(fetchTags);
  const handleDeleteTag = (id) => apiPost('/api/tags/delete', { id }).then(() => { fetchTags(); fetchAssignments(); fetchContainers(); });
  const handleAssignTag = (action, tag_id, host_id, container_name) =>
    apiPost('/api/tags/assignments', { action, tag_id, host_id, container_name }).then(() => { fetchAssignments(); fetchContainers(); });

  // ── Changement de mot de passe (self) ──
  const handleChangePassword = (current_password, new_password) =>
    apiPost('/api/account/password', { current_password, new_password });

  // ── Mise à jour du profil (self) : nom complet + email ──
  const handleUpdateProfile = (first_name, last_name) =>
    apiPost('/api/account/profile', { first_name, last_name }).then(() => checkSession());

  // ── Notifications ──
  const handleMarkNotificationsRead = () =>
    apiPost('/api/notifications', {}).then(fetchNotifications);

  const fetchHosts = () => {
    return fetch('/api/hosts')
      .then(handleJson)
      .then(data => setHosts(data || []))
      .catch(err => console.error("Error fetching hosts:", err));
  };

  const handleAddHost = (payload) => {
    return fetch('/api/hosts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(async res => {
      if (!res.ok) throw new Error(await res.text());
      return fetchHosts();
    });
  };

  const handleDeleteHost = (id) => {
    return fetch('/api/hosts/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }).then(async res => {
      if (!res.ok) throw new Error(await res.text());
      return fetchHosts();
    });
  };

  const handleTestHost = (payload) => {
    return fetch('/api/hosts/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(handleJson);
  };

  const fetchExceptions = () => {
    return fetch('/api/exceptions')
      .then(handleJson)
      .then(data => setExceptions(data || []))
      .catch(err => console.error("Error fetching exceptions:", err));
  };

  const handleAddException = (cveId, containerName, reason, expiresAt) => {
    return fetch('/api/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cve_id: cveId, container_name: containerName, reason, expires_at: expiresAt }),
    }).then(async res => {
      if (!res.ok) throw new Error(await res.text());
      return fetchExceptions();
    });
  };

  const handleDeleteException = (id) => {
    return fetch('/api/exceptions/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then(res => {
      if (!res.ok) throw new Error("Erreur suppression exception");
      return fetchExceptions();
    });
  };

  const fetchConfig = () => {
    return fetch('/api/config')
      .then(handleJson)
      .then(data => setConfig(data))
      .catch(err => console.error("Error fetching config:", err));
  };

  const fetchContainers = () => {
    return fetch('/api/containers')
      .then(handleJson)
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

          // Hôte réel + tags réels fournis par le backend (plus aucune fabrication).
          const host_name = c.host_name || 'Hôte local';
          const tags = c.tags || [];
          
          // Compteurs CVE : données réelles fournies par le backend depuis le cache de scans.
          // Un conteneur jamais scanné a scanned=false et des compteurs à 0 (aucune donnée inventée).
          const scanned = !!c.scanned;
          const cve_critical = c.cve_critical || 0;
          const cve_high = c.cve_high || 0;
          const cve_medium = c.cve_medium || 0;
          const cve_low = c.cve_low || 0;

          return {
            ...c,
            non_root,
            privileged_safe,
            score,
            grade,
            update_available,
            host_name,
            tags,
            scanned,
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
      .then(handleJson)
      .then(data => setAuditLogs(data || []))
      .catch(err => console.error("Error fetching audit logs:", err));
  };

  const fetchRegistries = () => {
    return fetch('/api/registries')
      .then(handleJson)
      .then(data => setRegistries(data || []))
      .catch(err => console.error("Error fetching registries:", err));
  };

  const fetchContainerOverrides = () => {
    return fetch('/api/containers/settings')
      .then(handleJson)
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
    setRolloutStatusMsg({ text: "Recherche de mise à jour distante et analyse de sécurité...", type: "success" });

    const target = containers.find(c => c.id === containerId);
    const hostQ = target && target.host_id ? `?host=${target.host_id}` : '';

    fetch(`/api/containers/${containerId}/update${hostQ}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Erreur serveur (HTTP ${res.status})`);
        }
        return data;
      })
      .then(data => {
        setRolloutStatusMsg({ text: data.message || 'Opération terminée.', type: 'success' });
        fetchAllData();
      })
      .catch(err => {
        setRolloutStatusMsg({ text: `Mise à jour bloquée / échouée : ${err.message}`, type: 'error' });
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

  // Assistant de configuration initiale (aucun admin encore) : prioritaire sur tout.
  if (needsSetup === null || authed === null) {
    return <div className="flex items-center justify-center min-h-screen bg-[#030304] text-[#94A3B8] font-mono text-sm">Chargement…</div>;
  }
  if (needsSetup) {
    return <SetupView onComplete={() => { setNeedsSetup(false); checkSession(); }} />;
  }

  // Page publique d'activation par invitation (hors authentification).
  if (window.location.pathname === '/invite') {
    return <InviteView />;
  }
  if (authed === false) {
    return <LoginView onSuccess={checkSession} />;
  }
  // Changement de mot de passe imposé (mdp défini par un admin) : bloque l'accès
  // tant qu'il n'est pas effectué, même sur une session déjà ouverte.
  if (me?.must_change_password) {
    return <ForcedPasswordChange onChangePassword={handleChangePassword} onDone={checkSession} onLogout={handleLogout} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#030304]">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing}
        onLogout={handleLogout}
        role={me?.role}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          activePage={activePage}
          onNavigate={handleNavigate}
          me={me}
        />

        {/* View Router */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="w-full">
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

          {activePage === 'compliance' && (
            <ComplianceView containers={scopedContainers} onNavigate={handleNavigate} />
          )}

          {activePage === 'audit' && (
            <AuditView />
          )}

          {activePage === 'exceptions' && (
            <ExceptionsView
              exceptions={exceptions}
              containers={scopedContainers}
              onAdd={handleAddException}
              onDelete={handleDeleteException}
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
            isAdmin ? (
              <AgentsView
                hosts={hosts}
                containers={containers}
                onAddHost={handleAddHost}
                onDeleteHost={handleDeleteHost}
                onTestHost={handleTestHost}
              />
            ) : <AccessDenied />
          )}

          {activePage === 'watch' && (
            <WatchView />
          )}

          {activePage === 'notifications' && (
            <NotificationsView notifications={notifications} onMarkRead={handleMarkNotificationsRead} onRefresh={fetchNotifications} />
          )}

          {activePage === 'account' && (
            <AccountView me={me} onChangePassword={handleChangePassword} onUpdateProfile={handleUpdateProfile} />
          )}

          {activePage === 'users' && (
            isAdmin ? (
              <UsersView
                me={me}
                users={users}
                tags={tags}
                hosts={hosts}
                onCreateUser={handleCreateUser}
                onDeleteUser={handleDeleteUser}
                onSetRole={handleSetRole}
                onResetPassword={handleResetPassword}
                onResetMFA={handleResetMFA}
                onSetScope={handleSetScope}
                onCreateTag={handleCreateTag}
                onDeleteTag={handleDeleteTag}
                audit={securityAudit}
                onRefreshAudit={fetchSecurityAudit}
              />
            ) : <AccessDenied />
          )}

          {activePage === 'settings' && (
            isAdmin ? (
              <SettingsView
                config={config}
                registries={registries}
                onSaveGlobalSettings={handleSaveGlobalSettings}
                onAddRegistry={handleAddRegistry}
                onDeleteRegistry={handleDeleteRegistry}
              />
            ) : <AccessDenied />
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
              isAdmin={isAdmin}
              role={me?.role}
              allTags={tags}
              onAssignTag={handleAssignTag}
            />
          )}

          {activePage === '404' && (
            <NotFoundView onNavigate={handleNavigate} />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ForcedPasswordChange({ onChangePassword, onDone, onLogout }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!checkPassword(nw).ok) { setErr('Le mot de passe ne respecte pas la politique de sécurité.'); return; }
    setBusy(true); setErr('');
    try { await onChangePassword(cur, nw); await onDone(); }
    catch (e2) { setErr(e2.message || 'Échec du changement.'); }
    finally { setBusy(false); }
  };
  const inputCls = "w-full px-3 py-2.5 text-sm rounded-xl bg-[#0A0C10] border border-white/[0.08] text-white placeholder-[#94A3B8]/30 focus:outline-none focus:border-[#F7931A]/40 font-mono";
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#030304] px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-[#0F1115] border border-white/[0.08] rounded-2xl p-6 shadow-xl space-y-3">
        <h1 className="font-heading text-base font-semibold text-white">Changement de mot de passe requis</h1>
        <p className="text-sm text-[#94A3B8]">Votre mot de passe a été défini par un administrateur. Choisissez-en un nouveau pour continuer.</p>
        <input type="password" placeholder="Mot de passe actuel" value={cur} onChange={e => setCur(e.target.value)} className={inputCls} autoFocus />
        <input type="password" placeholder="Nouveau mot de passe" value={nw} onChange={e => setNw(e.target.value)} className={inputCls} />
        <PasswordChecklist password={nw} />
        {err && <p className="text-sm text-red-400 font-mono">{err}</p>}
        <button type="submit" disabled={busy || !checkPassword(nw).ok} className="w-full rounded-xl px-4 py-2.5 font-mono font-semibold text-sm bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-black hover:opacity-90 disabled:opacity-40">
          {busy ? 'Veuillez patienter…' : 'Définir et continuer'}
        </button>
        <button type="button" onClick={onLogout} className="w-full text-xs text-[#94A3B8] hover:text-white font-mono">Se déconnecter</button>
      </form>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="card p-10 text-center">
      <p className="font-heading text-base font-semibold text-white">Accès refusé</p>
      <p className="text-sm text-[#94A3B8] mt-2 font-mono">Cette section est réservée aux administrateurs.</p>
    </div>
  );
}
