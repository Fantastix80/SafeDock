package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// RegistryClient gère l'interaction avec les API de Registres Docker V2.
type RegistryClient struct {
	client *http.Client
}

// NewRegistryClient initialise le client HTTP.
func NewRegistryClient() *RegistryClient {
	return &RegistryClient{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// ImageInfo modélise les parties résolues d'un nom d'image Docker.
type ImageInfo struct {
	Registry string // ex: registry-1.docker.io, ghcr.io
	Name     string // ex: library/nginx, fantastix80/safedock
	Tag      string // ex: latest, 1.19
}

// ResolveImageName découpe le nom complet de l'image pour identifier le registre et le repository.
func ResolveImageName(fullImageName string) ImageInfo {
	registry := "registry-1.docker.io" // par défaut Docker Hub
	name := fullImageName
	tag := "latest"

	// 1. Découpage du Tag
	if strings.Contains(name, ":") {
		parts := strings.SplitN(name, ":", 2)
		name = parts[0]
		tag = parts[1]
	}

	// 2. Identification du Registre
	parts := strings.Split(name, "/")
	if len(parts) > 1 && (strings.Contains(parts[0], ".") || strings.Contains(parts[0], ":") || parts[0] == "localhost") {
		registry = parts[0]
		name = strings.Join(parts[1:], "/")
	} else {
		// Pour Docker Hub, si pas d'organisation spécifiée, c'est l'organisation officielle "library"
		if len(parts) == 1 {
			name = "library/" + name
		} else if len(parts) == 2 && !strings.Contains(parts[0], ".") {
			// ex: fantastix80/safedock -> reste fantastix80/safedock
		}
	}

	return ImageInfo{
		Registry: registry,
		Name:     name,
		Tag:      tag,
	}
}

// FetchRemoteDigest interroge le registre distant pour récupérer le Digest SHA256 associé au Tag.
func (rc *RegistryClient) FetchRemoteDigest(ctx context.Context, fullImageName string) (string, error) {
	img := ResolveImageName(fullImageName)

	// URL de l'API Registry V2 pour le manifeste
	scheme := "https"
	if img.Registry == "localhost" || strings.HasPrefix(img.Registry, "127.0.0.1") {
		scheme = "http"
	}
	
	manifestURL := fmt.Sprintf("%s://%s/v2/%s/manifests/%s", scheme, img.Registry, img.Name, img.Tag)

	req, err := http.NewRequestWithContext(ctx, "HEAD", manifestURL, nil)
	if err != nil {
		return "", fmt.Errorf("erreur création requête HEAD : %w", err)
	}

	// Les en-têtes Accept obligatoires pour forcer le retour de manifestes V2 ou OCI
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json")

	resp, err := rc.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("erreur requête HEAD vers registre : %w", err)
	}
	defer resp.Body.Close()

	// 3. Gestion de l'Authentification si retour 401
	if resp.StatusCode == http.StatusUnauthorized {
		token, err := rc.getBearerToken(ctx, resp.Header.Get("Www-Authenticate"))
		if err != nil {
			return "", fmt.Errorf("authentification échouée au registre : %w", err)
		}

		// On ré-émet la requête avec le Bearer Token
		req, err = http.NewRequestWithContext(ctx, "HEAD", manifestURL, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json")
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err = rc.client.Do(req)
		if err != nil {
			return "", fmt.Errorf("erreur requête HEAD authentifiée : %w", err)
		}
		defer resp.Body.Close()
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registre a retourné un statut HTTP invalide : %d", resp.StatusCode)
	}

	// 4. Extraction de l'en-tête Docker-Content-Digest
	digest := resp.Header.Get("Docker-Content-Digest")
	if digest == "" {
		// Certains registres retournent le digest dans ETag si Docker-Content-Digest est absent
		etag := resp.Header.Get("ETag")
		if strings.HasPrefix(etag, `"sha256:`) && strings.HasSuffix(etag, `"`) {
			digest = strings.Trim(etag, `"`)
		} else {
			return "", fmt.Errorf("impossible de localiser le Digest SHA256 dans les en-têtes du registre")
		}
	}

	return digest, nil
}

// Struct interne pour décoder la réponse JSON de récupération de Token
type tokenResponse struct {
	Token string `json:"token"`
}

// getBearerToken effectue la requête d'authentification Bearer auprès du realm retourné par le 401.
func (rc *RegistryClient) getBearerToken(ctx context.Context, wwwAuthenticateHeader string) (string, error) {
	if wwwAuthenticateHeader == "" {
		return "", fmt.Errorf("en-tête Www-Authenticate manquant")
	}

	// Exemple attendu : Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"
	if !strings.HasPrefix(wwwAuthenticateHeader, "Bearer ") {
		return "", fmt.Errorf("schéma d'authentification non supporté : %s", wwwAuthenticateHeader)
	}

	paramsStr := wwwAuthenticateHeader[7:]
	params := make(map[string]string)
	
	// Parsing des paires de clés/valeurs (ex: realm="https://...")
	for _, p := range strings.Split(paramsStr, ",") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) == 2 {
			k := strings.TrimSpace(kv[0])
			v := strings.Trim(strings.TrimSpace(kv[1]), `"`)
			params[k] = v
		}
	}

	realm := params["realm"]
	service := params["service"]
	scope := params["scope"]

	if realm == "" {
		return "", fmt.Errorf("champ realm manquant dans Www-Authenticate")
	}

	// Construction de la requête de récupération du token
	authURL, err := url.Parse(realm)
	if err != nil {
		return "", fmt.Errorf("realm URL invalide : %w", err)
	}

	query := authURL.Query()
	if service != "" {
		query.Set("service", service)
	}
	if scope != "" {
		query.Set("scope", scope)
	}
	authURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", authURL.String(), nil)
	if err != nil {
		return "", err
	}

	resp, err := rc.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("erreur lors de la requête de récupération de token : %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("échec de récupération de token, statut HTTP : %d", resp.StatusCode)
	}

	// Parsing du JSON de réponse
	var tok tokenResponse
	err = decodeJSON(resp.Body, &tok)
	if err != nil {
		return "", fmt.Errorf("impossible de décoder le token JSON : %w", err)
	}

	if tok.Token == "" {
		return "", fmt.Errorf("token vide retourné par le realm d'authentification")
	}

	return tok.Token, nil
}

// Fonction de décodage JSON générique légère pour éviter les dépendances lourdes
func decodeJSON(r io.Reader, val *tokenResponse) error {
	body, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, val)
}
