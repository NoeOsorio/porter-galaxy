package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/noeosorio/porter-galaxy/backend/internal/api"
	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
	"github.com/noeosorio/porter-galaxy/backend/internal/informers"
	"github.com/noeosorio/porter-galaxy/backend/internal/registry"
	"github.com/noeosorio/porter-galaxy/backend/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel(),
	}))

	// ── Notify channel ────────────────────────────────────────────────────────
	// Shared across all cluster stores. Any mutation in any cluster signals the
	// hub to rebuild and broadcast a fresh multi-cluster snapshot.
	notifyCh := make(chan struct{}, 1)
	notify := func() {
		select {
		case notifyCh <- struct{}{}:
		default:
		}
	}

	// ── Bootstrap one store + informer manager per cluster ────────────────────
	builders, managers, err := loadClusters(context.Background(), notify, logger)
	if err != nil {
		logger.Error("failed to load clusters", "error", err)
		os.Exit(1)
	}

	// ── Core components ───────────────────────────────────────────────────────
	multiBuilder := cluster.NewMultiBuilder(builders...)

	hub := api.NewHub(logger)
	handler := api.NewHandler(multiBuilder, hub, logger)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// ── Graceful-shutdown context ──────────────────────────────────────────────
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// ── Start hub ─────────────────────────────────────────────────────────────
	go hub.Run(ctx, notifyCh, multiBuilder, 50*time.Millisecond)

	// ── Start one informer manager per cluster ────────────────────────────────
	for _, mgr := range managers {
		go func() {
			if err := mgr.Start(ctx); err != nil {
				logger.Error("informer manager stopped with error", "error", err)
				cancel()
			}
		}()
	}

	// ── Start HTTP server ─────────────────────────────────────────────────────
	port := envOr("PORT", "4000")
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0, // SSE streams are long-lived; disable write timeout
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("server listening", "port", port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
			cancel()
		}
	}()

	// ── Wait for shutdown ──────────────────────────────────────────────────────
	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown error", "error", err)
	}
}

// loadClusters selects the cluster source based on environment:
//   - REGISTRY_URL set → fetch clusters from the registry API
//   - fallback         → load contexts from the local kubeconfig (dev/local use)
func loadClusters(ctx context.Context, notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	if url := os.Getenv("REGISTRY_URL"); url != "" {
		projectID, err := requireIntEnv("REGISTRY_PROJECT_ID")
		if err != nil {
			return nil, nil, err
		}
		reg := registry.NewClient(url, os.Getenv("REGISTRY_TOKEN"), projectID)
		return loadFromRegistry(ctx, reg, notify, logger)
	}
	return loadFromKubeconfig(notify, logger)
}

// loadFromRegistry lists all clusters from the registry API, fetches a kubeconfig
// for each one, and spins up a store + informer manager + builder per cluster.
func loadFromRegistry(ctx context.Context, reg *registry.Client, notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	entries, err := reg.ListClusters(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("registry: %w", err)
	}
	if len(entries) == 0 {
		return nil, nil, fmt.Errorf("registry returned no clusters")
	}

	var builders []*cluster.Builder
	var managers []*informers.Manager

	for _, entry := range entries {
		kubeconfigYAML, err := reg.GetKubeconfig(ctx, entry.ID)
		if err != nil {
			logger.Warn("skipping cluster: failed to fetch kubeconfig", "cluster", entry.DisplayName(), "error", err)
			continue
		}

		raw, err := clientcmd.Load(kubeconfigYAML)
		if err != nil {
			logger.Warn("skipping cluster: invalid kubeconfig", "cluster", entry.DisplayName(), "error", err)
			continue
		}

		restCfg, err := restConfigFromKubeconfig(raw)
		if err != nil {
			logger.Warn("skipping cluster: failed to build REST config", "cluster", entry.DisplayName(), "error", err)
			continue
		}

		b, mgr, err := fromRestConfig(entry.DisplayName(), restCfg, notify, logger)
		if err != nil {
			logger.Warn("skipping cluster", "cluster", entry.DisplayName(), "error", err)
			continue
		}
		builders = append(builders, b...)
		managers = append(managers, mgr...)
	}

	if len(builders) == 0 {
		return nil, nil, fmt.Errorf("no clusters could be connected to")
	}
	return builders, managers, nil
}

// loadFromKubeconfig is the local dev fallback. It reads all contexts from the
// kubeconfig file and spins up one cluster per context.
func loadFromKubeconfig(notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	kubeconfigPath := envOr("KUBECONFIG", os.Getenv("HOME")+"/.kube/config")

	raw, err := clientcmd.LoadFromFile(kubeconfigPath)
	if err == nil && len(raw.Contexts) > 0 {
		return fromKubeconfigContexts(raw, notify, logger)
	}

	// Last resort: in-cluster service-account credentials.
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("no kubeconfig contexts found and in-cluster config unavailable: %w", err)
	}
	return fromRestConfig("in-cluster", cfg, notify, logger)
}

// fromKubeconfigContexts spins up one cluster per kubeconfig context.
func fromKubeconfigContexts(raw *clientcmdapi.Config, notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	var builders []*cluster.Builder
	var managers []*informers.Manager

	for contextName := range raw.Contexts {
		restCfg, err := clientcmd.NewNonInteractiveClientConfig(
			*raw, contextName, &clientcmd.ConfigOverrides{}, nil,
		).ClientConfig()
		if err != nil {
			logger.Warn("skipping context", "context", contextName, "error", err)
			continue
		}

		b, mgr, err := fromRestConfig(contextName, restCfg, notify, logger)
		if err != nil {
			logger.Warn("skipping context", "context", contextName, "error", err)
			continue
		}
		builders = append(builders, b...)
		managers = append(managers, mgr...)
	}

	if len(builders) == 0 {
		return nil, nil, fmt.Errorf("no usable contexts found in kubeconfig")
	}
	return builders, managers, nil
}

// restConfigFromKubeconfig builds a REST config from a parsed kubeconfig,
// using the current-context or the first available context.
func restConfigFromKubeconfig(raw *clientcmdapi.Config) (*rest.Config, error) {
	contextName := raw.CurrentContext
	if contextName == "" {
		for name := range raw.Contexts {
			contextName = name
			break
		}
	}
	return clientcmd.NewNonInteractiveClientConfig(
		*raw, contextName, &clientcmd.ConfigOverrides{}, nil,
	).ClientConfig()
}

// fromRestConfig creates the store, manager, and builder for a single cluster.
func fromRestConfig(clusterID string, cfg *rest.Config, notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, nil, err
	}

	s := store.New(notify)
	mgr := informers.NewManager(client, s, 30*time.Second, logger)
	b := cluster.NewBuilder(s, clusterID)

	logger.Info("registered cluster", "id", clusterID)
	return []*cluster.Builder{b}, []*informers.Manager{mgr}, nil
}

func logLevel() slog.Level {
	switch os.Getenv("LOG_LEVEL") {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireIntEnv(key string) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return 0, fmt.Errorf("required env var %s is not set", key)
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("env var %s must be an integer: %w", key, err)
	}
	return n, nil
}
