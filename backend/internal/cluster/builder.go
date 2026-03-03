package cluster

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"

	"github.com/noeosorio/porter-galaxy/backend/internal/store"
)

// SnapshotBuilder is the common interface for single- and multi-cluster builders.
type SnapshotBuilder interface {
	Build() Snapshot
}

// MultiBuilder merges snapshots from every registered cluster into a single
// Snapshot, preserving the Clusters slice structure.
type MultiBuilder struct {
	builders []*Builder
}

func NewMultiBuilder(builders ...*Builder) *MultiBuilder {
	return &MultiBuilder{builders: builders}
}

func (m *MultiBuilder) Build() Snapshot {
	clusters := make([]Cluster, 0, len(m.builders))
	for _, b := range m.builders {
		clusters = append(clusters, b.Build().Clusters...)
	}
	return Snapshot{Clusters: clusters}
}

// Builder reads from the Store and assembles a Snapshot.
// Build is safe to call concurrently.
type Builder struct {
	store     *store.Store
	clusterID string
}

func NewBuilder(s *store.Store, clusterID string) *Builder {
	return &Builder{store: s, clusterID: clusterID}
}

func (b *Builder) Build() Snapshot {
	return Snapshot{
		Clusters: []Cluster{
			{
				ID:       b.clusterID,
				Nodes:    b.buildNodes(),
				Pods:     b.buildPods(),
				Topology: b.buildTopology(),
				Metrics:  map[string]Metrics{},
			},
		},
	}
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

func (b *Builder) buildNodes() []NodeInfo {
	k8sNodes := b.store.ListNodes()
	out := make([]NodeInfo, 0, len(k8sNodes))

	for _, n := range k8sNodes {
		status := "Unknown"
		var pressures []string

		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				status = "Ready"
			}
			if cond.Status == corev1.ConditionTrue {
				switch cond.Type {
				case corev1.NodeDiskPressure:
					pressures = append(pressures, "DiskPressure")
				case corev1.NodeMemoryPressure:
					pressures = append(pressures, "MemoryPressure")
				case corev1.NodePIDPressure:
					pressures = append(pressures, "PIDPressure")
				}
			}
		}

		capacity := make(map[string]string, 2)
		if cpu, ok := n.Status.Capacity[corev1.ResourceCPU]; ok {
			capacity["cpu"] = cpu.String()
		}
		if mem, ok := n.Status.Capacity[corev1.ResourceMemory]; ok {
			capacity["memory"] = mem.String()
		}

		out = append(out, NodeInfo{
			ID:         n.Name,
			Capacity:   capacity,
			Status:     status,
			Conditions: pressures,
		})
	}
	return out
}

// ── Pods ──────────────────────────────────────────────────────────────────────

func (b *Builder) buildPods() []PodInfo {
	k8sPods := b.store.ListPods()
	out := make([]PodInfo, 0, len(k8sPods))

	for _, p := range k8sPods {
		version := firstNonEmpty(
			p.Labels["version"],
			p.Labels["git_sha"],
			p.Labels["app.kubernetes.io/version"],
		)

		out = append(out, PodInfo{
			ID:        p.Name,
			Namespace: p.Namespace,
			NodeID:    p.Spec.NodeName,
			Status:    string(p.Status.Phase),
			Version:   version,
		})
	}
	return out
}

// ── Topology ──────────────────────────────────────────────────────────────────

// epEntry holds a pod name and its readiness state as reported by an EndpointSlice.
type epEntry struct {
	podName string
	ready   bool
}

func (b *Builder) buildTopology() []Link {
	// Build map: "namespace/serviceName" → []epEntry from all EndpointSlices.
	serviceEPs := make(map[string][]epEntry)
	for _, es := range b.store.ListEndpointSlices() {
		svcName := es.Labels["kubernetes.io/service-name"]
		if svcName == "" {
			continue
		}
		key := es.Namespace + "/" + svcName
		for _, ep := range es.Endpoints {
			if ep.TargetRef == nil || ep.TargetRef.Kind != "Pod" {
				continue
			}
			ready := ep.Conditions.Ready != nil && *ep.Conditions.Ready
			serviceEPs[key] = append(serviceEPs[key], epEntry{
				podName: ep.TargetRef.Name,
				ready:   ready,
			})
		}
	}

	// Track which services already have an Ingress in front of them so we don't
	// create duplicate INTERNET → LB links for bare LoadBalancer services.
	coveredServices := make(map[string]bool)

	var links []Link

	// ── Ingress-routed paths: INTERNET → LB → Service → Pods ─────────────────
	for _, ing := range b.store.ListIngresses() {
		lbID := ingressLBID(ing)

		links = append(links, Link{
			From:   "INTERNET",
			To:     lbID,
			Active: true,
			Type:   "internet",
		})

		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil {
					continue
				}
				svcName := path.Backend.Service.Name
				svcKey := ing.Namespace + "/" + svcName
				coveredServices[svcKey] = true

				links = append(links, Link{
					From:   lbID,
					To:     svcKey,
					Active: true,
					Type:   "lb",
				})

				for _, ep := range serviceEPs[svcKey] {
					links = append(links, Link{
						From:   svcKey,
						To:     ep.podName,
						Active: ep.ready,
						Type:   "service",
					})
				}
			}
		}
	}

	// ── Bare LoadBalancer services not already behind an Ingress ──────────────
	for _, svc := range b.store.ListServices() {
		if svc.Spec.Type != corev1.ServiceTypeLoadBalancer {
			continue
		}
		svcKey := svc.Namespace + "/" + svc.Name
		if coveredServices[svcKey] {
			continue
		}

		lbID := serviceLBID(svc)

		links = append(links, Link{
			From:   "INTERNET",
			To:     lbID,
			Active: true,
			Type:   "internet",
		})
		links = append(links, Link{
			From:   lbID,
			To:     svcKey,
			Active: true,
			Type:   "lb",
		})
		for _, ep := range serviceEPs[svcKey] {
			links = append(links, Link{
				From:   svcKey,
				To:     ep.podName,
				Active: ep.ready,
				Type:   "service",
			})
		}
	}

	return links
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ingressLBID returns a stable node ID for the load-balancer entry point
// of an Ingress. Uses the actual IP/hostname when available.
func ingressLBID(ing *networkingv1.Ingress) string {
	if len(ing.Status.LoadBalancer.Ingress) > 0 {
		lb := ing.Status.LoadBalancer.Ingress[0]
		if lb.IP != "" {
			return "LB-" + lb.IP
		}
		if lb.Hostname != "" {
			return "LB-" + lb.Hostname
		}
	}
	return fmt.Sprintf("LB-%s-%s", ing.Namespace, ing.Name)
}

// serviceLBID returns a stable node ID for the load-balancer entry point
// of a bare LoadBalancer-type Service.
func serviceLBID(svc *corev1.Service) string {
	if len(svc.Status.LoadBalancer.Ingress) > 0 {
		lb := svc.Status.LoadBalancer.Ingress[0]
		if lb.IP != "" {
			return "LB-" + lb.IP
		}
		if lb.Hostname != "" {
			return "LB-" + lb.Hostname
		}
	}
	return fmt.Sprintf("LB-%s-%s", svc.Namespace, svc.Name)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
