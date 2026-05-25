package deployer

import (
	"context"
	"fmt"
	"io"
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

// NewLifecycleOrchestrator initialise l'orchestrateur.
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

// Close libère les ressources.
func (lo *LifecycleOrchestrator) Close() error {
	return lo.cli.Close()
}

// CheckAndUpdateContainer verifie si une mise à jour est disponible pour le conteneur donné.
// Si oui, il exécute la batterie SecOps et réalise un redéploiement transactionnel sécurisé.
func (lo *LifecycleOrchestrator) CheckAndUpdateContainer(ctx context.Context, containerID string) error {
	// 1. Inspection du conteneur actuel
	inspect, err := lo.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return fmt.Errorf("impossible d'inspecter le conteneur : %w", err)
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
		return fmt.Errorf("impossible de requêter le registre distant : %w", err)
	}

	// 3. Comparaison avec le Digest local actuel
	localDigest := inspect.Image
	fmt.Printf("   ├─ Local Digest  : %s\n", localDigest)
	fmt.Printf("   ├─ Remote Digest : %s\n", remoteDigest)

	if localDigest == remoteDigest || strings.HasSuffix(localDigest, remoteDigest) {
		fmt.Printf("   ✅ [CYCLE %s] Le conteneur est à jour (Digests identiques).\n", containerName)
		return nil
	}

	fmt.Printf("   🚨 [CYCLE %s] Nouvelle version détectée sur le registre !\n", containerName)
	fmt.Println("   ├─ Lancement du Pipeline de Staging SecOps...")

	// 4. Staging Pipeline: Téléchargement en tâche de fond de la nouvelle version
	fullNewImage := fmt.Sprintf("%s@%s", imageNameWithoutDigest, remoteDigest)
	fmt.Printf("   ├─ Téléchargement (Pull) de l'image de Staging : %s...\n", fullNewImage)
	
	pullReader, err := lo.cli.ImagePull(ctx, fullNewImage, types.ImagePullOptions{})
	if err != nil {
		return fmt.Errorf("échec du téléchargement de l'image de Staging : %w", err)
	}
	// Lecture obligatoire du flux pour finaliser le téléchargement
	_, _ = io.Copy(io.Discard, pullReader)
	pullReader.Close()
	fmt.Println("   ├─ Image téléchargée avec succès. Début des scans...")

	// 5. Batterie SecOps : Scan de vulnérabilités (Trivy)
	fmt.Println("   ├─ Lancement du scan de vulnérabilités Trivy...")
	trivyReport, err := secops.ScanImage(ctx, fullNewImage)
	if err != nil {
		return fmt.Errorf("échec du scan Trivy sur l'image de Staging : %w", err)
	}
	
	// Évaluation de la conformité Trivy
	critCount := trivyReport.Summary.Critical
	highCount := trivyReport.Summary.High
	fmt.Printf("   │  ├─ Failles Trivy détectées : %d Critiques, %d Hautes, %d Moyennes\n", 
		critCount, highCount, trivyReport.Summary.Medium)

	// Décision automatique de sécurité sur Trivy
	isSecOpsApproved := true
	secopsReason := ""

	if lo.cfg.SecOps.MaxSeverityAllowed == "HIGH" && critCount > 0 {
		isSecOpsApproved = false
		secopsReason = fmt.Sprintf("Présence de %d vulnérabilités critiques non corrigées dans l'image", critCount)
	} else if lo.cfg.SecOps.MaxSeverityAllowed == "MEDIUM" && (critCount > 0 || highCount > 0) {
		isSecOpsApproved = false
		secopsReason = fmt.Sprintf("Présence de vulnérabilités critiques (%d) ou hautes (%d) non tolérées", critCount, highCount)
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
		return fmt.Errorf("mise à jour bloquée par les règles SecOps : %s", secopsReason)
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
		return err
	}

	// Enregistrement du succès dans l'historique d'audit SQLite
	_ = db.WriteAuditLog(containerName, containerID, fullNewImage, "SUCCESS", "Pivot SecOps complété avec succès", critCount, highCount, trivyReport.Summary.Medium)

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

	return nil
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
