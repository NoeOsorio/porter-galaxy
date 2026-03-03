package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

// Handler holds the HTTP routes for the porter-galaxy API.
type Handler struct {
	builder cluster.SnapshotBuilder
	hub     *Hub
	logger  *slog.Logger
}

func NewHandler(builder cluster.SnapshotBuilder, hub *Hub, logger *slog.Logger) *Handler {
	return &Handler{builder: builder, hub: hub, logger: logger}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.handleHealthz)
	mux.HandleFunc("GET /api/v1/clusters", h.handleGraphSSE)
}

func (h *Handler) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "ok")
}

// handleGraphSSE streams the cluster graph to the client as Server-Sent Events.
//
// On connect the current snapshot is sent immediately so the client never
// stares at a blank screen. Subsequent updates arrive within ~50 ms of the
// underlying Kubernetes change.
func (h *Handler) handleGraphSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	// Tell nginx (and similar proxies) not to buffer the stream.
	w.Header().Set("X-Accel-Buffering", "no")

	// Send the current state right away — don't make the client wait.
	h.sendSnapshot(w, flusher)

	// Subscribe to hub updates and relay them until the client disconnects.
	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := w.Write(msg); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *Handler) sendSnapshot(w http.ResponseWriter, flusher http.Flusher) {
	snapshot := h.builder.Build()
	data, err := json.Marshal(snapshot)
	if err != nil {
		h.logger.Error("handler: failed to marshal initial snapshot", "error", err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", data)
	flusher.Flush()
}
