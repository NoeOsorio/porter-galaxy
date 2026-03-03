package api

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log/slog"
	"sync"
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

// Hub manages SSE client subscriptions and fans out cluster snapshots.
// It throttles broadcasts and deduplicates snapshots so that only genuine
// state changes are sent — informer resyncs that produce identical data are
// silently suppressed.
type Hub struct {
	mu       sync.RWMutex
	clients  map[chan []byte]struct{}
	lastHash uint64 // FNV-1a hash of the last broadcast payload
	logger   *slog.Logger
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
func (h *Hub) Run(ctx context.Context, notify <-chan struct{}, builder cluster.SnapshotBuilder, minInterval time.Duration) {
	debounced := throttle(ctx, notify, minInterval)
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

	// Suppress the broadcast if the snapshot is byte-for-byte identical to the
	// last one sent. This eliminates the noise caused by the informer's 30-second
	// resync, which re-fires Update events for every object even when nothing
	// has actually changed.
	hash := fnvHash(data)
	h.mu.Lock()
	if hash == h.lastHash {
		h.mu.Unlock()
		h.logger.Debug("hub: snapshot unchanged, skipping broadcast")
		return
	}
	h.lastHash = hash
	h.mu.Unlock()

	frame := []byte(fmt.Sprintf("data: %s\n\n", data))
	h.broadcast(frame)
	h.logger.Debug("hub: broadcast snapshot", "clients", h.clientCount())
}

func fnvHash(b []byte) uint64 {
	h := fnv.New64a()
	h.Write(b)
	return h.Sum64()
}

func (h *Hub) clientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
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
