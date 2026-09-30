package api

import (
	"compress/gzip"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/noeosorio/porter-galaxy/backend/internal/auth"
)

// Handler holds the HTTP routes for the porter-galaxy API.
type Handler struct {
	auth   *auth.Auth
	hub    *Hub
	ready  func() bool
	logger *slog.Logger
}

// NewHandler wires the routes. ready gates /readyz and must return true only
// once every cluster's informer cache has synced.
// A nil auth leaves the API open.
func NewHandler(auth *auth.Auth, hub *Hub, ready func() bool, logger *slog.Logger) *Handler {
	return &Handler{auth: auth, hub: hub, ready: ready, logger: logger}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.handleHealthz)
	mux.HandleFunc("GET /readyz", h.handleReadyz)
	stream := http.Handler(http.HandlerFunc(h.handleGraphSSE))
	if h.auth != nil {
		mux.HandleFunc("POST /api/auth/login", h.auth.HandleLogin)
		mux.HandleFunc("POST /api/auth/logout", h.auth.HandleLogout)
		mux.HandleFunc("GET /api/auth/session", h.auth.HandleSession)
		stream = h.auth.Middleware(stream)
	} else {
		mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"username":""}`)
		})
	}
	mux.Handle("GET /api/v1/clusters", stream)
}

func (h *Handler) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "ok")
}

func (h *Handler) handleReadyz(w http.ResponseWriter, _ *http.Request) {
	if !h.ready() {
		http.Error(w, "informer caches not synced", http.StatusServiceUnavailable)
		return
	}
	fmt.Fprint(w, "ok")
}

// handleGraphSSE streams the clusters per contracts/stream.md: a snapshot, then
// patches. The stream is gzipped when the client accepts it; the gzip writer is
// flushed after every event, otherwise events would sit in the compressor.
func (h *Handler) handleGraphSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Vary", "Accept-Encoding")
	// Tell nginx (and similar proxies) not to buffer the stream.
	w.Header().Set("X-Accel-Buffering", "no")

	var out io.Writer = w
	flush := func() error {
		flusher.Flush()
		return nil
	}
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		gz := gzip.NewWriter(w)
		// The stream only ends when the client is gone, so the gzip trailer
		// has no reader and a Close error has no one to report to.
		defer func() { _ = gz.Close() }()
		out = gz
		flush = func() error {
			if err := gz.Flush(); err != nil {
				return err
			}
			flusher.Flush()
			return nil
		}
	}

	c := h.hub.subscribe()
	defer h.hub.unsubscribe(c)

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-c.ch:
			if _, err := out.Write(msg); err != nil {
				return
			}
			if err := flush(); err != nil {
				return
			}
		}
	}
}
