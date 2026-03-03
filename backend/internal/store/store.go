package store

import (
	"sync"

	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
)

// Store is a thread-safe in-memory cache for the five Kubernetes object types
// that the informers observe. Every mutation calls the provided notify func so
// the SSE hub can push an updated snapshot immediately.
type Store struct {
	mu             sync.RWMutex
	nodes          map[string]*corev1.Node
	pods           map[string]*corev1.Pod
	services       map[string]*corev1.Service
	ingresses      map[string]*networkingv1.Ingress
	endpointSlices map[string]*discoveryv1.EndpointSlice
	notify         func()
}

func New(notify func()) *Store {
	return &Store{
		nodes:          make(map[string]*corev1.Node),
		pods:           make(map[string]*corev1.Pod),
		services:       make(map[string]*corev1.Service),
		ingresses:      make(map[string]*networkingv1.Ingress),
		endpointSlices: make(map[string]*discoveryv1.EndpointSlice),
		notify:         notify,
	}
}

func (s *Store) signal() {
	if s.notify != nil {
		s.notify()
	}
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

func (s *Store) UpsertNode(n *corev1.Node) {
	s.mu.Lock()
	s.nodes[n.Name] = n
	s.mu.Unlock()
	s.signal()
}

func (s *Store) DeleteNode(name string) {
	s.mu.Lock()
	delete(s.nodes, name)
	s.mu.Unlock()
	s.signal()
}

func (s *Store) ListNodes() []*corev1.Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*corev1.Node, 0, len(s.nodes))
	for _, n := range s.nodes {
		out = append(out, n)
	}
	return out
}

// ── Pods ──────────────────────────────────────────────────────────────────────

func (s *Store) UpsertPod(p *corev1.Pod) {
	s.mu.Lock()
	s.pods[p.Namespace+"/"+p.Name] = p
	s.mu.Unlock()
	s.signal()
}

func (s *Store) DeletePod(namespace, name string) {
	s.mu.Lock()
	delete(s.pods, namespace+"/"+name)
	s.mu.Unlock()
	s.signal()
}

func (s *Store) ListPods() []*corev1.Pod {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*corev1.Pod, 0, len(s.pods))
	for _, p := range s.pods {
		out = append(out, p)
	}
	return out
}

// ── Services ──────────────────────────────────────────────────────────────────

func (s *Store) UpsertService(svc *corev1.Service) {
	s.mu.Lock()
	s.services[svc.Namespace+"/"+svc.Name] = svc
	s.mu.Unlock()
	s.signal()
}

func (s *Store) DeleteService(namespace, name string) {
	s.mu.Lock()
	delete(s.services, namespace+"/"+name)
	s.mu.Unlock()
	s.signal()
}

func (s *Store) ListServices() []*corev1.Service {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*corev1.Service, 0, len(s.services))
	for _, svc := range s.services {
		out = append(out, svc)
	}
	return out
}

// ── Ingresses ─────────────────────────────────────────────────────────────────

func (s *Store) UpsertIngress(ing *networkingv1.Ingress) {
	s.mu.Lock()
	s.ingresses[ing.Namespace+"/"+ing.Name] = ing
	s.mu.Unlock()
	s.signal()
}

func (s *Store) DeleteIngress(namespace, name string) {
	s.mu.Lock()
	delete(s.ingresses, namespace+"/"+name)
	s.mu.Unlock()
	s.signal()
}

func (s *Store) ListIngresses() []*networkingv1.Ingress {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*networkingv1.Ingress, 0, len(s.ingresses))
	for _, ing := range s.ingresses {
		out = append(out, ing)
	}
	return out
}

// ── EndpointSlices ────────────────────────────────────────────────────────────

func (s *Store) UpsertEndpointSlice(es *discoveryv1.EndpointSlice) {
	s.mu.Lock()
	s.endpointSlices[es.Namespace+"/"+es.Name] = es
	s.mu.Unlock()
	s.signal()
}

func (s *Store) DeleteEndpointSlice(namespace, name string) {
	s.mu.Lock()
	delete(s.endpointSlices, namespace+"/"+name)
	s.mu.Unlock()
	s.signal()
}

func (s *Store) ListEndpointSlices() []*discoveryv1.EndpointSlice {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*discoveryv1.EndpointSlice, 0, len(s.endpointSlices))
	for _, es := range s.endpointSlices {
		out = append(out, es)
	}
	return out
}
