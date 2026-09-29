package informers

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
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
	// Events holds Warning events only.
	Events corelisters.EventLister
}

// Manager owns one SharedInformerFactory per cluster. Every informer shares a
// single handler that only signals that something changed; the builder then
// reads the current state through Listers.
type Manager struct {
	factory informers.SharedInformerFactory
	// events is separate because its field selector would filter every
	// other informer of a shared factory too.
	events  informers.SharedInformerFactory
	listers Listers
	notify  func()
	logger  *slog.Logger
	synced  atomic.Bool
}

func NewManager(client kubernetes.Interface, resync time.Duration, notify func(), logger *slog.Logger) *Manager {
	f := informers.NewSharedInformerFactory(client, resync)
	ev := informers.NewSharedInformerFactoryWithOptions(client, resync, informers.WithTweakListOptions(func(o *metav1.ListOptions) {
		o.FieldSelector = "type=" + corev1.EventTypeWarning
	}))
	m := &Manager{factory: f, events: ev, notify: notify, logger: logger}

	// ReplicaSets, Jobs and Events accumulate as history; keeping only the fields
	// the builder reads keeps memory flat.
	rs := f.Apps().V1().ReplicaSets()
	jobs := f.Batch().V1().Jobs()
	events := ev.Core().V1().Events()
	for _, inf := range []cache.SharedIndexInformer{rs.Informer(), jobs.Informer(), events.Informer()} {
		if err := inf.SetTransform(trimCached); err != nil {
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
		Events:          events.Lister(),
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
		events.Informer(),
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
	allSynced := true
	for _, f := range []informers.SharedInformerFactory{m.factory, m.events} {
		f.Start(ctx.Done())
		for t, ok := range f.WaitForCacheSync(ctx.Done()) {
			if !ok {
				allSynced = false
				m.logger.Error("cache sync failed", "informer", t)
			}
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

func trimCached(obj any) (any, error) {
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
	case *corev1.Event:
		// Only what the detail panel shows; the rest of an event is never read.
		meta := ownersOnly(o.ObjectMeta)
		meta.CreationTimestamp = o.CreationTimestamp
		return &corev1.Event{
			ObjectMeta:     meta,
			InvolvedObject: corev1.ObjectReference{Kind: o.InvolvedObject.Kind, Namespace: o.InvolvedObject.Namespace, Name: o.InvolvedObject.Name},
			Reason:         o.Reason,
			Message:        o.Message,
			Count:          o.Count,
			Series:         o.Series,
			EventTime:      o.EventTime,
			FirstTimestamp: o.FirstTimestamp,
			LastTimestamp:  o.LastTimestamp,
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
