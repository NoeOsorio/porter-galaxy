package cluster

import (
	"cmp"
	"slices"
	"time"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/noeosorio/porter-galaxy/backend/internal/informers"
	"github.com/noeosorio/porter-galaxy/backend/internal/metrics"
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

// Builder reads the informer caches and assembles a Snapshot.
// Build is safe to call concurrently.
type Builder struct {
	listers   informers.Listers
	clusterID string
	usage     *metrics.Poller
}

// NewBuilder reads usage from poller; a nil poller means no metrics.
func NewBuilder(listers informers.Listers, clusterID string, poller *metrics.Poller) *Builder {
	return &Builder{listers: listers, clusterID: clusterID, usage: poller}
}

// all lists every object of a kind; a lister error only happens for invalid
// selectors, which labels.Everything never is.
func all[T any](list func(labels.Selector) ([]T, error)) []T {
	out, _ := list(labels.Everything())
	return out
}

func (b *Builder) Build() Snapshot {
	now := time.Now()
	warnings := b.buildWarnings(now)
	links, lbs := b.buildTopology()
	return Snapshot{
		Clusters: []Cluster{
			{
				ID:               b.clusterID,
				MetricsAvailable: b.usage != nil && b.usage.Available(),
				Nodes:            b.buildNodes(warnings),
				Pods:             b.buildPods(now, warnings),
				Workloads:        b.buildWorkloads(warnings),
				LoadBalancers:    lbs,
				PVCs:             b.buildPVCs(),
				HPAs:             b.buildHPAs(),
				NetworkPolicies:  b.buildNetworkPolicies(),
				Namespaces:       b.buildNamespaces(),
				Topology:         links,
			},
		},
	}
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

func (b *Builder) buildNodes(warnings map[string][]Warning) []NodeInfo {
	k8sNodes := all(b.listers.Nodes.List)
	out := make([]NodeInfo, 0, len(k8sNodes))

	for _, n := range k8sNodes {
		status := "Unknown"
		state := StateUnknown
		var pressures []string

		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady {
				switch cond.Status {
				case corev1.ConditionTrue:
					status, state = "Ready", StateRunning
				case corev1.ConditionFalse:
					state = StateFailed
				}
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

		key := objectKey("node", "", n.Name)
		out = append(out, NodeInfo{
			Key:         key,
			ID:          n.Name,
			State:       state,
			Capacity:    capacity,
			Status:      status,
			Conditions:  pressures,
			Warnings:    warnings[key],
			Allocatable: resources(n.Status.Allocatable),
			Usage:       b.nodeUsage(n.Name),
		})
	}
	slices.SortFunc(out, func(a, b NodeInfo) int { return cmp.Compare(a.ID, b.ID) })
	return out
}

// ── Pods ──────────────────────────────────────────────────────────────────────

func (b *Builder) buildPods(now time.Time, warnings map[string][]Warning) []PodInfo {
	k8sPods := all(b.listers.Pods.List)
	out := make([]PodInfo, 0, len(k8sPods))
	for _, p := range k8sPods {
		version := firstNonEmpty(
			p.Labels["version"],
			p.Labels["git_sha"],
			p.Labels["app.kubernetes.io/version"],
		)

		key := objectKey("pod", p.Namespace, p.Name)
		restarts, last, recent := podHealth(p, now)
		state := podState(p)
		if recent && last.Reason == "OOMKilled" {
			state = StateFailed
		}
		out = append(out, PodInfo{
			Key:             key,
			ID:              p.Name,
			Namespace:       p.Namespace,
			NodeID:          p.Spec.NodeName,
			State:           state,
			Version:         version,
			Owner:           b.podOwner(p),
			Refs:            podRefs(p),
			Restarts:        restarts,
			LastTermination: last,
			RecentRestart:   recent,
			Warnings:        warnings[key],
			Requests:        podRequests(p),
			Usage:           b.podUsage(p.Namespace, p.Name),
		})
	}
	slices.SortFunc(out, func(a, b PodInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}

// podOwner follows the pod's controller reference, and one more hop for
// ReplicaSets so Deployment-managed pods report the Deployment. If the
// ReplicaSet is not cached yet the pod reports the ReplicaSet; the next
// ReplicaSet event triggers a rebuild that corrects it.
func (b *Builder) podOwner(p *corev1.Pod) Owner {
	ref := metav1.GetControllerOf(p)
	if ref == nil {
		return Owner{Kind: "standalone"}
	}
	if ref.Kind == "ReplicaSet" {
		if rs, err := b.listers.ReplicaSets.ReplicaSets(p.Namespace).Get(ref.Name); err == nil {
			if dep := metav1.GetControllerOf(rs); dep != nil && dep.Kind == "Deployment" {
				return Owner{Kind: "Deployment", Name: dep.Name}
			}
		}
	}
	return Owner{Kind: ref.Kind, Name: ref.Name}
}

// failingWaitReasons are container waiting reasons that mean the pod will not
// become ready without intervention, as opposed to normal startup waits.
var failingWaitReasons = map[string]bool{
	"CrashLoopBackOff": true,
	"ImagePullBackOff": true,
	"ErrImagePull":     true,
}

func podState(p *corev1.Pod) State {
	switch p.Status.Phase {
	case corev1.PodSucceeded:
		return StateCompleted
	case corev1.PodFailed:
		return StateFailed
	}
	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Waiting != nil && failingWaitReasons[cs.State.Waiting.Reason] {
			return StateFailed
		}
		// Between a crash and its back-off the container is terminated, not waiting.
		if t := cs.State.Terminated; t != nil && t.ExitCode != 0 {
			return StateFailed
		}
	}
	switch p.Status.Phase {
	case corev1.PodPending:
		return StatePending
	case corev1.PodRunning:
		for _, cs := range p.Status.ContainerStatuses {
			if !cs.Ready {
				return StatePending
			}
		}
		return StateRunning
	}
	return StateUnknown
}

// ── Topology ──────────────────────────────────────────────────────────────────

// epEntry holds a pod name and its readiness state as reported by an EndpointSlice.
type epEntry struct {
	podName string
	ready   bool
}

// buildTopology returns the routing links (Internet → LB → Ingress → Service
// → Pod) and the load balancers they start from.
func (b *Builder) buildTopology() ([]Link, []LoadBalancerInfo) {
	// "namespace/serviceName" → endpoints, from all EndpointSlices.
	serviceEPs := make(map[string][]epEntry)
	for _, es := range all(b.listers.EndpointSlices.List) {
		svcName := es.Labels["kubernetes.io/service-name"]
		if svcName == "" {
			continue
		}
		nsName := es.Namespace + "/" + svcName
		for _, ep := range es.Endpoints {
			if ep.TargetRef == nil || ep.TargetRef.Kind != "Pod" {
				continue
			}
			ready := ep.Conditions.Ready != nil && *ep.Conditions.Ready
			serviceEPs[nsName] = append(serviceEPs[nsName], epEntry{podName: ep.TargetRef.Name, ready: ready})
		}
	}

	// An Ingress only reports the controller's external address, so map
	// addresses back to their LoadBalancer Service to name the entry point.
	services := all(b.listers.Services.List)
	lbServiceByAddr := make(map[string]*corev1.Service)
	for _, svc := range services {
		if svc.Spec.Type != corev1.ServiceTypeLoadBalancer {
			continue
		}
		if addr := serviceAddress(svc); addr != "" {
			lbServiceByAddr[addr] = svc
		}
	}

	lbs := make(map[string]LoadBalancerInfo)
	links := []Link{}
	seen := make(map[string]bool)
	addLink := func(l Link) {
		id := l.From + "|" + l.To
		if seen[id] {
			return
		}
		seen[id] = true
		links = append(links, l)
	}
	addServicePods := func(namespace, svcName, svcKey string) {
		for _, ep := range serviceEPs[namespace+"/"+svcName] {
			addLink(Link{From: svcKey, To: objectKey("pod", namespace, ep.podName), Active: ep.ready, Type: "service"})
		}
	}

	// ── Ingress-routed paths ──────────────────────────────────────────────────
	coveredServices := make(map[string]bool)
	for _, ing := range all(b.listers.Ingresses.List) {
		lb := ingressLoadBalancer(ing, lbServiceByAddr)
		lbs[lb.Key] = lb
		ingKey := objectKey("ingress", ing.Namespace, ing.Name)

		addLink(Link{From: internetKey, To: lb.Key, Active: true, Type: "internet"})
		addLink(Link{From: lb.Key, To: ingKey, Active: true, Type: "lb"})

		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil {
					continue
				}
				svcName := path.Backend.Service.Name
				svcKey := objectKey("service", ing.Namespace, svcName)
				coveredServices[svcKey] = true

				addLink(Link{From: ingKey, To: svcKey, Active: true, Type: "ingress"})
				addServicePods(ing.Namespace, svcName, svcKey)
			}
		}
	}

	// ── Bare LoadBalancer services not already behind an Ingress ──────────────
	for _, svc := range services {
		if svc.Spec.Type != corev1.ServiceTypeLoadBalancer {
			continue
		}
		svcKey := objectKey("service", svc.Namespace, svc.Name)
		lbKey := objectKey("loadbalancer", svc.Namespace, svc.Name)
		if coveredServices[svcKey] {
			continue
		}
		// The ingress controller's own Service is already the entry point of
		// the ingress paths above; routing it again would duplicate that LB.
		if _, ok := lbs[lbKey]; ok {
			continue
		}
		lbs[lbKey] = LoadBalancerInfo{
			Key:         lbKey,
			DisplayName: svc.Namespace + "/" + svc.Name,
			Address:     serviceAddress(svc),
		}
		addLink(Link{From: internetKey, To: lbKey, Active: true, Type: "internet"})
		addLink(Link{From: lbKey, To: svcKey, Active: true, Type: "lb"})
		addServicePods(svc.Namespace, svc.Name, svcKey)
	}

	slices.SortFunc(links, func(a, b Link) int {
		if a.From != b.From {
			return cmp.Compare(a.From, b.From)
		}
		return cmp.Compare(a.To, b.To)
	})
	lbList := make([]LoadBalancerInfo, 0, len(lbs))
	for _, lb := range lbs {
		lbList = append(lbList, lb)
	}
	slices.SortFunc(lbList, func(a, b LoadBalancerInfo) int { return cmp.Compare(a.Key, b.Key) })
	return links, lbList
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ingressLoadBalancer names the entry point of an Ingress after the
// LoadBalancer Service that owns its address, falling back to the address,
// or to the Ingress itself while no address has been assigned.
func ingressLoadBalancer(ing *networkingv1.Ingress, lbServiceByAddr map[string]*corev1.Service) LoadBalancerInfo {
	var addr string
	if len(ing.Status.LoadBalancer.Ingress) > 0 {
		lb := ing.Status.LoadBalancer.Ingress[0]
		addr = firstNonEmpty(lb.Hostname, lb.IP)
	}
	if svc, ok := lbServiceByAddr[addr]; ok && addr != "" {
		return LoadBalancerInfo{
			Key:         objectKey("loadbalancer", svc.Namespace, svc.Name),
			DisplayName: svc.Namespace + "/" + svc.Name,
			Address:     addr,
		}
	}
	if addr != "" {
		return LoadBalancerInfo{Key: objectKey("loadbalancer", "", addr), DisplayName: addr, Address: addr}
	}
	return LoadBalancerInfo{
		Key:         objectKey("loadbalancer", ing.Namespace, ing.Name),
		DisplayName: ing.Namespace + "/" + ing.Name,
	}
}

func serviceAddress(svc *corev1.Service) string {
	if len(svc.Status.LoadBalancer.Ingress) == 0 {
		return ""
	}
	lb := svc.Status.LoadBalancer.Ingress[0]
	return firstNonEmpty(lb.Hostname, lb.IP)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
