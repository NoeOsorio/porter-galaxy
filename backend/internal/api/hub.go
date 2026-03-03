package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

// Hub manages SSE client subscriptions and fans out graph snapshots.
// It is driven by a notify channel that the store signals on every mutation;
// a debouncer coalesces rapid bursts before a snapshot is built and broadcast.
type Hub struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
	logger  *slog.Logger
}

func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients: make(map[chan []byte]struct{}),
		logger:  logger,
	}
}

// Subscribe registers a new SSE client and returns its dedicated channel.
// The channel is buffered so a slow client cannot block the broadcaster.
func (h *Hub) Subscribe() chan []byte {
	ch := make(chan []byte, 8)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a client channel from the hub.
func (h *Hub) Unsubscribe(ch chan []byte) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

// broadcast sends a raw SSE frame to every connected client.
// Non-blocking: slow clients are silently skipped (they will catch up on the
// next broadcast rather than back-pressuring the hub goroutine).
func (h *Hub) broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients {
		select {
		case ch <- msg:
		default:
			h.logger.Debug("hub: dropped frame for slow client")
		}
	}
}

// Run is the hub's main loop. It must be started in its own goroutine.
//
//   - notify: a channel that is signalled on every store mutation.
//   - builder: used to assemble a fresh snapshot after each debounce window.
//   - debounceWindow: how long to wait for further signals before broadcasting.
//
// A 30-second heartbeat comment is sent to keep idle connections alive through
// proxies and load balancers that close idle HTTP streams.
func (h *Hub) Run(ctx context.Context, notify <-chan struct{}, builder cluster.SnapshotBuilder, debounceWindow time.Duration) {
	debounced := debounce(ctx, notify, debounceWindow)
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-debounced:
			h.broadcastSnapshot(builder)

		case <-heartbeat.C:
			h.broadcast([]byte(": ping\n\n"))
		}
	}
}

func (h *Hub) broadcastSnapshot(builder cluster.SnapshotBuilder) {
	snapshot := builder.Build()
	data, err := json.Marshal(snapshot)
	if err != nil {
		h.logger.Error("hub: failed to marshal snapshot", "error", err)
		return
	}
	frame := []byte(fmt.Sprintf("data: %s\n\n", data))
	h.broadcast(frame)
	h.logger.Debug("hub: broadcast snapshot", "clients", h.clientCount())
}

func (h *Hub) clientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ── Debouncer ─────────────────────────────────────────────────────────────────

// debounce wraps an input channel so that rapid bursts produce a single output
// signal after the window elapses with no further input.
func debounce(ctx context.Context, in <-chan struct{}, window time.Duration) <-chan struct{} {
	out := make(chan struct{}, 1)
	go func() {
		defer close(out)
		for {
			// Block until the first signal arrives.
			select {
			case <-ctx.Done():
				return
			case _, ok := <-in:
				if !ok {
					return
				}
			}

			// Drain any further signals that arrive within the window.
			timer := time.NewTimer(window)
		drain:
			for {
				select {
				case _, ok := <-in:
					if !ok {
						timer.Stop()
						return
					}
					// Reset window on each new signal.
					if !timer.Stop() {
						select {
						case <-timer.C:
						default:
						}
					}
					timer.Reset(window)
				case <-timer.C:
					break drain
				case <-ctx.Done():
					timer.Stop()
					return
				}
			}

			// Emit one signal.
			select {
			case out <- struct{}{}:
			default:
			}
		}
	}()
	return out
}
