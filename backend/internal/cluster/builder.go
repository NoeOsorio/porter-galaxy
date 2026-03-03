package cluster

import (
	"cmp"
	"fmt"
	"slices"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"

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
				ID:          b.clusterID,
				Nodes:       b.buildNodes(),
				Pods:        b.buildPods(),
				Deployments: b.buildDeployments(),
				Topology:    b.buildTopology(),
				Metrics:     map[string]Metrics{},
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
	slices.SortFunc(out, func(a, b NodeInfo) int { return cmp.Compare(a.ID, b.ID) })
	return out
}

// ── Pods ──────────────────────────────────────────────────────────────────────

func (b *Builder) buildPods() []PodInfo {
	k8sPods := b.store.ListPods()

	// Build a per-namespace index of deployment selectors for O(1) lookup.
	type depEntry struct {
		id       string
		selector labels.Selector
	}
	depsByNS := make(map[string][]depEntry)
	for _, d := range b.store.ListDeployments() {
		sel, err := metav1.LabelSelectorAsSelector(d.Spec.Selector)
		if err != nil {
			continue
		}
		depsByNS[d.Namespace] = append(depsByNS[d.Namespace], depEntry{id: d.Name, selector: sel})
	}

	out := make([]PodInfo, 0, len(k8sPods))
	for _, p := range k8sPods {
		version := firstNonEmpty(
			p.Labels["version"],
			p.Labels["git_sha"],
			p.Labels["app.kubernetes.io/version"],
		)

		var controllerID string
		for _, dep := range depsByNS[p.Namespace] {
			if dep.selector.Matches(labels.Set(p.Labels)) {
				controllerID = dep.id
				break
			}
		}

		out = append(out, PodInfo{
			ID:           p.Name,
			Namespace:    p.Namespace,
			NodeID:       p.Spec.NodeName,
			Status:       podStatus(p),
			Version:      version,
			ControllerID: controllerID,
		})
	}
	slices.SortFunc(out, func(a, b PodInfo) int {
		return cmp.Compare(a.Namespace+"/"+a.ID, b.Namespace+"/"+b.ID)
	})
	return out
}

// podStatus returns a human-readable status for a pod, preferring container-level
// reasons (e.g. CrashLoopBackOff, OOMKilled) over the coarse pod Phase.
func podStatus(p *corev1.Pod) string {
	// Check each container's waiting/terminated reason first.
	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.State.Terminated != nil && cs.State.Terminated.Reason != "" {
			return cs.State.Terminated.Reason
		}
	}
	// Fall back to pod phase (Pending / Running / Succeeded / Failed / Unknown).
	return string(p.Status.Phase)
}

// ── Deployments ───────────────────────────────────────────────────────────────

func (b *Builder) buildDeployments() []DeploymentInfo {
	k8sDeployments := b.store.ListDeployments()
	out := make([]DeploymentInfo, 0, len(k8sDeployments))

	for _, d := range k8sDeployments {
		desired := int32(1)
		if d.Spec.Replicas != nil {
			desired = *d.Spec.Replicas
		}
		out = append(out, DeploymentInfo{
			ID:        d.Name,
			Namespace: d.Namespace,
			Desired:   desired,
			Ready:     d.Status.ReadyReplicas,
			Available: d.Status.AvailableReplicas,
		})
	}
	slices.SortFunc(out, func(a, b DeploymentInfo) int {
		return cmp.Compare(a.Namespace+"/"+a.ID, b.Namespace+"/"+b.ID)
	})
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

	// Track LB IDs claimed by Ingress objects. The ingress controller's own
	// LoadBalancer service shares the same external IP/hostname, so we skip it
	// in the bare-LB pass to avoid a redundant INTERNET → LB → controller path.
	ingressLBIDs := make(map[string]bool)
	for _, ing := range b.store.ListIngresses() {
		ingressLBIDs[ingressLBID(ing)] = true
	}

	var links []Link
	seen := make(map[string]bool)
	addLink := func(l Link) {
		key := l.From + "|" + l.To
		if seen[key] {
			return
		}
		seen[key] = true
		links = append(links, l)
	}

	// ── Ingress-routed paths: INTERNET → LB → Ingress → Service → Pods ────────
	for _, ing := range b.store.ListIngresses() {
		lbID := ingressLBID(ing)
		ingID := fmt.Sprintf("ingress/%s/%s", ing.Namespace, ing.Name)

		addLink(Link{From: "INTERNET", To: lbID, Active: true, Type: "internet"})
		addLink(Link{From: lbID, To: ingID, Active: true, Type: "lb"})

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

				addLink(Link{From: ingID, To: svcKey, Active: true, Type: "ingress"})

				for _, ep := range serviceEPs[svcKey] {
					addLink(Link{From: svcKey, To: ep.podName, Active: ep.ready, Type: "service"})
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
		if ingressLBIDs[lbID] {
			continue
		}

		addLink(Link{From: "INTERNET", To: lbID, Active: true, Type: "internet"})
		addLink(Link{From: lbID, To: svcKey, Active: true, Type: "lb"})
		for _, ep := range serviceEPs[svcKey] {
			addLink(Link{From: svcKey, To: ep.podName, Active: ep.ready, Type: "service"})
		}
	}

	slices.SortFunc(links, func(a, b Link) int {
		if a.From != b.From {
			return cmp.Compare(a.From, b.From)
		}
		return cmp.Compare(a.To, b.To)
	})
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
