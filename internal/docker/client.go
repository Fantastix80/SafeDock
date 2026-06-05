package docker

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/safedock/safedock/internal/secops"
	"golang.org/x/crypto/ssh"
)

// remoteSocketPath est le socket Docker visé sur l'hôte distant via SSH.
const remoteSocketPath = "/var/run/docker.sock"

// NewEngineClient construit un client Docker pour un endpoint :
//   - vide               → hôte local (FromEnv) ;
//   - "tcp://host:2376"  → distant en TLS mutuel (certPEM/keyPEM, caPEM optionnel) ;
//   - "ssh://user@host"  → distant via tunnel SSH (le socket reste local sur l'hôte,
//     aucun port Docker n'est exposé). keyPEM = clé privée SSH (PEM), caPEM = clé
//     publique de l'hôte (optionnelle, pour vérifier l'identité du serveur).
//
// Retourne aussi un io.Closer (connexion SSH sous-jacente) à fermer en plus du client,
// ou nil pour les transports local/TCP.
func NewEngineClient(endpoint, caPEM, certPEM, keyPEM string) (*client.Client, io.Closer, error) {
	if endpoint == "" {
		cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
		return cli, nil, err
	}
	if strings.HasPrefix(endpoint, "ssh://") {
		return buildSSHClient(endpoint, caPEM, keyPEM)
	}

	opts := []client.Opt{
		client.WithHost(endpoint),
		client.WithAPIVersionNegotiation(),
	}
	if certPEM != "" && keyPEM != "" {
		cert, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if err != nil {
			return nil, nil, fmt.Errorf("certificat/clé TLS client invalide : %w", err)
		}
		tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}
		if caPEM != "" {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM([]byte(caPEM)) {
				return nil, nil, fmt.Errorf("CA TLS illisible")
			}
			tlsConfig.RootCAs = pool
		}
		opts = append(opts, client.WithHTTPClient(&http.Client{
			Transport: &http.Transport{TLSClientConfig: tlsConfig},
		}))
	}
	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("connexion à l'hôte Docker distant impossible : %w", err)
	}
	return cli, nil, nil
}

// buildSSHClient ouvre une connexion SSH vers l'hôte et fournit au client Docker un
// dialer qui atteint le socket Docker local du distant à travers ce tunnel.
func buildSSHClient(endpoint, hostKey, privateKey string) (*client.Client, io.Closer, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, nil, fmt.Errorf("endpoint SSH invalide : %w", err)
	}
	user := "root"
	if u.User != nil && u.User.Username() != "" {
		user = u.User.Username()
	}
	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":22"
	}
	if strings.TrimSpace(privateKey) == "" {
		return nil, nil, fmt.Errorf("clé privée SSH requise pour un endpoint ssh://")
	}
	signer, err := ssh.ParsePrivateKey([]byte(privateKey))
	if err != nil {
		return nil, nil, fmt.Errorf("clé privée SSH invalide : %w", err)
	}

	// Vérification de la clé hôte : si une clé publique d'hôte est fournie, on l'épingle
	// (FixedHostKey). Sinon, on accepte à la première connexion — l'UI recommande de
	// fournir la clé hôte pour se prémunir d'une attaque de l'homme du milieu.
	hostCb := ssh.InsecureIgnoreHostKey()
	if strings.TrimSpace(hostKey) != "" {
		pub, _, _, _, perr := ssh.ParseAuthorizedKey([]byte(hostKey))
		if perr != nil {
			return nil, nil, fmt.Errorf("clé publique d'hôte SSH invalide : %w", perr)
		}
		hostCb = ssh.FixedHostKey(pub)
	}

	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: hostCb,
		Timeout:         10 * time.Second,
	}
	sshConn, err := ssh.Dial("tcp", host, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("connexion SSH à %s impossible : %w", host, err)
	}

	dial := func(_ context.Context, _, _ string) (net.Conn, error) {
		return sshConn.Dial("unix", remoteSocketPath)
	}
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+remoteSocketPath),
		client.WithDialContext(dial),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		_ = sshConn.Close()
		return nil, nil, fmt.Errorf("client Docker via SSH impossible : %w", err)
	}
	return cli, sshConn, nil
}

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
	HostID          int               `json:"host_id"`
	HostName        string            `json:"host_name"`
}

// DockerAuditor gère l'interaction avec l'API Docker Engine.
type DockerAuditor struct {
	cli    *client.Client
	closer io.Closer // connexion SSH sous-jacente (nil pour local/TCP)
}

// NewDockerAuditor initialise le client Docker local (socket / DOCKER_HOST).
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

// NewDockerAuditorFor initialise un client Docker pour un endpoint donné
// (local, "tcp://..." en TLS mutuel, ou "ssh://user@host" via tunnel SSH).
func NewDockerAuditorFor(endpoint, caPEM, certPEM, keyPEM string) (*DockerAuditor, error) {
	cli, closer, err := NewEngineClient(endpoint, caPEM, certPEM, keyPEM)
	if err != nil {
		return nil, err
	}
	return &DockerAuditor{cli: cli, closer: closer}, nil
}

// Close libère les ressources du client (y compris le tunnel SSH éventuel).
func (da *DockerAuditor) Close() error {
	err := da.cli.Close()
	if da.closer != nil {
		_ = da.closer.Close()
	}
	return err
}

// Ping vérifie la connectivité avec le démon Docker (sert au test de connexion d'un hôte).
func (da *DockerAuditor) Ping(ctx context.Context) error {
	_, err := da.cli.Ping(ctx)
	return err
}

// ImageExistsLocally indique si une image (par référence ou digest) est présente dans le démon.
func (da *DockerAuditor) ImageExistsLocally(ctx context.Context, ref string) bool {
	_, _, err := da.cli.ImageInspectWithRaw(ctx, ref)
	return err == nil
}

// RemoveImageIfUnused tente de supprimer une image. Force=false : le démon Docker
// refuse la suppression si un conteneur l'utilise (filet de sécurité). Sert à éviter
// l'accumulation disque des images tirées lors d'audits ad-hoc.
func (da *DockerAuditor) RemoveImageIfUnused(ctx context.Context, ref string) error {
	_, err := da.cli.ImageRemove(ctx, ref, types.ImageRemoveOptions{Force: false, PruneChildren: true})
	return err
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
	containerName := strings.TrimPrefix(inspect.Name, "/")

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
