/* ==========================================================================
   SafeDock Dashboard Client - Pure Vanilla JS Reactivity
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const state = {
        containers: [],
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
        
        // Settings Modal
        btnNavSettings: document.getElementById('btn-nav-settings'),
        settingsPane: document.getElementById('settings-pane'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        cfgSeverity: document.getElementById('cfg-severity'),
        cfgAllowPrivileged: document.getElementById('cfg-allow-privileged'),
        cfgAllowRoot: document.getElementById('cfg-allow-root'),
        cfgSmtpHost: document.getElementById('cfg-smtp-host'),
        cfgSmtpTo: document.getElementById('cfg-smtp-to'),
        
        // Nav Filters
        filterBtns: document.querySelectorAll('.filter-btn')
    };

    // Initialize application
    init();

    function init() {
        fetchConfig();
        fetchContainers();
        setupEventListeners();
        setInterval(updateTime, 1000);
    }

    // ==========================================================================
    // Event Listeners Setup
    // ==========================================================================
    function setupEventListeners() {
        // Global refresh
        el.btnGlobalRefresh.addEventListener('click', () => {
            el.btnGlobalRefresh.classList.add('disabled');
            el.btnGlobalRefresh.querySelector('i').classList.add('fa-spin');
            fetchContainers().finally(() => {
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

        // Settings Modal Navigation
        el.btnNavSettings.addEventListener('click', (e) => {
            e.preventDefault();
            el.settingsPane.classList.remove('hidden');
        });
        el.btnCloseSettings.addEventListener('click', () => {
            el.settingsPane.classList.add('hidden');
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

    // Fetch global server configurations
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
                setTimeout(fetchContainers, 2000);
            } else {
                throw new Error(resultText);
            }
        } catch (err) {
            console.error("Update rollout failed", err);
            el.updateStatusMsg.className = "update-status-msg error";
            el.updateStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Rollout Échoué ou Bloqué :</strong><br>${err.message}`;
            el.updateStatusMsg.classList.remove('hidden');
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
            // Basic mock logic: any container whose tag isn't pinned is treated as having an update check pending
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

    function renderSettings() {
        if (!state.config) return;
        el.cfgSeverity.textContent = state.config.SecOps.MaxSeverityAllowed || "HIGH";
        el.cfgAllowPrivileged.textContent = state.config.SecOps.AllowPrivileged ? "TRUE" : "FALSE";
        el.cfgAllowPrivileged.className = state.config.SecOps.AllowPrivileged ? "cfg-val text-red" : "cfg-val text-success";
        el.cfgAllowRoot.textContent = state.config.SecOps.AllowRoot ? "TRUE" : "FALSE";
        el.cfgAllowRoot.className = state.config.SecOps.AllowRoot ? "cfg-val text-yellow" : "cfg-val text-success";
        
        el.cfgSmtpHost.textContent = state.config.SMTP.Host || "Non Configuré";
        el.cfgSmtpTo.textContent = state.config.SMTP.To || "Non Configuré";
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
                const isSensitive = c.sensitive_mounts.some(sm => sm === m);
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
                    <span class="sec-val">Valeur: ${leak.snippet}</span>
                `;
                el.drawerSecretsList.appendChild(item);
            });
        } else {
            el.drawerSecretsList.innerHTML = '<p class="version">Aucune variable d\'env sensible trouvée</p>';
        }

        // Reset badge counters on tabs
        el.cveCountBadge.textContent = '...';
        el.dockleCountBadge.textContent = '...';

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
});
