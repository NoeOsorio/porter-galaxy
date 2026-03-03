package informers

import (
	"context"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"

	"github.com/noeosorio/porter-galaxy/backend/internal/store"
)

// Manager owns the SharedInformerFactory and registers event handlers for the
// five resource types that power the galaxy graph.
type Manager struct {
	factory informers.SharedInformerFactory
	store   *store.Store
	logger  *slog.Logger
}

func NewManager(client kubernetes.Interface, s *store.Store, resync time.Duration, logger *slog.Logger) *Manager {
	return &Manager{
		factory: informers.NewSharedInformerFactory(client, resync),
		store:   s,
		logger:  logger,
	}
}

// Start registers all informers, starts the factory, and waits for every cache
// to complete its initial list. It blocks until ctx is cancelled.
func (m *Manager) Start(ctx context.Context) error {
	m.registerNodes()
	m.registerPods()
	m.registerServices()
	m.registerIngresses()
	m.registerEndpointSlices()

	m.factory.Start(ctx.Done())

	synced := m.factory.WaitForCacheSync(ctx.Done())
	for t, ok := range synced {
		if !ok {
			m.logger.Error("cache sync failed", "informer", t)
		}
	}
	m.logger.Info("all informer caches synced")

	<-ctx.Done()
	return nil
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

func (m *Manager) registerNodes() {
	m.factory.Core().V1().Nodes().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if n, ok := obj.(*corev1.Node); ok {
				m.store.UpsertNode(n)
				m.logger.Debug("node added", "name", n.Name)
			}
		},
		UpdateFunc: func(_, newObj any) {
			if n, ok := newObj.(*corev1.Node); ok {
				m.store.UpsertNode(n)
			}
		},
		DeleteFunc: func(obj any) {
			n := extractNode(obj)
			if n == nil {
				return
			}
			m.store.DeleteNode(n.Name)
			m.logger.Debug("node deleted", "name", n.Name)
		},
	})
}

// ── Pods ──────────────────────────────────────────────────────────────────────

func (m *Manager) registerPods() {
	m.factory.Core().V1().Pods().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if p, ok := obj.(*corev1.Pod); ok {
				m.store.UpsertPod(p)
			}
		},
		UpdateFunc: func(_, newObj any) {
			if p, ok := newObj.(*corev1.Pod); ok {
				m.store.UpsertPod(p)
			}
		},
		DeleteFunc: func(obj any) {
			p := extractPod(obj)
			if p == nil {
				return
			}
			m.store.DeletePod(p.Namespace, p.Name)
		},
	})
}

// ── Services ──────────────────────────────────────────────────────────────────

func (m *Manager) registerServices() {
	m.factory.Core().V1().Services().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if svc, ok := obj.(*corev1.Service); ok {
				m.store.UpsertService(svc)
			}
		},
		UpdateFunc: func(_, newObj any) {
			if svc, ok := newObj.(*corev1.Service); ok {
				m.store.UpsertService(svc)
			}
		},
		DeleteFunc: func(obj any) {
			svc := extractService(obj)
			if svc == nil {
				return
			}
			m.store.DeleteService(svc.Namespace, svc.Name)
		},
	})
}

// ── Ingresses ─────────────────────────────────────────────────────────────────

func (m *Manager) registerIngresses() {
	m.factory.Networking().V1().Ingresses().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if ing, ok := obj.(*networkingv1.Ingress); ok {
				m.store.UpsertIngress(ing)
			}
		},
		UpdateFunc: func(_, newObj any) {
			if ing, ok := newObj.(*networkingv1.Ingress); ok {
				m.store.UpsertIngress(ing)
			}
		},
		DeleteFunc: func(obj any) {
			ing := extractIngress(obj)
			if ing == nil {
				return
			}
			m.store.DeleteIngress(ing.Namespace, ing.Name)
		},
	})
}

// ── EndpointSlices ────────────────────────────────────────────────────────────

func (m *Manager) registerEndpointSlices() {
	m.factory.Discovery().V1().EndpointSlices().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if es, ok := obj.(*discoveryv1.EndpointSlice); ok {
				m.store.UpsertEndpointSlice(es)
			}
		},
		UpdateFunc: func(_, newObj any) {
			if es, ok := newObj.(*discoveryv1.EndpointSlice); ok {
				m.store.UpsertEndpointSlice(es)
			}
		},
		DeleteFunc: func(obj any) {
			es := extractEndpointSlice(obj)
			if es == nil {
				return
			}
			m.store.DeleteEndpointSlice(es.Namespace, es.Name)
		},
	})
}

// ── Tombstone helpers ─────────────────────────────────────────────────────────
// When a watch connection drops and the informer misses a delete event, the
// cache replays it as a DeletedFinalStateUnknown tombstone. We must unwrap it.

func extractNode(obj any) *corev1.Node {
	if n, ok := obj.(*corev1.Node); ok {
		return n
	}
	if ts, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if n, ok := ts.Obj.(*corev1.Node); ok {
			return n
		}
	}
	return nil
}

func extractPod(obj any) *corev1.Pod {
	if p, ok := obj.(*corev1.Pod); ok {
		return p
	}
	if ts, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if p, ok := ts.Obj.(*corev1.Pod); ok {
			return p
		}
	}
	return nil
}

func extractService(obj any) *corev1.Service {
	if svc, ok := obj.(*corev1.Service); ok {
		return svc
	}
	if ts, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if svc, ok := ts.Obj.(*corev1.Service); ok {
			return svc
		}
	}
	return nil
}

func extractIngress(obj any) *networkingv1.Ingress {
	if ing, ok := obj.(*networkingv1.Ingress); ok {
		return ing
	}
	if ts, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if ing, ok := ts.Obj.(*networkingv1.Ingress); ok {
			return ing
		}
	}
	return nil
}

func extractEndpointSlice(obj any) *discoveryv1.EndpointSlice {
	if es, ok := obj.(*discoveryv1.EndpointSlice); ok {
		return es
	}
	if ts, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if es, ok := ts.Obj.(*discoveryv1.EndpointSlice); ok {
			return es
		}
	}
	return nil
}
