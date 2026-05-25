package docker

import (
	"context"
	"fmt"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/safedock/safedock/internal/secops"
)

// ContainerAuditInfo contient les métadonnées de sécurité extraites d'un conteneur.
type ContainerAuditInfo struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	ImageName       string            `json:"image_name"`
	ImageTag        string            `json:"image_tag"`
	CurrentDigest   string            `json:"current_digest"`
	User            string            `json:"user"`
	IsRoot          bool              `json:"is_root"`
	IsPrivileged    bool              `json:"is_privileged"`
	SensitiveMounts []string          `json:"sensitive_mounts"`
	AllMounts       []string          `json:"all_mounts"`
	TagPinned       bool              `json:"tag_pinned"`
	SecretLeaks     []secops.SecretLeak `json:"secret_leaks"`
}

// DockerAuditor gère l'interaction avec l'API Docker Engine.
type DockerAuditor struct {
	cli *client.Client
}

// NewDockerAuditor initialise le client Docker.
// Il utilise automatiquement les options d'environnement (socket local ou variable DOCKER_HOST).
func NewDockerAuditor() (*DockerAuditor, error) {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("impossible de se connecter au démon Docker : %w", err)
	}
	return &DockerAuditor{cli: cli}, nil
}

// Close libère les ressources du client.
func (da *DockerAuditor) Close() error {
	return da.cli.Close()
}

// AuditContainers liste et inspecte tous les conteneurs pour en extraire un rapport de sécurité.
func (da *DockerAuditor) AuditContainers(ctx context.Context) ([]ContainerAuditInfo, error) {
	containers, err := da.cli.ContainerList(ctx, types.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("erreur lors du listing des conteneurs : %w", err)
	}

	var audited []ContainerAuditInfo

	for _, c := range containers {
		info, err := da.AuditSingleContainer(ctx, c.ID)
		if err != nil {
			// On loggue l'erreur mais on continue l'audit pour les autres conteneurs
			fmt.Printf("[AUDIT WARNING] Impossible d'analyser le conteneur %s : %v\n", c.ID[:12], err)
			continue
		}
		audited = append(audited, info)
	}

	return audited, nil
}

// AuditSingleContainer inspecte un conteneur spécifique et extrait son score SecOps.
func (da *DockerAuditor) AuditSingleContainer(ctx context.Context, containerID string) (ContainerAuditInfo, error) {
	inspect, err := da.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return ContainerAuditInfo{}, fmt.Errorf("erreur d'inspection : %w", err)
	}

	// 1. Extraction Image et Tag
	fullImageName := inspect.Config.Image
	imageName := fullImageName
	imageTag := "latest" // tag par défaut
	if strings.Contains(fullImageName, "@") {
		parts := strings.SplitN(fullImageName, "@", 2)
		imageName = parts[0]
		imageTag = "digest-pinned"
	} else if strings.Contains(fullImageName, ":") {
		parts := strings.SplitN(fullImageName, ":", 2)
		imageName = parts[0]
		imageTag = parts[1]
	}

	// 2. Détection de Tag Pinning (strictement par Digest SHA256 pour éviter l'empoisonnement de tag)
	tagPinned := strings.Contains(fullImageName, "@sha256:")

	// 3. Extraction du Digest SHA256 (Image ID ou RepoDigest)
	currentDigest := inspect.Image
	if len(inspect.Image) > 7 && strings.HasPrefix(inspect.Image, "sha256:") {
		currentDigest = inspect.Image
	}

	// 4. Analyse de l'utilisateur (détection Root)
	user := inspect.Config.User
	isRoot := false
	if user == "" || user == "root" || user == "0" || strings.HasPrefix(user, "0:") {
		isRoot = true
		if user == "" {
			user = "root (par défaut de l'image)"
		}
	}

	// 5. Privilèges élevés
	isPrivileged := inspect.HostConfig.Privileged

	// 6. Analyse des partages sensibles
	var sensitiveMounts []string
	var allMounts []string

	// Dossiers hôtes considérés comme hautement sensibles s'ils sont montés
	sensitivePaths := map[string]bool{
		"/var/run/docker.sock": true,
		"/":                    true,
		"/etc":                 true,
		"/root":                true,
		"/var":                 true,
		"/home":                true,
	}

	for _, m := range inspect.Mounts {
		mountStr := fmt.Sprintf("%s:%s (%t)", m.Source, m.Destination, m.RW)
		allMounts = append(allMounts, mountStr)

		// On normalise le chemin de source pour correspondre aux chemins sensibles
		cleanSource := strings.TrimSuffix(m.Source, "/")
		if sensitivePaths[cleanSource] || strings.Contains(m.Source, "docker.sock") {
			sensitiveMounts = append(sensitiveMounts, mountStr)
		}
	}

	// Nettoyage du nom pour enlever le slash initial standard de Docker
	containerName := inspect.Name
	if strings.HasPrefix(containerName, "/") {
		containerName = containerName[1:]
	}

	// 7. Analyse des secrets fuités dans les variables d'environnement
	leaks := secops.ScanEnvVariables(inspect.Config.Env)

	return ContainerAuditInfo{
		ID:              inspect.ID,
		Name:            containerName,
		ImageName:       imageName,
		ImageTag:        imageTag,
		CurrentDigest:   currentDigest,
		User:            user,
		IsRoot:          isRoot,
		IsPrivileged:    isPrivileged,
		SensitiveMounts: sensitiveMounts,
		AllMounts:       allMounts,
		TagPinned:       tagPinned,
		SecretLeaks:     leaks,
	}, nil
}
