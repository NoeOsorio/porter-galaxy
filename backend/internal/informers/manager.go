package informers

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	appslisters "k8s.io/client-go/listers/apps/v1"
	autoscalinglisters "k8s.io/client-go/listers/autoscaling/v2"
	batchlisters "k8s.io/client-go/listers/batch/v1"
	corelisters "k8s.io/client-go/listers/core/v1"
	discoverylisters "k8s.io/client-go/listers/discovery/v1"
	networkinglisters "k8s.io/client-go/listers/networking/v1"
	"k8s.io/client-go/tools/cache"
)

// Listers are the read side of the informer caches the snapshot builder uses.
type Listers struct {
	Nodes           corelisters.NodeLister
	Pods            corelisters.PodLister
	Services        corelisters.ServiceLister
	Ingresses       networkinglisters.IngressLister
	EndpointSlices  discoverylisters.EndpointSliceLister
	Deployments     appslisters.DeploymentLister
	ReplicaSets     appslisters.ReplicaSetLister
	StatefulSets    appslisters.StatefulSetLister
	DaemonSets      appslisters.DaemonSetLister
	Jobs            batchlisters.JobLister
	CronJobs        batchlisters.CronJobLister
	PVCs            corelisters.PersistentVolumeClaimLister
	HPAs            autoscalinglisters.HorizontalPodAutoscalerLister
	NetworkPolicies networkinglisters.NetworkPolicyLister
	Namespaces      corelisters.NamespaceLister
}

// Manager owns one SharedInformerFactory per cluster. Every informer shares a
// single handler that only signals that something changed; the builder then
// reads the current state through Listers.
type Manager struct {
	factory informers.SharedInformerFactory
	listers Listers
	notify  func()
	logger  *slog.Logger
	synced  atomic.Bool
}

func NewManager(client kubernetes.Interface, resync time.Duration, notify func(), logger *slog.Logger) *Manager {
	f := informers.NewSharedInformerFactory(client, resync)
	m := &Manager{factory: f, notify: notify, logger: logger}

	// ReplicaSets and Jobs are mostly needed to walk owner references; dropping
	// their pod templates keeps memory flat as clusters accumulate history.
	rs := f.Apps().V1().ReplicaSets()
	jobs := f.Batch().V1().Jobs()
	for _, inf := range []cache.SharedIndexInformer{rs.Informer(), jobs.Informer()} {
		if err := inf.SetTransform(trimToOwners); err != nil {
			logger.Error("informer transform not set", "error", err)
		}
	}

	m.listers = Listers{
		Nodes:           f.Core().V1().Nodes().Lister(),
		Pods:            f.Core().V1().Pods().Lister(),
		Services:        f.Core().V1().Services().Lister(),
		Ingresses:       f.Networking().V1().Ingresses().Lister(),
		EndpointSlices:  f.Discovery().V1().EndpointSlices().Lister(),
		Deployments:     f.Apps().V1().Deployments().Lister(),
		ReplicaSets:     rs.Lister(),
		StatefulSets:    f.Apps().V1().StatefulSets().Lister(),
		DaemonSets:      f.Apps().V1().DaemonSets().Lister(),
		Jobs:            jobs.Lister(),
		CronJobs:        f.Batch().V1().CronJobs().Lister(),
		PVCs:            f.Core().V1().PersistentVolumeClaims().Lister(),
		HPAs:            f.Autoscaling().V2().HorizontalPodAutoscalers().Lister(),
		NetworkPolicies: f.Networking().V1().NetworkPolicies().Lister(),
		Namespaces:      f.Core().V1().Namespaces().Lister(),
	}
	for _, inf := range []cache.SharedIndexInformer{
		f.Core().V1().Nodes().Informer(),
		f.Core().V1().Pods().Informer(),
		f.Core().V1().Services().Informer(),
		f.Networking().V1().Ingresses().Informer(),
		f.Discovery().V1().EndpointSlices().Informer(),
		f.Apps().V1().Deployments().Informer(),
		rs.Informer(),
		f.Apps().V1().StatefulSets().Informer(),
		f.Apps().V1().DaemonSets().Informer(),
		jobs.Informer(),
		f.Batch().V1().CronJobs().Informer(),
		f.Core().V1().PersistentVolumeClaims().Informer(),
		f.Autoscaling().V2().HorizontalPodAutoscalers().Informer(),
		f.Networking().V1().NetworkPolicies().Informer(),
		f.Core().V1().Namespaces().Informer(),
	} {
		if _, err := inf.AddEventHandler(m.onChange()); err != nil {
			logger.Error("informer handler not registered", "error", err)
		}
	}
	return m
}

func (m *Manager) Listers() Listers {
	return m.listers
}

// Synced reports whether every informer finished its initial list.
func (m *Manager) Synced() bool {
	return m.synced.Load()
}

// Start starts the informers, waits for every cache to complete its initial
// list, and blocks until ctx is cancelled.
func (m *Manager) Start(ctx context.Context) error {
	m.factory.Start(ctx.Done())

	allSynced := true
	for t, ok := range m.factory.WaitForCacheSync(ctx.Done()) {
		if !ok {
			allSynced = false
			m.logger.Error("cache sync failed", "informer", t)
		}
	}
	if allSynced {
		m.synced.Store(true)
		m.logger.Info("all informer caches synced")
		m.notify()
	}

	<-ctx.Done()
	return nil
}

func (m *Manager) onChange() cache.ResourceEventHandlerFuncs {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(any) { m.notify() },
		UpdateFunc: func(oldObj, newObj any) {
			// Periodic resyncs replay unchanged objects; they are not changes.
			if o, err := meta.Accessor(oldObj); err == nil {
				if n, err := meta.Accessor(newObj); err == nil && o.GetResourceVersion() == n.GetResourceVersion() {
					return
				}
			}
			m.notify()
		},
		DeleteFunc: func(any) { m.notify() },
	}
}

func trimToOwners(obj any) (any, error) {
	switch o := obj.(type) {
	case *appsv1.ReplicaSet:
		return &appsv1.ReplicaSet{ObjectMeta: ownersOnly(o.ObjectMeta)}, nil
	case *batchv1.Job:
		// A Job's state comes from its status and completions, so those stay.
		return &batchv1.Job{
			ObjectMeta: ownersOnly(o.ObjectMeta),
			Spec:       batchv1.JobSpec{Completions: o.Spec.Completions, Suspend: o.Spec.Suspend},
			Status:     o.Status,
		}, nil
	}
	return obj, nil
}

func ownersOnly(m metav1.ObjectMeta) metav1.ObjectMeta {
	return metav1.ObjectMeta{
		Name:            m.Name,
		Namespace:       m.Namespace,
		ResourceVersion: m.ResourceVersion,
		OwnerReferences: m.OwnerReferences,
	}
}
