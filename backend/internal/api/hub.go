package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

// Hub builds snapshots on change and fans them out to SSE clients: each client
// gets one snapshot, then patches against the version it holds.
type Hub struct {
	builder cluster.SnapshotBuilder
	logger  *slog.Logger

	mu      sync.Mutex
	clients map[*client]struct{}
	state   *indexed
	version uint64
	frame   []byte // snapshot event for state
}

type client struct {
	ch chan []byte
	// stale is set when a frame was dropped; the client's next frame must be a
	// full snapshot because later patches would not apply to what it holds.
	stale bool
}

func NewHub(builder cluster.SnapshotBuilder, logger *slog.Logger) *Hub {
	return &Hub{builder: builder, logger: logger, clients: make(map[*client]struct{})}
}

// subscribe registers a client whose channel already holds the current
// snapshot. Both happen under one lock so the next patch applies to it.
func (h *Hub) subscribe() *client {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.state == nil {
		h.publish(h.builder.Build())
	}
	c := &client{ch: make(chan []byte, 8)}
	if h.frame != nil {
		c.ch <- h.frame
	}
	h.clients[c] = struct{}{}
	return c
}

func (h *Hub) unsubscribe(c *client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// Run rebuilds and broadcasts after changes signalled on notify, at most once
// per minInterval, and sends a heartbeat every 30 s so proxies keep idle
// streams open.
func (h *Hub) Run(ctx context.Context, notify <-chan struct{}, minInterval time.Duration) {
	debounced := throttle(ctx, notify, minInterval)
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-debounced:
			snapshot := h.builder.Build()
			h.mu.Lock()
			h.publish(snapshot)
			h.mu.Unlock()
		case <-heartbeat.C:
			h.mu.Lock()
			for c := range h.clients {
				select {
				case c.ch <- []byte(": ping\n\n"):
				default:
				}
			}
			h.mu.Unlock()
		}
	}
}

// publish must be called with h.mu held.
func (h *Hub) publish(snapshot cluster.Snapshot) {
	next, err := index(snapshot)
	if err != nil {
		h.logger.Error("hub: failed to index snapshot", "error", err)
		return
	}
	var patchFrame []byte
	if h.state != nil {
		p := diff(h.state, next)
		if p.empty() {
			return
		}
		p.Base, p.Version = h.version, h.version+1
		data, err := json.Marshal(p)
		if err != nil {
			h.logger.Error("hub: failed to marshal patch", "error", err)
			return
		}
		patchFrame = sseFrame("patch", data)
	}
	h.version++
	h.state = next
	h.frame = sseFrame("snapshot", next.snapshotJSON(h.version))

	for c := range h.clients {
		frame := patchFrame
		if c.stale || frame == nil {
			frame = h.frame
		}
		select {
		case c.ch <- frame:
			c.stale = false
		default:
			c.stale = true
			h.logger.Debug("hub: dropped frame for slow client")
		}
	}
}

// ── Throttle ──────────────────────────────────────────────────────────────────

// throttle ensures a steady, rate-limited stream of signals:
//   - The first signal is forwarded immediately (leading edge).
//   - Any signals that arrive during the cooldown interval are coalesced into
//     one trailing emit once the interval elapses.
//   - The cycle then repeats, so a continuous stream of changes produces a
//     continuous stream of outputs at most once per interval — never silent,
//     never bursty.
func throttle(ctx context.Context, in <-chan struct{}, interval time.Duration) <-chan struct{} {
	out := make(chan struct{}, 1)

	emit := func() {
		select {
		case out <- struct{}{}:
		default:
		}
	}

	go func() {
		defer close(out)
		for {
			// Wait for the first signal.
			select {
			case <-ctx.Done():
				return
			case _, ok := <-in:
				if !ok {
					return
				}
			}

			// Emit immediately on the leading edge.
			emit()

			// Drain signals that arrive during the cooldown interval.
			timer := time.NewTimer(interval)
			pending := false
		cooldown:
			for {
				select {
				case <-ctx.Done():
					timer.Stop()
					return
				case _, ok := <-in:
					if !ok {
						timer.Stop()
						return
					}
					pending = true
				case <-timer.C:
					break cooldown
				}
			}

			// If changes arrived during the cooldown, emit one trailing signal
			// so they are never silently dropped.
			if pending {
				emit()
			}
		}
	}()
	return out
}
