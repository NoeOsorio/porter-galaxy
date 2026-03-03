package registry

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client fetches cluster metadata and kubeconfigs from the Porter API.
type Client struct {
	baseURL   string
	token     string
	projectID int
	http      *http.Client
}

func NewClient(baseURL, token string, projectID int, skipTLSVerify bool) *Client {
	transport := http.DefaultTransport
	if skipTLSVerify {
		transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		}
	}
	return &Client{
		baseURL:   baseURL,
		token:     token,
		projectID: projectID,
		http:      &http.Client{Timeout: 15 * time.Second, Transport: transport},
	}
}

// ClusterEntry matches the objects inside the "clusters" array returned by
// GET /api/v2/projects/{projectID}/clusters.
type ClusterEntry struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	VanityName     string `json:"vanity_name"`
	CloudProvider  string `json:"cloud_provider"`
	Region         string `json:"region"`
	Status         string `json:"status"`
	CloudAccountID string `json:"cloud_account_id"`
}

// DisplayName returns the most human-readable identifier for the cluster.
func (e ClusterEntry) DisplayName() string {
	if e.VanityName != "" {
		return e.VanityName
	}
	return e.Name
}

// ListClusters calls GET /api/v2/projects/{projectID}/clusters.
func (c *Client) ListClusters(ctx context.Context) ([]ClusterEntry, error) {
	var resp struct {
		Clusters []ClusterEntry `json:"clusters"`
	}
	path := fmt.Sprintf("/api/v2/projects/%d/clusters", c.projectID)
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("list clusters: %w", err)
	}
	return resp.Clusters, nil
}

// GetKubeconfig calls GET /api/v2/projects/{projectID}/clusters/{clusterID}/kubeconfig
// and returns the raw kubeconfig YAML.
func (c *Client) GetKubeconfig(ctx context.Context, clusterID int) ([]byte, error) {
	var resp struct {
		Kubeconfig string `json:"kubeconfig"`
	}
	path := fmt.Sprintf("/api/v2/projects/%d/clusters/%d/kubeconfig", c.projectID, clusterID)
	if err := c.get(ctx, path, &resp); err != nil {
		return nil, fmt.Errorf("get kubeconfig for cluster %d: %w", clusterID, err)
	}
	return []byte(resp.Kubeconfig), nil
}

// get executes an authenticated GET and JSON-decodes the response body into out.
func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, body)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}
