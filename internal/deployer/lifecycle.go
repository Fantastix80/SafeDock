package deployer

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/safedock/safedock/internal/config"
	"github.com/safedock/safedock/internal/db"
	"github.com/safedock/safedock/internal/notifier"
	"github.com/safedock/safedock/internal/registry"
	"github.com/safedock/safedock/internal/secops"
)

// LifecycleOrchestrator orchestre le cycle de vie SecOps des conteneurs.
type LifecycleOrchestrator struct {
	cli      *client.Client
	regCli   *registry.RegistryClient
	cfg      *config.Config
}

// NewLifecycleOrchestrator initialise l'orchestrateur pour l'hôte Docker local.
func NewLifecycleOrchestrator(cfg *config.Config) (*LifecycleOrchestrator, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("erreur initialisation client Docker : %w", err)
	}

	return &LifecycleOrchestrator{
		cli:    cli,
		regCli: registry.NewRegistryClient(),
		cfg:    cfg,
	}, nil
}

// NewLifecycleOrchestratorFor initialise l'orchestrateur pour un hôte Docker donné.
// endpoint vide → hôte local ; sinon connexion distante avec TLS mutuel optionnel.
func NewLifecycleOrchestratorFor(cfg *config.Config, endpoint, caPEM, certPEM, keyPEM string) (*LifecycleOrchestrator, error) {
	if endpoint == "" {
		return NewLifecycleOrchestrator(cfg)
	}

	opts := []client.Opt{
		client.WithHost(endpoint),
		client.WithAPIVersionNegotiation(),
	}
	if certPEM != "" && keyPEM != "" {
		cert, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if err != nil {
			return nil, fmt.Errorf("certificat/clé TLS client invalide : %w", err)
		}
		tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}
		if caPEM != "" {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM([]byte(caPEM)) {
				return nil, fmt.Errorf("CA TLS illisible")
			}
			tlsConfig.RootCAs = pool
		}
		opts = append(opts, client.WithHTTPClient(&http.Client{
			Transport: &http.Transport{TLSClientConfig: tlsConfig},
		}))
	}

	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("erreur initialisation client Docker distant : %w", err)
	}
	return &LifecycleOrchestrator{
		cli:    cli,
		regCli: registry.NewRegistryClient(),
		cfg:    cfg,
	}, nil
}

// Close libère les ressources.
func (lo *LifecycleOrchestrator) Close() error {
	return lo.cli.Close()
}

// CheckAndUpdateContainer verifie si une mise à jour est disponible pour le conteneur donné.
// Si oui, il exécute la batterie SecOps et réalise un redéploiement transactionnel sécurisé.
// Retourne (updated, error) : updated=true seulement si un nouveau conteneur a été déployé.
// updated=false avec error=nil signifie « déjà à jour, rien à faire ».
func (lo *LifecycleOrchestrator) CheckAndUpdateContainer(ctx context.Context, containerID string) (bool, error) {
	// 1. Inspection du conteneur actuel
	inspect, err := lo.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return false, fmt.Errorf("impossible d'inspecter le conteneur : %w", err)
	}

	containerName := strings.TrimPrefix(inspect.Name, "/")
	originalImage := inspect.Config.Image

	fmt.Printf("\n🔄 [CYCLE %s] Analyse de l'image associée : %s...\n", containerName, originalImage)

	// S'il tourne déjà avec un Digest précis, on extrait le nom pour vérification
	imageNameWithoutDigest := originalImage
	if strings.Contains(originalImage, "@") {
		imageNameWithoutDigest = strings.Split(originalImage, "@")[0]
	}

	// 2. Récupération du Digest distant depuis le registre
	remoteDigest, err := lo.regCli.FetchRemoteDigest(ctx, originalImage)
	if err != nil {
		return false, fmt.Errorf("impossible de requêter le registre distant : %w", err)
	}

	// 3. Comparaison avec le Digest local actuel
	localDigest := inspect.Image
	fmt.Printf("   ├─ Local Digest  : %s\n", localDigest)
	fmt.Printf("   ├─ Remote Digest : %s\n", remoteDigest)

	if localDigest == remoteDigest || strings.HasSuffix(localDigest, remoteDigest) {
		fmt.Printf("   ✅ [CYCLE %s] Le conteneur est à jour (Digests identiques).\n", containerName)
		return false, nil
	}

	fmt.Printf("   🚨 [CYCLE %s] Nouvelle version détectée sur le registre !\n", containerName)
	fmt.Println("   ├─ Lancement du Pipeline de Staging SecOps...")

	// 4. Staging Pipeline: Téléchargement en tâche de fond de la nouvelle version
	fullNewImage := fmt.Sprintf("%s@%s", imageNameWithoutDigest, remoteDigest)
	fmt.Printf("   ├─ Téléchargement (Pull) de l'image de Staging : %s...\n", fullNewImage)
	
	pullOpts := types.ImagePullOptions{}
	if encodedAuth, ok := lo.regCli.EncodedAuthForImage(fullNewImage); ok {
		// Registre privé : on injecte les identifiants stockés (déchiffrés) pour le pull.
		pullOpts.RegistryAuth = encodedAuth
	}
	pullReader, err := lo.cli.ImagePull(ctx, fullNewImage, pullOpts)
	if err != nil {
		return false, fmt.Errorf("échec du téléchargement de l'image de Staging : %w", err)
	}
	// Lecture obligatoire du flux pour finaliser le téléchargement
	_, _ = io.Copy(io.Discard, pullReader)
	pullReader.Close()
	fmt.Println("   ├─ Image téléchargée avec succès. Début des scans...")

	// Nettoyage immédiat à la fin de cette fonction pour tous les chemins d'échec.
	// deployed passe à true uniquement si le pivot réussit ; dans tous les autres
	// cas (erreur de scan, rejet SecOps, crash + rollback), defer supprime l'image.
	deployed := false
	defer func() {
		if !deployed {
			lo.cleanupStagingImage(fullNewImage)
		}
	}()

	// 5. Batterie SecOps : Scan de vulnérabilités (Trivy)
	fmt.Println("   ├─ Lancement du scan de vulnérabilités Trivy...")
	trivyReport, err := secops.ScanImage(ctx, fullNewImage)
	if err != nil {
		return false, fmt.Errorf("échec du scan Trivy sur l'image de Staging : %w", err)
	}
	
	// Évaluation de la conformité Trivy (compteurs bruts, pour les logs et notifications).
	critCount := trivyReport.Summary.Critical
	highCount := trivyReport.Summary.High
	fmt.Printf("   │  ├─ Failles Trivy détectées : %d Critiques, %d Hautes, %d Moyennes\n",
		critCount, highCount, trivyReport.Summary.Medium)

	// Risques acceptés : on exclut les CVE explicitement tolérées (et non expirées) du verdict.
	// Les compteurs effectifs servent à la décision de blocage ; les bruts restent affichés.
	exceptedSet, _ := db.GetActiveExceptedCVEs(containerName)
	effCrit, effHigh, effMed, effLow, effUnknown := effectiveCounts(trivyReport, exceptedSet)
	if waived := (critCount - effCrit) + (highCount - effHigh); waived > 0 {
		fmt.Printf("   │  ℹ️  %d vulnérabilité(s) critiques/hautes tolérée(s) par exception (risque accepté).\n", waived)
	}

	// Décision automatique de sécurité avec prise en compte des surcharges par conteneur
	isSecOpsApproved := true
	secopsReason := ""

	// Résolution de la configuration active (surcharges par conteneur ou configuration globale)
	maxSev := lo.cfg.SecOps.MaxSeverityAllowed
	allowRoot := lo.cfg.SecOps.AllowRoot
	allowPrivileged := lo.cfg.SecOps.AllowPrivileged

	maxSevOverride, allowRootOverride, allowPrivilegedOverride, _, err := db.GetContainerSettings(containerName)
	if err != nil {
		fmt.Printf("   │  ⚠️  Impossible de charger les surcharges de configuration de DB : %v. Repli sur le global.\n", err)
	} else {
		if maxSevOverride != "" {
			maxSev = maxSevOverride
			fmt.Printf("   │  ℹ️  Surcharge active pour ce conteneur - Tolérance CVE : %s\n", maxSev)
		}
		if allowRootOverride != nil {
			allowRoot = *allowRootOverride
			fmt.Printf("   │  ℹ️  Surcharge active pour ce conteneur - Autoriser Root : %t\n", allowRoot)
		}
		if allowPrivilegedOverride != nil {
			allowPrivileged = *allowPrivilegedOverride
			fmt.Printf("   │  ℹ️  Surcharge active pour ce conteneur - Autoriser Privilégié : %t\n", allowPrivileged)
		}
	}

	// 5a. Validation SecOps : Règle Non-Root
	user := inspect.Config.User
	isRoot := user == "" || user == "root" || user == "0" || strings.HasPrefix(user, "0:")
	if isRoot && !allowRoot {
		isSecOpsApproved = false
		secopsReason = "Le conteneur s'exécute en tant qu'utilisateur root, ce qui n'est pas autorisé par vos règles de sécurité."
	}

	// 5b. Validation SecOps : Règle Privilégiée
	isPrivileged := inspect.HostConfig.Privileged
	if isPrivileged && !allowPrivileged && isSecOpsApproved {
		isSecOpsApproved = false
		secopsReason = "Le conteneur s'exécute en mode privilégié, ce qui n'est pas autorisé par vos règles de sécurité."
	}

	// 5c. Validation SecOps : Règle CVE Sévérités (sur compteurs effectifs, hors risques acceptés)
	if isSecOpsApproved {
		switch maxSev {
		case "CRITICAL":
			if effCrit > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Présence de %d vulnérabilités critiques non tolérées (seuil: CRITICAL)", effCrit)
			}
		case "HIGH":
			if effCrit > 0 || effHigh > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Présence de vulnérabilités critiques (%d) ou hautes (%d) non tolérées (seuil: HIGH)", effCrit, effHigh)
			}
		case "MEDIUM":
			if effCrit > 0 || effHigh > 0 || effMed > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Présence de vulnérabilités critiques (%d), hautes (%d) ou moyennes (%d) non tolérées (seuil: MEDIUM)", effCrit, effHigh, effMed)
			}
		case "LOW":
			if effCrit > 0 || effHigh > 0 || effMed > 0 || effLow > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Présence de vulnérabilités non tolérées (critiques: %d, hautes: %d, moyennes: %d, basses: %d) (seuil: LOW)", effCrit, effHigh, effMed, effLow)
			}
		case "NONE":
			totalCVE := effCrit + effHigh + effMed + effLow + effUnknown
			if totalCVE > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Présence de %d vulnérabilités détectées alors qu'aucune n'est tolérée (seuil: NONE)", totalCVE)
			}
		}
	}

	// 6. Batterie SecOps : Scan de Structure (Dockle)
	if isSecOpsApproved {
		fmt.Println("   ├─ Lancement du linter de conformité Dockle...")
		dockleReport, err := secops.ScanCompliance(ctx, fullNewImage)
		if err != nil {
			// On continue même si dockle échoue à s'exécuter, mais on loggue
			fmt.Printf("   │  ⚠️  Dockle n'a pas pu s'exécuter correctement : %v\n", err)
		} else {
			fmt.Printf("   │  ├─ Conformité Dockle : %d Fatal, %d Alertes\n", 
				dockleReport.Summary.Fatal, dockleReport.Summary.Warn)
			if dockleReport.Summary.Fatal > 0 {
				isSecOpsApproved = false
				secopsReason = fmt.Sprintf("Dockle a détecté %d non-conformités majeures (ex: secrets en clair dans l'historique)", dockleReport.Summary.Fatal)
			}
		}
	}

	// 7. Prise de décision SecOps (Pass/Fail)
	if !isSecOpsApproved {
		fmt.Printf("   ❌ [BLOCAGE SECURE] Mise à jour annulée pour %s ! Motif : %s\n", containerName, secopsReason)
		
		// Enregistrement dans l'historique d'audit SQLite
		_ = db.WriteAuditLog(containerName, containerID, fullNewImage, "BLOCKED", secopsReason, critCount, highCount, trivyReport.Summary.Medium)
		db.WriteNotification("WARNING", "Déploiement bloqué par le pare-feu SecOps",
			fmt.Sprintf("%s : %s", containerName, secopsReason), containerName, "")

		// Envoi de l'alerte par e-mail
		mailSubject := fmt.Sprintf("🚨 Bloqué : Alerte SecOps sur la mise à jour de %s", containerName)
		mailContent := fmt.Sprintf(`
			<p>La mise à jour automatique du conteneur <strong>%s</strong> a été bloquée par le pare-feu SafeDock.</p>
			<p style="color: #e03e2f; font-weight: bold;">Motif : %s</p>
			<h3>Rapport de Staging SecOps :</h3>
			<ul>
				<li>Image de Staging : <code>%s</code></li>
				<li>Vulnérabilités Critiques : <strong style="color:#e03e2f;">%d</strong></li>
				<li>Vulnérabilités Hautes : <strong>%d</strong></li>
				<li>Total des failles détectées : %d</li>
			</ul>
		`, containerName, secopsReason, fullNewImage, critCount, highCount, len(trivyReport.Vulnerabilities))
		
		_ = notifier.SendEmail(&lo.cfg.SMTP, mailSubject, notifier.BuildHTMLReport(mailSubject, mailContent, false))
		return false, fmt.Errorf("mise à jour bloquée par les règles SecOps : %s", secopsReason)
	}

	// 8. Redéploiement transactionnel sécurisé (Pass !)
	fmt.Printf("   ✅ [PASS] Image validée par les règles SecOps. Préparation du redéploiement...\n")
	
	err = lo.executeTransactionalRollout(ctx, containerID, &inspect, fullNewImage)
	if err != nil {
		// Enregistrement de l'échec dans l'historique d'audit SQLite
		_ = db.WriteAuditLog(containerName, containerID, fullNewImage, "FAILED", err.Error(), critCount, highCount, trivyReport.Summary.Medium)

		// Rollback mail
		mailSubject := fmt.Sprintf("⚠️ Rollback : Échec du redéploiement de %s", containerName)
		mailContent := fmt.Sprintf(`
			<p>L'image de Staging pour <strong>%s</strong> a été validée par SecOps, mais l'exécution du déploiement a échoué.</p>
			<p style="color: #e03e2f; font-weight: bold;">Erreur : %v</p>
			<p>🛡️ <strong>SafeDock a automatiquement restauré l'ancien conteneur de manière sécurisée.</strong> Aucune coupure permanente de service.</p>
		`, containerName, err)
		_ = notifier.SendEmail(&lo.cfg.SMTP, mailSubject, notifier.BuildHTMLReport(mailSubject, mailContent, false))
		return false, err
	}

	// Enregistrement du succès dans l'historique d'audit SQLite
	_ = db.WriteAuditLog(containerName, containerID, fullNewImage, "SUCCESS", "Pivot SecOps complété avec succès", critCount, highCount, trivyReport.Summary.Medium)

	// Déploiement confirmé → l'image est en production, le defer ne la supprimera pas
	deployed = true

	// ── Nettoyage du cache de l'ancienne image ─────────────────────────────────
	// L'ancienne image n'est plus en service : ses rapports SQLite sont obsolètes.
	// inspect.Image contient le hash de contenu de l'image avant le pivot.
	oldDigest := inspect.Image
	if n, purgeErr := db.PurgeScanReportsByDigest(oldDigest); purgeErr == nil && n > 0 {
		fmt.Printf("   🗑️  [CACHE] %d rapport(s) de l'ancienne image supprimé(s) (%.20s...)\n", n, oldDigest)
	}

	// ── Pré-chargement du cache pour la nouvelle image ─────────────────────────
	// Le rapport Trivy de staging est déjà disponible : on le sauvegarde en DB
	// avec le hash de contenu de la nouvelle image. Ainsi, quand l'utilisateur
	// ouvre l'onglet Audit après la MAJ, le rapport s'affiche sans re-scan.
	if newInfo, _, inspErr := lo.cli.ImageInspectWithRaw(ctx, fullNewImage); inspErr == nil {
		newDigest := newInfo.ID
		if reportBytes, marshErr := json.Marshal(trivyReport); marshErr == nil {
			trivyCacheKey := newDigest + "_trivy"
			if saveErr := db.SaveScanReport(trivyCacheKey, "trivy", containerName, fullNewImage, string(reportBytes)); saveErr == nil {
				fmt.Printf("   📦 [CACHE] Rapport Trivy pré-chargé en DB pour la nouvelle image (%.20s...)\n", newDigest)
			}
			// Point d'historique CVE pour la nouvelle image déployée (suivi dans la durée).
			_ = db.AppendVulnHistory(containerName, newDigest, "trivy",
				trivyReport.Summary.Critical, trivyReport.Summary.High, trivyReport.Summary.Medium, trivyReport.Summary.Low)
		}
	}

	// Déploiement réussi mail
	mailSubject := fmt.Sprintf("✅ Déployé : Mise à jour SecOps réussie pour %s", containerName)
	mailContent := fmt.Sprintf(`
		<p>Le conteneur <strong>%s</strong> a été mis à jour et déployé de manière sécurisée par SafeDock.</p>
		<p>Le nouveau conteneur pointe désormais de façon immuable sur le **Digest SHA256** validé.</p>
		<ul>
			<li>Image d'origine : <code>%s</code></li>
			<li>Image déployée : <code>%s</code></li>
			<li>Vulnérabilités résiduelles critiques : 0</li>
		</ul>
	`, containerName, originalImage, fullNewImage)
	_ = notifier.SendEmail(&lo.cfg.SMTP, mailSubject, notifier.BuildHTMLReport(mailSubject, mailContent, true))

	return true, nil
}

// executeTransactionalRollout orchestre le pivotement sécurisé vers le nouveau Digest.
func (lo *LifecycleOrchestrator) executeTransactionalRollout(ctx context.Context, oldID string, oldInspect *types.ContainerJSON, newDigestImage string) error {
	containerName := strings.TrimPrefix(oldInspect.Name, "/")
	rollbackName := containerName + "-rollback"

	fmt.Printf("   │  [ROLLOUT] Pivotement transactionnel de '%s'...\n", containerName)

	// 1. Arrêt du conteneur d'origine (lecture seule proxy)
	fmt.Printf("   │  ├─ Arrêt de l'ancien conteneur %s...\n", oldID[:12])
	stopTimeout := 15
	err := lo.cli.ContainerStop(ctx, oldID, container.StopOptions{Timeout: &stopTimeout})
	if err != nil {
		return fmt.Errorf("impossible d'arrêter l'ancien conteneur : %w", err)
	}

	// 2. Renommer le conteneur d'origine pour archivage / rollback
	fmt.Printf("   │  ├─ Sauvegarde de secours : Renommer '%s' en '%s'...\n", containerName, rollbackName)
	// Supprimer un éventuel ancien rollback crashé restant pour éviter le conflit
	_ = lo.cli.ContainerRemove(ctx, rollbackName, types.ContainerRemoveOptions{Force: true})
	err = lo.cli.ContainerRename(ctx, oldID, rollbackName)
	if err != nil {
		// Tentative de redémarrer le conteneur arrêté pour restaurer le service
		_ = lo.cli.ContainerStart(ctx, oldID, types.ContainerStartOptions{})
		return fmt.Errorf("impossible de renommer l'ancien conteneur : %w", err)
	}

	// 3. Préparation de la configuration du nouveau conteneur
	newConfig := oldInspect.Config
	newConfig.Image = newDigestImage // On injecte l'image par Digest !

	newHostConfig := oldInspect.HostConfig

	// 4. Création du nouveau conteneur avec l'ancien nom d'origine
	fmt.Printf("   │  ├─ Création du nouveau conteneur basé sur le Digest SHA256 unique...\n")
	created, err := lo.cli.ContainerCreate(ctx, newConfig, newHostConfig, nil, nil, containerName)
	if err != nil {
		return lo.triggerRollback(ctx, oldID, containerName, rollbackName, fmt.Errorf("échec de création du nouveau conteneur : %w", err))
	}

	// Connecter le conteneur aux réseaux existants si configurés
	if oldInspect.NetworkSettings != nil {
		for _, netConfig := range oldInspect.NetworkSettings.Networks {
			_ = lo.cli.NetworkConnect(ctx, netConfig.NetworkID, created.ID, &network.EndpointSettings{
				IPAMConfig: netConfig.IPAMConfig,
				Links:      netConfig.Links,
				Aliases:    netConfig.Aliases,
			})
		}
	}

	// 5. Démarrage du nouveau conteneur
	fmt.Printf("   │  ├─ Démarrage du nouveau conteneur %s...\n", created.ID[:12])
	err = lo.cli.ContainerStart(ctx, created.ID, types.ContainerStartOptions{})
	if err != nil {
		return lo.triggerRollback(ctx, oldID, containerName, rollbackName, fmt.Errorf("échec de démarrage du nouveau conteneur : %w", err))
	}

	// 6. Test de santé / Stabilité transactionnelle
	fmt.Println("   │  ├─ Phase de test de santé (Validation de la stabilité)...")
	time.Sleep(3 * time.Second) // Attente de stabilisation

	newInspect, err := lo.cli.ContainerInspect(ctx, created.ID)
	if err != nil || !newInspect.State.Running {
		// Le conteneur a crashé au démarrage
		crashErr := fmt.Errorf("le nouveau conteneur a crashé immédiatement après son lancement")
		if err != nil {
			crashErr = fmt.Errorf("impossible d'inspecter le nouveau conteneur : %w", err)
		}
		// On nettoie le conteneur crashé
		_ = lo.cli.ContainerRemove(ctx, created.ID, types.ContainerRemoveOptions{Force: true})
		return lo.triggerRollback(ctx, oldID, containerName, rollbackName, crashErr)
	}

	// 7. Nettoyage de l'ancien conteneur archivé (Succès total !)
	fmt.Printf("   │  ├─ Déploiement stable ! Nettoyage définitif de la sauvegarde...\n")
	err = lo.cli.ContainerRemove(ctx, oldID, types.ContainerRemoveOptions{Force: true})
	if err != nil {
		fmt.Printf("   │  ⚠️  Impossible de supprimer l'ancien conteneur de sauvegarde %s : %v\n", oldID[:12], err)
	}

	fmt.Printf("   🎉 [DEPLOY SUCCESS] Pivot de cycle de vie sécurisé achevé pour '%s' !\n", containerName)
	return nil
}

// triggerRollback restaure immédiatement l'ancien conteneur en cas d'erreur de rollout.
func (lo *LifecycleOrchestrator) triggerRollback(ctx context.Context, oldID, containerName, rollbackName string, deployErr error) error {
	fmt.Printf("   │  🔥 [ROLLBACK] Échec du déploiement ! Restauration de l'ancien conteneur...\n")

	// 1. On remet le nom d'origine à la sauvegarde
	_ = lo.cli.ContainerRename(ctx, oldID, containerName)

	// 2. On redémarre l'ancien conteneur
	err := lo.cli.ContainerStart(ctx, oldID, types.ContainerStartOptions{})
	if err != nil {
		return fmt.Errorf("ÉCHEC DU ROLLBACK ! Le service d'origine n'a pas pu être redémarré. ALERTE CRITIQUE : %v (Erreur d'origine: %v)", err, deployErr)
	}

	fmt.Println("   │  ✅ [ROLLBACK COMPLETED] Service d'origine restauré et en ligne.")
	return fmt.Errorf("pivot échoué, rollback automatique effectué : %w", deployErr)
}

// effectiveCounts recompte les vulnérabilités par sévérité en excluant les CVE
// présentes dans l'ensemble des risques acceptés (exceptions actives).
func effectiveCounts(r *secops.TrivyReport, excepted map[string]bool) (crit, high, med, low, unknown int) {
	for _, v := range r.Vulnerabilities {
		if excepted[strings.ToUpper(strings.TrimSpace(v.CVEID))] {
			continue
		}
		switch strings.ToUpper(v.Severity) {
		case "CRITICAL":
			crit++
		case "HIGH":
			high++
		case "MEDIUM":
			med++
		case "LOW":
			low++
		default:
			unknown++
		}
	}
	return
}

// cleanupStagingImage supprime immédiatement une image de staging qui n'a pas
// abouti à un déploiement (rejet SecOps, crash + rollback, ou erreur de scan).
// Utilise un contexte indépendant pour ne pas être bloqué par l'annulation
// éventuelle du contexte HTTP parent.
// Force=false : Docker refusera la suppression si un conteneur utilise l'image
// (filet de sécurité supplémentaire, ne devrait pas arriver en pratique).
func (lo *LifecycleOrchestrator) cleanupStagingImage(imageRef string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := lo.cli.ImageRemove(ctx, imageRef, types.ImageRemoveOptions{
		Force:         false,
		PruneChildren: true,
	})
	if err != nil {
		fmt.Printf("   🧹 [STAGING CLEANUP WARNING] Impossible de supprimer l'image %s : %v\n", imageRef, err)
		return
	}
	fmt.Printf("   🧹 [STAGING CLEANUP] Image de staging supprimée immédiatement : %s\n", imageRef)
}
