// Package metrics reads CPU and memory usage from the metrics.k8s.io API
// (metrics-server) when the cluster serves it.
package metrics

import (
	"context"
	"encoding/json"
	"log/slog"
	"maps"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/client-go/kubernetes"
)

const (
	groupVersion = "metrics.k8s.io/v1beta1"
	pollEvery    = 15 * time.Second
	// discoverEvery is how often a cluster without metrics-server is checked
	// again, so installing it later turns usage on without a restart.
	discoverEvery = 5 * time.Minute
)

// Resources is an amount of CPU and memory.
type Resources struct {
	CPUMillis   int64 `json:"cpuMillis"`
	MemoryBytes int64 `json:"memoryBytes"`
}

// Poller keeps the latest usage per pod ("namespace/name") and node (name).
type Poller struct {
	client kubernetes.Interface
	notify func()
	logger *slog.Logger

	mu        sync.RWMutex
	available bool
	pods      map[string]Resources
	nodes     map[string]Resources
}

func NewPoller(client kubernetes.Interface, notify func(), logger *slog.Logger) *Poller {
	return &Poller{client: client, notify: notify, logger: logger}
}

func (p *Poller) Available() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.available
}

func (p *Poller) Pod(namespace, name string) (Resources, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	r, ok := p.pods[namespace+"/"+name]
	return r, ok
}

func (p *Poller) Node(name string) (Resources, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	r, ok := p.nodes[name]
	return r, ok
}

// Run polls until ctx is cancelled.
func (p *Poller) Run(ctx context.Context) {
	for {
		wait := pollEvery
		if !p.poll(ctx) {
			wait = discoverEvery
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// poll reports whether the metrics API is served.
func (p *Poller) poll(ctx context.Context) bool {
	if _, err := p.client.Discovery().ServerResourcesForGroupVersion(groupVersion); err != nil {
		p.set(false, nil, nil)
		return false
	}
	pods, err := p.list(ctx, "pods")
	if err != nil {
		p.logger.Warn("metrics: pod usage unavailable", "error", err)
		return true
	}
	nodes, err := p.list(ctx, "nodes")
	if err != nil {
		p.logger.Warn("metrics: node usage unavailable", "error", err)
		return true
	}
	p.set(true, pods, nodes)
	return true
}

type metricsList struct {
	Items []struct {
		Metadata struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"metadata"`
		Usage      map[string]resource.Quantity `json:"usage"`
		Containers []struct {
			Usage map[string]resource.Quantity `json:"usage"`
		} `json:"containers"`
	} `json:"items"`
}

func (p *Poller) list(ctx context.Context, resourceName string) (map[string]Resources, error) {
	raw, err := p.client.Discovery().RESTClient().Get().AbsPath("/apis", groupVersion, resourceName).DoRaw(ctx)
	if err != nil {
		return nil, err
	}
	var l metricsList
	if err := json.Unmarshal(raw, &l); err != nil {
		return nil, err
	}
	out := make(map[string]Resources, len(l.Items))
	for _, item := range l.Items {
		usages := []map[string]resource.Quantity{item.Usage}
		for _, c := range item.Containers {
			usages = append(usages, c.Usage)
		}
		var r Resources
		for _, u := range usages {
			if q, ok := u["cpu"]; ok {
				r.CPUMillis += q.MilliValue()
			}
			if q, ok := u["memory"]; ok {
				r.MemoryBytes += q.Value()
			}
		}
		key := item.Metadata.Name
		if item.Metadata.Namespace != "" {
			key = item.Metadata.Namespace + "/" + key
		}
		out[key] = r
	}
	return out, nil
}

// settle keeps the reported value until usage moves by more than 10% (and at
// least minStep). Usage jitters on every poll, and each changed value costs a
// patch on every client's stream.
func settle(reported, sample, minStep int64) int64 {
	if d := sample - reported; max(d, -d) <= max(minStep, reported/10) {
		return reported
	}
	return sample
}

func (p *Poller) set(available bool, pods, nodes map[string]Resources) {
	p.mu.Lock()
	for _, next := range []struct{ prev, cur map[string]Resources }{{p.pods, pods}, {p.nodes, nodes}} {
		for k, r := range next.cur {
			if old, ok := next.prev[k]; ok {
				next.cur[k] = Resources{CPUMillis: settle(old.CPUMillis, r.CPUMillis, 5), MemoryBytes: settle(old.MemoryBytes, r.MemoryBytes, 8<<20)}
			}
		}
	}
	changed := p.available != available || !maps.Equal(p.pods, pods) || !maps.Equal(p.nodes, nodes)
	p.available, p.pods, p.nodes = available, pods, nodes
	p.mu.Unlock()
	if changed {
		p.notify()
	}
}
