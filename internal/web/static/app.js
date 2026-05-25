/* ==========================================================================
   SafeDock Dashboard Client - Sprint 5 Rich Interaction & Database Sync
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const state = {
        containers: [],
        auditLogs: [],
        registries: [],
        containerOverrides: {},
        stats: {
            total: 0,
            secure: 0,
            warnings: 0,
            cves: 0,
            updatesAvailable: 0,
            globalGrade: 'A',
            globalScore: 100
        },
        config: null,
        activeFilter: 'all',
        selectedContainerId: null
    };

    // DOM Elements Cache
    const el = {
        containersList: document.getElementById('containers-list'),
        loadingState: document.getElementById('containers-loading'),
        emptyState: document.getElementById('containers-empty'),
        globalGrade: document.getElementById('global-grade'),
        scoreRing: document.getElementById('score-ring-progress'),
        globalStatusBadge: document.getElementById('global-status-badge'),
        
        // Stat values
        statTotal: document.getElementById('stat-containers-count'),
        statAlerts: document.getElementById('stat-alerts-count'),
        statUpdates: document.getElementById('stat-updates-count'),
        
        // Drawer elements
        drawer: document.getElementById('container-drawer'),
        drawerOverlay: document.getElementById('drawer-overlay'),
        drawerContainerName: document.getElementById('drawer-container-name'),
        drawerContainerImage: document.getElementById('drawer-container-image'),
        btnCloseDrawer: document.getElementById('btn-close-drawer'),
        btnTriggerUpdate: document.getElementById('btn-trigger-update'),
        updateStatusMsg: document.getElementById('update-status-message'),
        
        // Drawer Tabs & Content
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        
        // Overview Tab Detail Fields
        evalPinning: document.getElementById('eval-text-pinning'),
        evalRoot: document.getElementById('eval-text-root'),
        evalPrivileged: document.getElementById('eval-text-privileged'),
        evalMounts: document.getElementById('eval-text-mounts'),
        evalSecrets: document.getElementById('eval-text-secrets'),
        iconPinning: document.getElementById('eval-icon-pinning'),
        iconRoot: document.getElementById('eval-icon-root'),
        iconPrivileged: document.getElementById('eval-icon-privileged'),
        iconMounts: document.getElementById('eval-icon-mounts'),
        iconSecrets: document.getElementById('eval-icon-secrets'),
        
        drawerMountsList: document.getElementById('drawer-mounts-list'),
        drawerSecretsList: document.getElementById('drawer-secrets-list'),
        
        // Trivy Tab Detail Fields
        cveCountBadge: document.getElementById('cve-count-badge'),
        trivyCrit: document.getElementById('trivy-crit-count'),
        trivyHigh: document.getElementById('trivy-high-count'),
        trivyMed: document.getElementById('trivy-med-count'),
        trivyLow: document.getElementById('trivy-low-count'),
        trivyLoading: document.getElementById('trivy-loading'),
        trivyEmpty: document.getElementById('trivy-empty'),
        trivyList: document.getElementById('trivy-vuln-list'),
        
        // Dockle Tab Detail Fields
        dockleCountBadge: document.getElementById('dockle-count-badge'),
        dockleFatal: document.getElementById('dockle-fatal-count'),
        dockleWarn: document.getElementById('dockle-warn-count'),
        dockleInfo: document.getElementById('dockle-info-count'),
        dockleLoading: document.getElementById('dockle-loading'),
        dockleEmpty: document.getElementById('dockle-empty'),
        dockleList: document.getElementById('dockle-compliance-list'),
        
        // Action Buttons
        btnGlobalRefresh: document.getElementById('btn-global-refresh'),
        
        // Settings Modal & Form (Sprint 5)
        btnNavSettings: document.getElementById('btn-nav-settings'),
        settingsPane: document.getElementById('settings-pane'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        formSettings: document.getElementById('form-settings'),
        settingsSaveStatus: document.getElementById('settings-save-status'),
        
        // Form Inputs Cache
        selectSeverity: document.getElementById('select-severity'),
        checkboxAllowRoot: document.getElementById('checkbox-allow-root'),
        checkboxAllowPrivileged: document.getElementById('checkbox-allow-privileged'),
        inputSmtpHost: document.getElementById('input-smtp-host'),
        inputSmtpPort: document.getElementById('input-smtp-port'),
        inputSmtpUser: document.getElementById('input-smtp-user'),
        inputSmtpPass: document.getElementById('input-smtp-pass'),
        inputSmtpFrom: document.getElementById('input-smtp-from'),
        inputSmtpTo: document.getElementById('input-smtp-to'),
        checkboxSmtpTlsSkip: document.getElementById('checkbox-smtp-tls-skip'),
        
        // Registries UI
        registriesList: document.getElementById('settings-registries-list'),
        regServer: document.getElementById('reg-server'),
        regUser: document.getElementById('reg-user'),
        regPass: document.getElementById('reg-pass'),
        btnAddRegistry: document.getElementById('btn-add-registry'),
        
        // Audit Logs UI
        auditLogsRows: document.getElementById('audit-logs-rows'),
        btnRefreshLogs: document.getElementById('btn-refresh-logs'),
        
        // Nav Filters
        filterBtns: document.querySelectorAll('.filter-btn')
    };

    // Initialize application
    init();

    function init() {
        initTheme();
        fetchConfig();
        fetchContainers();
        fetchAuditLogs();
        fetchRegistries();
        fetchContainerOverrides();
        setupEventListeners();
        setInterval(updateTime, 1000);
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('safedock-theme') || 'dark';
        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        const body = document.body;
        const pill = document.getElementById('theme-toggle-pill');
        if (!pill) return;
        
        const btns = pill.querySelectorAll('.theme-switch-btn');
        
        if (theme === 'light') {
            body.classList.add('light-theme');
        } else {
            body.classList.remove('light-theme');
        }
        
        btns.forEach(btn => {
            if (btn.getAttribute('data-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        localStorage.setItem('safedock-theme', theme);
    }

    // ==========================================================================
    // Event Listeners Setup
    // ==========================================================================
    function setupEventListeners() {
        // Theme switch toggler click
        const themeTogglePill = document.getElementById('theme-toggle-pill');
        if (themeTogglePill) {
            themeTogglePill.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.theme-switch-btn');
                if (targetBtn) {
                    const theme = targetBtn.getAttribute('data-theme');
                    applyTheme(theme);
                } else {
                    // Toggle theme if capsule background is clicked
                    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                    applyTheme(nextTheme);
                }
            });
        }

        // Global refresh
        el.btnGlobalRefresh.addEventListener('click', () => {
            el.btnGlobalRefresh.classList.add('disabled');
            el.btnGlobalRefresh.querySelector('i').classList.add('fa-spin');
            Promise.all([fetchContainers(), fetchAuditLogs()]).finally(() => {
                setTimeout(() => {
                    el.btnGlobalRefresh.classList.remove('disabled');
                    el.btnGlobalRefresh.querySelector('i').classList.remove('fa-spin');
                }, 1000);
            });
        });

        // Close Drawer
        el.btnCloseDrawer.addEventListener('click', closeDrawer);
        el.drawerOverlay.addEventListener('click', closeDrawer);

        // Drawer Tabs Toggle
        el.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                switchTab(btn, targetTab);
            });
        });

        // Trigger rollout update
        el.btnTriggerUpdate.addEventListener('click', () => {
            if (state.selectedContainerId) {
                triggerContainerUpdate(state.selectedContainerId);
            }
        });

        // Filter Buttons
        el.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                el.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeFilter = btn.getAttribute('data-filter');
                renderContainers();
            });
        });

        // SPA Page Navigation
        const btnNavDashboard = document.getElementById('btn-nav-dashboard');
        const btnNavContainers = document.getElementById('btn-nav-containers');
        const btnNavSettings = document.getElementById('btn-nav-settings');

        if (btnNavDashboard) {
            btnNavDashboard.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage('view-dashboard');
            });
        }
        if (btnNavContainers) {
            btnNavContainers.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage('view-containers');
                renderContainersTable();
            });
        }
        if (btnNavSettings) {
            btnNavSettings.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage('view-settings');
            });
        }

        // Table search input
        const searchInput = document.getElementById('containers-table-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderContainersTable();
            });
        }

        // Save container override submit
        const btnSaveOverride = document.getElementById('btn-save-override');
        if (btnSaveOverride) {
            btnSaveOverride.addEventListener('click', () => {
                saveContainerOverride();
            });
        }

        // Save settings form submit (Sprint 5)
        el.formSettings.addEventListener('submit', (e) => {
            e.preventDefault();
            saveConfig();
        });

        // Add private registry account
        el.btnAddRegistry.addEventListener('click', () => {
            addRegistryCredential();
        });

        // Manual refresh logs
        el.btnRefreshLogs.addEventListener('click', () => {
            el.btnRefreshLogs.querySelector('i').classList.add('fa-spin');
            fetchAuditLogs().finally(() => {
                setTimeout(() => {
                    el.btnRefreshLogs.querySelector('i').classList.remove('fa-spin');
                }, 800);
            });
        });
    }

    function updateTime() {
        const timeEl = document.getElementById('current-time');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = `Analyse en temps réel • ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        }
    }

    // ==========================================================================
    // API Requests
    // ==========================================================================

    // Fetch global configurations
    async function fetchConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                state.config = await res.json();
                renderSettings();
            }
        } catch (err) {
            console.error("Impossible de charger la config", err);
        }
    }

    // Save configurations dynamically to SQLite (Sprint 5)
    async function saveConfig() {
        const submitBtn = document.getElementById('btn-save-settings-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Application à chaud...`;
        el.settingsSaveStatus.textContent = '';

        const payload = {
            smtp_host: el.inputSmtpHost.value.trim(),
            smtp_port: parseInt(el.inputSmtpPort.value) || 587,
            smtp_user: el.inputSmtpUser.value.trim(),
            smtp_password: el.inputSmtpPass.value,
            smtp_from: el.inputSmtpFrom.value.trim(),
            smtp_to: el.inputSmtpTo.value.trim(),
            smtp_tls_skip_verify: el.checkboxSmtpTlsSkip.checked,
            secops_max_severity_allowed: el.selectSeverity.value,
            secops_allow_root: el.checkboxAllowRoot.checked,
            secops_allow_privileged: el.checkboxAllowPrivileged.checked
        };

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const text = await res.text();
            
            if (res.ok) {
                el.settingsSaveStatus.className = "text-success";
                el.settingsSaveStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Enregistré !`;
                
                // Clear password input placeholder safety
                el.inputSmtpPass.value = '';
                el.inputSmtpPass.placeholder = "•••••••• (enregistré)";
                
                // Reload configuration in state and refresh dashboard UI variables
                await fetchConfig();
                await fetchContainers(); // calculated stats may change immediately!
            } else {
                throw new Error(text);
            }
        } catch (err) {
            console.error("Failed to save config", err);
            el.settingsSaveStatus.className = "text-red";
            el.settingsSaveStatus.textContent = `Erreur : ${err.message}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-save"></i> Enregistrer les paramètres`;
        }
    }

    // Fetch private registries credentials (Sprint 5)
    async function fetchRegistries() {
        try {
            const res = await fetch('/api/registries');
            if (res.ok) {
                state.registries = await res.json();
                renderRegistries();
            }
        } catch (err) {
            console.error("Failed to fetch registries", err);
        }
    }

    // Add private registry credential (Sprint 5)
    async function addRegistryCredential() {
        const server = el.regServer.value.trim();
        const user = el.regUser.value.trim();
        const pass = el.regPass.value;

        if (!server || !user || !pass) {
            alert("Veuillez remplir tous les champs du registre.");
            return;
        }

        el.btnAddRegistry.disabled = true;
        
        try {
            const res = await fetch('/api/registries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server, username: user, password: pass })
            });
            
            if (res.ok) {
                el.regServer.value = '';
                el.regUser.value = '';
                el.regPass.value = '';
                await fetchRegistries();
            } else {
                const text = await res.text();
                alert(`Erreur : ${text}`);
            }
        } catch (err) {
            alert(`Erreur d'enregistrement : ${err.message}`);
        } finally {
            el.btnAddRegistry.disabled = false;
        }
    }

    // Delete registry credential (Sprint 5)
    async function deleteRegistryCredential(id) {
        if (!confirm("Voulez-vous vraiment supprimer ces accès de registre ?")) return;

        try {
            const res = await fetch('/api/registries/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            
            if (res.ok) {
                await fetchRegistries();
            } else {
                const text = await res.text();
                alert(`Erreur : ${text}`);
            }
        } catch (err) {
            alert(err.message);
        }
    }

    // Fetch SQLite SecOps audit logs (Sprint 5)
    async function fetchAuditLogs() {
        try {
            const res = await fetch('/api/audit-logs');
            if (res.ok) {
                state.auditLogs = await res.json();
                renderAuditLogs();
            }
        } catch (err) {
            console.error("Failed to fetch audit logs", err);
            el.auditLogsRows.innerHTML = `<tr><td colspan="6" style="padding: 1.5rem; text-align: center; color: var(--text-red);">Impossible de charger l'historique.</td></tr>`;
        }
    }

    // Fetch container list
    async function fetchContainers() {
        el.loadingState.classList.remove('hidden');
        el.containersList.classList.add('hidden');
        el.emptyState.classList.add('hidden');

        try {
            const res = await fetch('/api/containers');
            if (!res.ok) throw new Error("Réponse serveur incorrecte");
            
            const rawContainers = await res.json();
            
            // Map containers and calculate security score for each
            state.containers = (rawContainers || []).map(c => {
                const calculated = calculateScoreAndGrade(c);
                return { ...c, ...calculated };
            });

            calculateGlobalStats();
            renderContainers();
            renderStats();
        } catch (err) {
            console.error("Impossible de récupérer les conteneurs", err);
            el.loadingState.classList.add('hidden');
            el.emptyState.classList.remove('hidden');
            el.emptyState.querySelector('p').textContent = "Erreur lors de la récupération des données Docker.";
        }
    }

    // Fetch specific Trivy vulnerability details
    async function fetchTrivyReport(containerId) {
        el.trivyLoading.classList.remove('hidden');
        el.trivyList.classList.add('hidden');
        el.trivyEmpty.classList.add('hidden');

        try {
            const res = await fetch(`/api/containers/${containerId}/trivy`);
            if (!res.ok) throw new Error("Scan Trivy indisponible");
            
            const report = await res.json();
            renderTrivyReport(report);
        } catch (err) {
            console.error("Trivy scan error", err);
            el.cveCountBadge.textContent = '0';
            el.trivyCrit.textContent = '0';
            el.trivyHigh.textContent = '0';
            el.trivyMed.textContent = '0';
            el.trivyLow.textContent = '0';
            el.trivyLoading.classList.add('hidden');
            el.trivyList.innerHTML = `<div class="vuln-item"><span class="vuln-title">Scan indisponible</span><p class="vuln-desc">${err.message}</p></div>`;
            el.trivyList.classList.remove('hidden');
        }
    }

    // Fetch specific Dockle compliance report details
    async function fetchDockleReport(containerId) {
        el.dockleLoading.classList.remove('hidden');
        el.dockleList.classList.add('hidden');
        el.dockleEmpty.classList.add('hidden');

        try {
            const res = await fetch(`/api/containers/${containerId}/dockle`);
            if (!res.ok) throw new Error("Rapport Dockle indisponible");
            
            const report = await res.json();
            renderDockleReport(report);
        } catch (err) {
            console.error("Dockle report error", err);
            el.dockleCountBadge.textContent = '0';
            el.dockleFatal.textContent = '0';
            el.dockleWarn.textContent = '0';
            el.dockleInfo.textContent = '0';
            el.dockleLoading.classList.add('hidden');
            el.dockleList.innerHTML = `<div class="compliance-item"><span class="compliance-title">Audit Dockle indisponible</span><p class="compliance-desc">${err.message}</p></div>`;
            el.dockleList.classList.remove('hidden');
        }
    }

    // Execute transactional update/rollout
    async function triggerContainerUpdate(containerId) {
        el.btnTriggerUpdate.disabled = true;
        el.btnTriggerUpdate.querySelector('i').className = "fa-solid fa-spinner fa-spin";
        el.btnTriggerUpdate.querySelector('span').textContent = "Vérification et pivotement en cours...";
        
        el.updateStatusMsg.classList.add('hidden');

        try {
            const res = await fetch(`/api/containers/${containerId}/update`, {
                method: 'POST'
            });
            const resultText = await res.text();
            
            if (res.ok) {
                el.updateStatusMsg.className = "update-status-msg success";
                el.updateStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Redéploiement sécurisé réussi ! Pivotement vers le digest immuable effectué.`;
                el.updateStatusMsg.classList.remove('hidden');
                
                // Refresh data automatically
                setTimeout(() => {
                    fetchContainers();
                    fetchAuditLogs();
                }, 2000);
            } else {
                throw new Error(resultText);
            }
        } catch (err) {
            console.error("Update rollout failed", err);
            el.updateStatusMsg.className = "update-status-msg error";
            el.updateStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Rollout Échoué ou Bloqué :</strong><br>${err.message}`;
            el.updateStatusMsg.classList.remove('hidden');
            // Refresh logs even on failure to see the block event
            fetchAuditLogs();
        } finally {
            el.btnTriggerUpdate.disabled = false;
            el.btnTriggerUpdate.querySelector('i').className = "fa-solid fa-sync";
            el.btnTriggerUpdate.querySelector('span').textContent = "Vérifier & Appliquer les Mises à Jour";
        }
    }

    // ==========================================================================
    // Logic Calculations
    // ==========================================================================

    // Calculate a transparent SecOps score out of 100 and maps an A-F Grade
    function calculateScoreAndGrade(c) {
        let score = 100;
        
        // 1. Privileged Container (Huge threat)
        if (c.is_privileged) {
            score -= 40;
        }
        
        // 2. Running as root UID 0
        if (c.is_root) {
            score -= 20;
        }

        // 3. Image tag not pinned to a specific digest or version (risks tag poisoning)
        if (!c.tag_pinned) {
            score -= 15;
        }

        // 4. Mounts of sensitive host paths
        if (c.sensitive_mounts && c.sensitive_mounts.length > 0) {
            score -= Math.min(c.sensitive_mounts.length * 20, 40);
        }

        // 5. Environmental leaks
        if (c.secret_leaks && c.secret_leaks.length > 0) {
            score -= Math.min(c.secret_leaks.length * 20, 40);
        }

        // Clip score
        score = Math.max(score, 0);

        // Evaluate Grade Letter
        let grade = 'F';
        if (score >= 90) grade = 'A';
        else if (score >= 75) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 45) grade = 'D';

        return { score, grade };
    }

    // Compute global metrics based on calculated container lists
    function calculateGlobalStats() {
        const count = state.containers.length;
        if (count === 0) {
            state.stats = { total: 0, secure: 0, warnings: 0, cves: 0, updatesAvailable: 0, globalGrade: 'A', globalScore: 100 };
            return;
        }

        let sumScore = 0;
        let critCount = 0;
        let updatesAvail = 0;

        state.containers.forEach(c => {
            sumScore += c.score;
            if (c.score < 75) critCount++;
            // Basic logic: any container whose tag isn't pinned is treated as having an update check pending
            if (!c.tag_pinned) {
                updatesAvail++;
            }
        });

        const avgScore = Math.round(sumScore / count);
        let globalGrade = 'F';
        if (avgScore >= 90) globalGrade = 'A';
        else if (avgScore >= 75) globalGrade = 'B';
        else if (avgScore >= 60) globalGrade = 'C';
        else if (avgScore >= 45) globalGrade = 'D';

        state.stats = {
            total: count,
            secure: count - critCount,
            warnings: critCount,
            cves: state.containers.reduce((acc, c) => acc + (c.secret_leaks ? c.secret_leaks.length : 0), 0),
            updatesAvailable: updatesAvail,
            globalScore: avgScore,
            globalGrade: globalGrade
        };
    }

    // ==========================================================================
    // UI Rendering
    // ==========================================================================

    function renderStats() {
        el.statTotal.textContent = state.stats.total;
        el.statAlerts.textContent = state.stats.warnings;
        el.statUpdates.textContent = state.stats.updatesAvailable;

        // Circular Gauge
        el.globalGrade.textContent = state.stats.globalGrade;
        
        // Ring dashoffset (circumference of r=44 is 2 * PI * 44 = 276.46)
        const circumference = 276.46;
        const offset = circumference - (state.stats.globalScore / 100) * circumference;
        el.scoreRing.style.strokeDashoffset = offset;

        // Color theme for circle
        if (state.stats.globalScore >= 90) {
            el.scoreRing.style.stroke = "var(--success)";
            el.globalStatusBadge.className = "badge badge-success";
            el.globalStatusBadge.textContent = "Excellent";
        } else if (state.stats.globalScore >= 60) {
            el.scoreRing.style.stroke = "var(--warning)";
            el.globalStatusBadge.className = "badge badge-warning";
            el.globalStatusBadge.textContent = "Améliorable";
        } else {
            el.scoreRing.style.stroke = "var(--danger)";
            el.globalStatusBadge.className = "badge badge-danger";
            el.globalStatusBadge.textContent = "Vulnérable";
        }
    }

    function renderContainers() {
        el.loadingState.classList.add('hidden');
        el.containersList.innerHTML = '';

        const filtered = state.containers.filter(c => {
            if (state.activeFilter === 'secure') return c.score >= 75;
            if (state.activeFilter === 'warning') return c.score < 75;
            return true;
        });

        if (filtered.length === 0) {
            el.containersList.classList.add('hidden');
            el.emptyState.classList.remove('hidden');
            return;
        }

        el.containersList.classList.remove('hidden');

        filtered.forEach(c => {
            const card = document.createElement('div');
            card.className = `container-card glass grade-${c.grade.toLowerCase()}`;
            card.setAttribute('data-id', c.id);
            
            // Build the indicator pills
            const userPill = c.is_root 
                ? `<span class="indicator-pill fail"><i class="fa-solid fa-skull"></i> Root</span>`
                : `<span class="indicator-pill pass"><i class="fa-solid fa-user-shield"></i> Non-Root</span>`;

            const privilegedPill = c.is_privileged
                ? `<span class="indicator-pill fail"><i class="fa-solid fa-triangle-exclamation"></i> Privilégié</span>`
                : ``;

            const pinningPill = c.tag_pinned
                ? `<span class="indicator-pill pass"><i class="fa-solid fa-anchor"></i> Figé</span>`
                : `<span class="indicator-pill fail"><i class="fa-solid fa-triangle-exclamation"></i> Non Figé</span>`;

            const secretsCount = c.secret_leaks ? c.secret_leaks.length : 0;
            const secretsPill = secretsCount > 0
                ? `<span class="indicator-pill fail"><i class="fa-solid fa-key"></i> ${secretsCount} Fuite(s)</span>`
                : `<span class="indicator-pill pass"><i class="fa-solid fa-key"></i> Aucun Secret en Clair</span>`;

            const mountsCount = c.sensitive_mounts ? c.sensitive_mounts.length : 0;
            const mountsPill = mountsCount > 0
                ? `<span class="indicator-pill fail"><i class="fa-solid fa-folder-open"></i> ${mountsCount} Partage(s)</span>`
                : ``;

            // Bottom updates check
            const updateTag = c.tag_pinned
                ? `<span class="update-tag"><i class="fa-solid fa-check-double text-success"></i> À jour</span>`
                : `<span class="update-tag update-avail"><i class="fa-solid fa-arrows-spin fa-spin"></i> Mise à jour dispo</span>`;

            card.innerHTML = `
                <div class="card-top">
                    <div class="card-title-group">
                        <h4>${c.name}</h4>
                        <span class="card-image-name">${c.image_name}:${c.image_tag}</span>
                    </div>
                    <div class="card-badge-score score-${c.grade.toLowerCase()}">${c.grade}</div>
                </div>
                <div class="card-indicators">
                    ${pinningPill}
                    ${userPill}
                    ${privilegedPill}
                    ${secretsPill}
                    ${mountsPill}
                </div>
                <div class="card-bottom">
                    <span>ID: ${c.id.substring(0, 12)}</span>
                    ${updateTag}
                </div>
            `;

            // On click -> open side drawer
            card.addEventListener('click', () => openDrawer(c.id));

            el.containersList.appendChild(card);
        });
    }

    // Populates settings form with live configurations (Sprint 5)
    function renderSettings() {
        if (!state.config) return;
        
        el.selectSeverity.value = state.config.SecOps.MaxSeverityAllowed || "HIGH";
        el.checkboxAllowRoot.checked = state.config.SecOps.AllowRoot;
        el.checkboxAllowPrivileged.checked = state.config.SecOps.AllowPrivileged;
        
        el.inputSmtpHost.value = state.config.SMTP.Host || '';
        el.inputSmtpPort.value = state.config.SMTP.Port || 587;
        el.inputSmtpUser.value = state.config.SMTP.User || '';
        el.inputSmtpFrom.value = state.config.SMTP.From || '';
        el.inputSmtpTo.value = state.config.SMTP.To || '';
        el.checkboxSmtpTlsSkip.checked = state.config.SMTP.TLSSkipVerify;

        // Password placeholder warning
        el.inputSmtpPass.value = '';
        if (state.config.SMTP.HasPassword) {
            el.inputSmtpPass.placeholder = "•••••••• (enregistré)";
        } else {
            el.inputSmtpPass.placeholder = "Aucun mot de passe associé";
        }
    }

    // Renders the list of registered registries inside Settings modal (Sprint 5)
    function renderRegistries() {
        el.registriesList.innerHTML = '';
        if (!state.registries || state.registries.length === 0) {
            el.registriesList.innerHTML = `<p class="version" style="text-align: center; padding: 0.5rem 0;">Aucun registre privé associé</p>`;
            return;
        }

        state.registries.forEach(reg => {
            const item = document.createElement('div');
            item.className = 'config-item';
            item.style.padding = '0.5rem 0.85rem';
            item.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <strong style="font-size: 0.85rem; font-family: monospace;">${reg.server_address}</strong>
                    <span class="version">User: ${reg.username}</span>
                </div>
                <button type="button" class="btn btn-primary" data-id="${reg.id}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); color: #f87171;"><i class="fa-solid fa-trash-can"></i></button>
            `;

            // Delete registry listener
            item.querySelector('button').addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                deleteRegistryCredential(id);
            });

            el.registriesList.appendChild(item);
        });
    }

    // Renders the list of audit log historical events (Sprint 5)
    function renderAuditLogs() {
        el.auditLogsRows.innerHTML = '';

        if (!state.auditLogs || state.auditLogs.length === 0) {
            el.auditLogsRows.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">
                        <i class="fa-solid fa-circle-info"></i> Aucun événement d'audit ou de rollout enregistré dans SQLite pour le moment.
                    </td>
                </tr>
            `;
            return;
        }

        state.auditLogs.forEach(log => {
            const row = document.createElement('tr');
            
            // Format Timestamp
            const date = new Date(log.timestamp);
            const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            // Format Status classes
            let statusClass = "status-log-success";
            let statusIcon = `<i class="fa-solid fa-circle-check"></i>`;
            if (log.status === "BLOCKED") {
                statusClass = "status-log-blocked";
                statusIcon = `<i class="fa-solid fa-shield-halved"></i>`;
            } else if (log.status === "FAILED") {
                statusClass = "status-log-failed";
                statusIcon = `<i class="fa-solid fa-triangle-exclamation"></i>`;
            }

            // CVE details snippet
            const cvesSum = log.cve_critical + log.cve_high + log.cve_medium;
            const cveBadge = cvesSum > 0
                ? `<span class="badge badge-danger" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">${log.cve_critical}/${log.cve_high}/${log.cve_medium}</span>`
                : `<span class="badge badge-success" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">Sain</span>`;

            row.innerHTML = `
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); white-space: nowrap; color: var(--text-secondary); font-family: monospace;">${dateStr}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-weight: 700;">${log.container_name}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-family: monospace; font-size: 0.75rem; word-break: break-all; max-width: 250px;" title="${log.image}">${log.image.split('@')[0]}<span class="version" style="display:block;">${log.image.includes('@') ? log.image.split('@')[1].substring(0, 20) + '...' : ''}</span></td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); white-space: nowrap;" class="${statusClass}">${statusIcon} ${log.status}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.8rem; color: var(--text-secondary); max-width: 300px;" title="${log.reason}">${log.reason}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); text-align: center;">${cveBadge}</td>
            `;

            el.auditLogsRows.appendChild(row);
        });
    }

    // ==========================================================================
    // Drawer Details View Management
    // ==========================================================================
    function openDrawer(containerId) {
        const c = state.containers.find(x => x.id === containerId);
        if (!c) return;

        state.selectedContainerId = containerId;
        
        // Set basic drawer metadata
        el.drawerContainerName.textContent = c.name;
        el.drawerContainerImage.textContent = `${c.image_name}:${c.image_tag}`;

        // Reset status message
        el.updateStatusMsg.classList.add('hidden');

        // Setup overview elements
        // 1. Tag Pinning
        el.evalPinning.textContent = c.tag_pinned ? "Tag d'image figé de façon immuable" : "Tag d'image dynamique (ex: latest). Risque d'empoisonnement.";
        el.iconPinning.className = c.tag_pinned ? "eval-icon pass" : "eval-icon fail";
        el.iconPinning.innerHTML = c.tag_pinned ? `<i class="fa-solid fa-check"></i>` : `<i class="fa-solid fa-xmark"></i>`;

        // 2. Root user
        el.evalRoot.textContent = c.is_root ? `Conteneur s'exécute en ROOT (UID: ${c.user}) !` : `Utilisateur non-root configuré (${c.user})`;
        el.iconRoot.className = c.is_root ? "eval-icon fail" : "eval-icon pass";
        el.iconRoot.innerHTML = c.is_root ? `<i class="fa-solid fa-xmark"></i>` : `<i class="fa-solid fa-check"></i>`;

        // 3. Privileged
        el.evalPrivileged.textContent = c.is_privileged ? "Conteneur s'exécute en mode PRIVILÉGIÉ" : "Privilèges standards restrictifs actifs";
        el.iconPrivileged.className = c.is_privileged ? "eval-icon fail" : "eval-icon pass";
        el.iconPrivileged.innerHTML = c.is_privileged ? `<i class="fa-solid fa-xmark"></i>` : `<i class="fa-solid fa-check"></i>`;

        // 4. Sensitive mounts
        const mountsCount = c.sensitive_mounts ? c.sensitive_mounts.length : 0;
        el.evalMounts.textContent = mountsCount > 0 ? `${mountsCount} volume(s) système sensible(s) monté(s)` : "Aucun dossier système de l'hôte n'est partagé";
        el.iconMounts.className = mountsCount > 0 ? "eval-icon fail" : "eval-icon pass";
        el.iconMounts.innerHTML = mountsCount > 0 ? `<i class="fa-solid fa-xmark"></i>` : `<i class="fa-solid fa-check"></i>`;

        // 5. Environmental leaks
        const secretsCount = c.secret_leaks ? c.secret_leaks.length : 0;
        el.evalSecrets.textContent = secretsCount > 0 ? `${secretsCount} variable(s) d'env contenant des secrets en clair` : "Aucun mot de passe ou clé d'API détecté dans l'environnement";
        el.iconSecrets.className = secretsCount > 0 ? "eval-icon fail" : "eval-icon pass";
        el.iconSecrets.innerHTML = secretsCount > 0 ? `<i class="fa-solid fa-xmark"></i>` : `<i class="fa-solid fa-check"></i>`;

        // Render volumes list
        el.drawerMountsList.innerHTML = '';
        if (c.all_mounts && c.all_mounts.length > 0) {
            c.all_mounts.forEach(m => {
                const item = document.createElement('div');
                const isSensitive = c.sensitive_mounts && c.sensitive_mounts.some(sm => sm === m);
                item.className = isSensitive ? 'mount-item border-color text-red bg-danger-glow' : 'mount-item';
                item.innerHTML = `<i class="fa-solid fa-hard-drive"></i> ${m}`;
                el.drawerMountsList.appendChild(item);
            });
        } else {
            el.drawerMountsList.innerHTML = '<p class="version">Aucun volume monté</p>';
        }

        // Render environment leaks list
        el.drawerSecretsList.innerHTML = '';
        if (c.secret_leaks && c.secret_leaks.length > 0) {
            c.secret_leaks.forEach(leak => {
                const item = document.createElement('div');
                item.className = 'secret-item';
                item.innerHTML = `
                    <span class="sec-key"><i class="fa-solid fa-lock"></i> ${leak.key}</span>
                    <span class="sec-val">Valeur: ${leak.value_snippet}</span>
                `;
                el.drawerSecretsList.appendChild(item);
            });
        } else {
            el.drawerSecretsList.innerHTML = '<p class="version">Aucune variable d\'env sensible trouvée</p>';
        }

        // Reset badge counters and stats on tabs to avoid caching previous container results
        el.cveCountBadge.textContent = '...';
        el.dockleCountBadge.textContent = '...';
        el.trivyCrit.textContent = '-';
        el.trivyHigh.textContent = '-';
        el.trivyMed.textContent = '-';
        el.trivyLow.textContent = '-';
        el.dockleFatal.textContent = '-';
        el.dockleWarn.textContent = '-';
        el.dockleInfo.textContent = '-';

        // Select the default Overview tab
        const defaultTabBtn = el.tabBtns[0];
        switchTab(defaultTabBtn, 'tab-overview');

        // Show drawer and overlay
        el.drawer.classList.add('active');
        el.drawerOverlay.classList.add('active');

        // Asynchronously fetch Trivy and Dockle details in background
        fetchTrivyReport(containerId);
        fetchDockleReport(containerId);
    }

    function closeDrawer() {
        el.drawer.classList.remove('active');
        el.drawerOverlay.classList.remove('active');
        state.selectedContainerId = null;
    }

    function switchTab(activeBtn, targetTabId) {
        el.tabBtns.forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');

        el.tabPanes.forEach(pane => {
            if (pane.id === targetTabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    }

    function renderTrivyReport(report) {
        el.trivyLoading.classList.add('hidden');
        el.trivyList.innerHTML = '';

        if (!report || !report.vulnerabilities || report.vulnerabilities.length === 0) {
            el.cveCountBadge.textContent = '0';
            el.trivyCrit.textContent = '0';
            el.trivyHigh.textContent = '0';
            el.trivyMed.textContent = '0';
            el.trivyLow.textContent = '0';
            el.trivyEmpty.classList.remove('hidden');
            return;
        }

        // Update badges and counters
        const summary = report.summary || { critical: 0, high: 0, medium: 0, low: 0 };
        el.cveCountBadge.textContent = report.vulnerabilities.length;
        el.trivyCrit.textContent = summary.critical || 0;
        el.trivyHigh.textContent = summary.high || 0;
        el.trivyMed.textContent = summary.medium || 0;
        el.trivyLow.textContent = summary.low || 0;

        el.trivyList.classList.remove('hidden');

        // Populate list
        report.vulnerabilities.forEach(vuln => {
            const item = document.createElement('div');
            const severityClass = (vuln.severity || 'LOW').toLowerCase();
            item.className = `vuln-item ${severityClass}`;
            
            const fixedVer = vuln.fixed_version ? `<span class="badge badge-success">Fix in ${vuln.fixed_version}</span>` : '';
            const cveUrl = vuln.url ? `<a href="${vuln.url}" target="_blank" class="vuln-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> Consulter l'avis CVE</a>` : '';

            item.innerHTML = `
                <div class="vuln-item-header">
                    <span class="vuln-cve">${vuln.cve_id}</span>
                    <span class="badge ${getSeverityBadgeClass(vuln.severity)}">${vuln.severity}</span>
                </div>
                <span class="vuln-pkg">Paquet: <strong>${vuln.package_name}</strong> (Installé: ${vuln.installed_version}) ${fixedVer}</span>
                <span class="vuln-title">${vuln.title || 'Pas de titre'}</span>
                <p class="vuln-desc">${vuln.description || 'Pas de description détaillée disponible.'}</p>
                ${cveUrl}
            `;
            el.trivyList.appendChild(item);
        });
    }

    function renderDockleReport(report) {
        el.dockleLoading.classList.add('hidden');
        el.dockleList.innerHTML = '';

        if (!report || !report.details || report.details.length === 0) {
            el.dockleCountBadge.textContent = '0';
            el.dockleFatal.textContent = '0';
            el.dockleWarn.textContent = '0';
            el.dockleInfo.textContent = '0';
            el.dockleEmpty.classList.remove('hidden');
            return;
        }

        // Update badges and stats
        const summary = report.summary || { fatal: 0, warn: 0, info: 0 };
        const totalAlerts = (summary.fatal || 0) + (summary.warn || 0) + (summary.info || 0);
        el.dockleCountBadge.textContent = totalAlerts;
        el.dockleFatal.textContent = summary.fatal || 0;
        el.dockleWarn.textContent = summary.warn || 0;
        el.dockleInfo.textContent = summary.info || 0;

        el.dockleList.classList.remove('hidden');

        // Populate list
        report.details.forEach(detail => {
            const item = document.createElement('div');
            const levelClass = (detail.level || 'INFO').toLowerCase();
            item.className = `compliance-item ${levelClass}`;

            let alertsHtml = '';
            if (detail.alerts && detail.alerts.length > 0) {
                alertsHtml = `<ul class="compliance-detail-list">`;
                detail.alerts.forEach(alert => {
                    alertsHtml += `<li>${alert}</li>`;
                });
                alertsHtml += `</ul>`;
            }

            item.innerHTML = `
                <div class="compliance-item-header">
                    <span class="compliance-code">${detail.code}</span>
                    <span class="badge ${getLevelBadgeClass(detail.level)}">${detail.level}</span>
                </div>
                <span class="compliance-title">${detail.title}</span>
                ${alertsHtml}
            `;
            el.dockleList.appendChild(item);
        });
    }

    function getSeverityBadgeClass(sev) {
        switch ((sev || 'LOW').toUpperCase()) {
            case 'CRITICAL': return 'badge-danger';
            case 'HIGH': return 'badge-danger';
            case 'MEDIUM': return 'badge-warning';
            default: return 'badge-success';
        }
    }

    function getLevelBadgeClass(lvl) {
        switch ((lvl || 'INFO').toUpperCase()) {
            case 'FATAL': return 'badge-danger';
            case 'WARN': return 'badge-warning';
            default: return 'badge-success';
        }
    }

    // ==========================================================================
    // SPA Routing & Navigation
    // ==========================================================================
    function navigateToPage(pageId) {
        const pages = ['view-dashboard', 'view-containers', 'view-settings'];
        pages.forEach(p => {
            const elPage = document.getElementById(p);
            if (elPage) elPage.classList.add('hidden');
        });

        const activePage = document.getElementById(pageId);
        if (activePage) activePage.classList.remove('hidden');

        const navMap = {
            'view-dashboard': 'btn-nav-dashboard',
            'view-containers': 'btn-nav-containers',
            'view-settings': 'btn-nav-settings'
        };

        Object.keys(navMap).forEach(key => {
            const btn = document.getElementById(navMap[key]);
            if (btn) {
                if (key === pageId) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });

        const headerTitle = document.querySelector('.main-header h2');
        const headerDesc = document.getElementById('current-time');
        
        if (pageId === 'view-dashboard') {
            if (headerTitle) headerTitle.textContent = "Tableau de bord de sécurité";
            updateTime();
        } else if (pageId === 'view-containers') {
            if (headerTitle) headerTitle.textContent = "Statuts et métadonnées de sécurité";
            if (headerDesc) headerDesc.textContent = "Liste complète de vos conteneurs actifs et évaluation SecOps";
        } else if (pageId === 'view-settings') {
            if (headerTitle) headerTitle.textContent = "Configuration de sécurité";
            if (headerDesc) headerDesc.textContent = "Ajustez les règles SecOps globales et configurez vos accès et surcharges";
            fetchConfig();
            fetchContainerOverrides();
        }
    }

    // ==========================================================================
    // Conteneurs Page: Table Renderer
    // ==========================================================================
    function renderContainersTable() {
        const rowsEl = document.getElementById('containers-table-rows');
        if (!rowsEl) return;

        rowsEl.innerHTML = '';

        const searchQuery = document.getElementById('containers-table-search') 
            ? document.getElementById('containers-table-search').value.toLowerCase().trim() 
            : '';

        const filtered = state.containers.filter(c => {
            if (searchQuery) {
                return c.name.toLowerCase().includes(searchQuery) || c.image_name.toLowerCase().includes(searchQuery);
            }
            return true;
        });

        if (filtered.length === 0) {
            rowsEl.innerHTML = `
                <tr style="color: var(--text-muted);">
                    <td colspan="8" style="padding: 2rem; text-align: center;">
                        <i class="fa-solid fa-folder-open" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        Aucun conteneur trouvé.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(c => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.style.height = '50px';
            tr.style.transition = 'background-color 0.2s ease';
            
            tr.addEventListener('mouseenter', () => {
                tr.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
            });
            tr.addEventListener('mouseleave', () => {
                tr.style.backgroundColor = 'transparent';
            });

            const statusCell = `
                <span class="badge badge-${c.score >= 75 ? 'success' : 'warning'}" style="font-weight: 800; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem;">
                    <strong>${c.grade}</strong> (${c.score}/100)
                </span>
            `;

            const nameCell = `<strong style="color: var(--text-primary); font-family: var(--font-header);">${c.name}</strong><br><span style="font-size: 0.7rem; color: var(--text-muted);">ID: ${c.id.substring(0, 12)}</span>`;
            const imageCell = `<code style="font-size: 0.75rem; color: var(--info);">${c.image_name}</code><br><span style="font-size: 0.7rem; color: var(--text-secondary);"><i class="fa-solid fa-tag"></i> ${c.image_tag}</span>`;

            const digestCell = c.tag_pinned
                ? `<i class="fa-solid fa-circle-check text-success" style="font-size: 1.1rem;" title="Image figée de façon immuable par digest"></i>`
                : `<i class="fa-solid fa-circle-xmark text-danger" style="font-size: 1.1rem;" title="Image non figée (vulnérable à l'empoisonnement de tag)"></i>`;

            const rootCell = !c.is_root
                ? `<i class="fa-solid fa-circle-check text-success" style="font-size: 1.1rem;" title="Utilisateur non-root sécurisé"></i>`
                : `<i class="fa-solid fa-skull text-danger" style="font-size: 1.1rem;" title="Fonctionne en root (UID 0)"></i>`;

            const privilegedCell = !c.is_privileged
                ? `<i class="fa-solid fa-circle-check text-success" style="font-size: 1.1rem;" title="Aucun privilège hôte élevé"></i>`
                : `<i class="fa-solid fa-triangle-exclamation text-danger" style="font-size: 1.1rem;" title="Fonctionne en mode privilégié (accès total hôte)"></i>`;

            const secretsCount = c.secret_leaks ? c.secret_leaks.length : 0;
            const secretsCell = secretsCount === 0
                ? `<i class="fa-solid fa-circle-check text-success" style="font-size: 1.1rem;" title="Aucun secret détecté dans l'environnement"></i>`
                : `<span class="indicator-pill fail" style="padding: 0.15rem 0.4rem; font-size: 0.65rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.2rem;"><i class="fa-solid fa-key"></i> ${secretsCount}</span>`;

            const actionsCell = `
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openDrawer('${c.id}')" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <i class="fa-solid fa-eye"></i> Inspecter
                    </button>
                </div>
            `;

            tr.innerHTML = `
                <td style="padding: 0.75rem 1rem;">${statusCell}</td>
                <td style="padding: 0.75rem 1rem;">${nameCell}</td>
                <td style="padding: 0.75rem 1rem;">${imageCell}</td>
                <td style="padding: 0.75rem 1rem; text-align: center;">${digestCell}</td>
                <td style="padding: 0.75rem 1rem; text-align: center;">${rootCell}</td>
                <td style="padding: 0.75rem 1rem; text-align: center;">${privilegedCell}</td>
                <td style="padding: 0.75rem 1rem; text-align: center;">${secretsCell}</td>
                <td style="padding: 0.75rem 1rem; text-align: right;">${actionsCell}</td>
            `;

            tr.addEventListener('click', () => openDrawer(c.id));
            rowsEl.appendChild(tr);
        });
    }

    // ==========================================================================
    // Container Overrides Management (Sprint 6)
    // ==========================================================================
    function fetchContainerOverrides() {
        fetch('/api/containers/settings')
            .then(res => {
                if (!res.ok) throw new Error("Impossible de récupérer les surcharges");
                return res.json();
            })
            .then(data => {
                state.containerOverrides = data || {};
                renderContainerOverridesList();
                populateContainerSelect();
            })
            .catch(err => {
                console.error("Erreur chargement surcharges :", err);
            });
    }

    function renderContainerOverridesList() {
        const rowsEl = document.getElementById('override-settings-list-rows');
        if (!rowsEl) return;

        rowsEl.innerHTML = '';

        const keys = Object.keys(state.containerOverrides);
        if (keys.length === 0) {
            rowsEl.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 1rem; text-align: center; color: var(--text-muted);">
                        Aucune surcharge active pour le moment.
                    </td>
                </tr>
            `;
            return;
        }

        keys.forEach(name => {
            const override = state.containerOverrides[name];
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.style.height = '40px';

            const cveText = override.secops_max_severity_allowed || `<span style="color: var(--text-muted); font-style: italic;">Hérité</span>`;
            
            const rootText = override.secops_allow_root === null 
                ? `<span style="color: var(--text-muted); font-style: italic;">Hérité</span>` 
                : (override.secops_allow_root ? `<span class="text-success"><i class="fa-solid fa-circle-check"></i> Autorisé</span>` : `<span class="text-danger"><i class="fa-solid fa-circle-xmark"></i> Interdit</span>`);
            
            const privilegedText = override.secops_allow_privileged === null 
                ? `<span style="color: var(--text-muted); font-style: italic;">Hérité</span>` 
                : (override.secops_allow_privileged ? `<span class="text-success"><i class="fa-solid fa-circle-check"></i> Autorisé</span>` : `<span class="text-danger"><i class="fa-solid fa-circle-xmark"></i> Interdit</span>`);

            const deleteBtn = `
                <button type="button" class="btn btn-sm btn-secondary" onclick="deleteContainerOverride('${name}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; border-radius: 4px; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);">
                    <i class="fa-solid fa-trash"></i> Supprimer
                </button>
            `;

            tr.innerHTML = `
                <td style="padding: 0.5rem; font-weight: 600; font-family: var(--font-header);">${name}</td>
                <td style="padding: 0.5rem;">${cveText}</td>
                <td style="padding: 0.5rem; text-align: center;">${rootText}</td>
                <td style="padding: 0.5rem; text-align: center;">${privilegedText}</td>
                <td style="padding: 0.5rem; text-align: right;">${deleteBtn}</td>
            `;

            rowsEl.appendChild(tr);
        });
    }

    function populateContainerSelect() {
        const selectEl = document.getElementById('override-select-container');
        if (!selectEl) return;

        selectEl.innerHTML = '<option value="">-- Sélectionner un conteneur --</option>';

        state.containers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            selectEl.appendChild(opt);
        });
    }

    function saveContainerOverride() {
        const containerName = document.getElementById('override-select-container').value;
        if (!containerName) {
            alert("Veuillez sélectionner un conteneur.");
            return;
        }

        const maxSeverity = document.getElementById('override-select-severity').value;
        
        const rootSelect = document.getElementById('override-select-root').value;
        const allowRoot = rootSelect === "" ? null : (rootSelect === "true");

        const privilegedSelect = document.getElementById('override-select-privileged').value;
        const allowPrivileged = privilegedSelect === "" ? null : (privilegedSelect === "true");

        const payload = {
            container_name: containerName,
            secops_max_severity_allowed: maxSeverity,
            secops_allow_root: allowRoot,
            secops_allow_privileged: allowPrivileged
        };

        const btn = document.getElementById('btn-save-override');
        if (btn) btn.disabled = true;

        fetch('/api/containers/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) throw new Error("Erreur de sauvegarde");
            return res.text();
        })
        .then(() => {
            fetchContainerOverrides();
            document.getElementById('override-select-container').value = '';
            document.getElementById('override-select-severity').value = '';
            document.getElementById('override-select-root').value = '';
            document.getElementById('override-select-privileged').value = '';
        })
        .catch(err => {
            alert("Erreur lors de l'enregistrement de la surcharge : " + err.message);
        })
        .finally(() => {
            if (btn) btn.disabled = false;
        });
    }

    window.deleteContainerOverride = function(containerName) {
        if (!confirm(`Supprimer la surcharge de sécurité pour ${containerName} ?`)) {
            return;
        }

        fetch('/api/containers/settings/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ container_name: containerName })
        })
        .then(res => {
            if (!res.ok) throw new Error("Erreur de suppression");
            return res.text();
        })
        .then(() => {
            fetchContainerOverrides();
        })
        .catch(err => {
            alert("Erreur lors de la suppression de la surcharge : " + err.message);
        });
    };
});
