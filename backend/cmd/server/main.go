package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/noeosorio/porter-galaxy/backend/internal/api"
	"github.com/noeosorio/porter-galaxy/backend/internal/auth"
	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
	"github.com/noeosorio/porter-galaxy/backend/internal/informers"
	"github.com/noeosorio/porter-galaxy/backend/internal/metrics"
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

	// ── One informer manager per kubeconfig context, or the in-cluster config ─
	builders, managers, err := loadFromKubeconfig(notify, logger)
	if err != nil {
		logger.Error("failed to load clusters", "error", err)
		os.Exit(1)
	}

	// ── Core components ───────────────────────────────────────────────────────
	multiBuilder := cluster.NewMultiBuilder(builders...)

	hub := api.NewHub(multiBuilder, logger)
	ready := func() bool {
		for _, mgr := range managers {
			if !mgr.Synced() {
				return false
			}
		}
		return true
	}
	var authn *auth.Auth
	if os.Getenv("AUTH_ENABLED") == "true" {
		authn, err = auth.FromDir(envOr("AUTH_DIR", "/etc/galaxy/auth"))
		if err != nil {
			logger.Error("sign-in is enabled but its credentials are unreadable", "error", err)
			os.Exit(1)
		}
	} else {
		logger.Warn("sign-in is disabled: anyone who can reach the API can see the cluster")
	}
	handler := api.NewHandler(authn, hub, ready, logger)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// ── Graceful-shutdown context ──────────────────────────────────────────────
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// ── Start hub ─────────────────────────────────────────────────────────────
	go hub.Run(ctx, notifyCh, 500*time.Millisecond)
	// recentRestart and warnings expire with time, not with a watch event.
	go func() {
		for range time.Tick(30 * time.Second) {
			notify()
		}
	}()

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

// loadFromKubeconfig watches one cluster per context in $KUBECONFIG (local
// development); inside a pod with no kubeconfig it uses the in-cluster config.
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

// fromRestConfig creates the store, manager, and builder for a single cluster.
func fromRestConfig(clusterID string, cfg *rest.Config, notify func(), logger *slog.Logger) ([]*cluster.Builder, []*informers.Manager, error) {
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, nil, err
	}

	mgr := informers.NewManager(client, 30*time.Second, notify, logger)
	poller := metrics.NewPoller(client, notify, logger.With("cluster", clusterID))
	mgr.Go(poller.Run)
	b := cluster.NewBuilder(mgr.Listers(), clusterID, poller)

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
