package cluster

import (
	"slices"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"

	"github.com/noeosorio/porter-galaxy/backend/internal/metrics"
)

const (
	RecentRestartWindow = 10 * time.Minute
	MaxWarnings         = 10
	WarningTTL          = time.Hour
)

// podHealth reads restarts and the latest termination from container statuses.
// A container waiting out a crash back-off reports its latest termination in
// State; it moves to LastTerminationState only when the container starts again.
func podHealth(p *corev1.Pod, now time.Time) (restarts int32, last *Termination, recent bool) {
	for _, cs := range p.Status.ContainerStatuses {
		restarts += cs.RestartCount
		for _, t := range []*corev1.ContainerStateTerminated{cs.State.Terminated, cs.LastTerminationState.Terminated} {
			if t != nil && (last == nil || t.FinishedAt.After(last.At)) {
				last = &Termination{Reason: t.Reason, ExitCode: t.ExitCode, At: t.FinishedAt.Time}
			}
		}
	}
	recent = last != nil && restarts > 0 && now.Sub(last.At) < RecentRestartWindow
	return restarts, last, recent
}

// buildWarnings groups Warning events by the object key they are about.
func (b *Builder) buildWarnings(now time.Time) map[string][]Warning {
	out := map[string][]Warning{}
	for _, e := range all(b.listers.Events.List) {
		seen := eventLastSeen(e)
		if now.Sub(seen) > WarningTTL {
			continue
		}
		count := e.Count
		if e.Series != nil {
			count = e.Series.Count
		}
		key := objectKey(strings.ToLower(e.InvolvedObject.Kind), e.InvolvedObject.Namespace, e.InvolvedObject.Name)
		out[key] = append(out[key], Warning{Reason: e.Reason, Message: e.Message, Count: max(count, 1), LastSeen: seen})
	}
	for key, ws := range out {
		slices.SortFunc(ws, func(a, b Warning) int { return b.LastSeen.Compare(a.LastSeen) })
		out[key] = ws[:min(len(ws), MaxWarnings)]
	}
	return out
}

// eventLastSeen covers both event APIs: core/v1 writers set LastTimestamp,
// events.k8s.io/v1 writers set EventTime and Series instead.
func eventLastSeen(e *corev1.Event) time.Time {
	var seen time.Time
	if e.Series != nil {
		seen = e.Series.LastObservedTime.Time
	}
	for _, t := range []time.Time{e.LastTimestamp.Time, e.EventTime.Time, e.FirstTimestamp.Time, e.CreationTimestamp.Time} {
		if t.After(seen) {
			seen = t
		}
	}
	return seen
}

func resources(list corev1.ResourceList) *metrics.Resources {
	r := metrics.Resources{}
	if q, ok := list[corev1.ResourceCPU]; ok {
		r.CPUMillis = q.MilliValue()
	}
	if q, ok := list[corev1.ResourceMemory]; ok {
		r.MemoryBytes = q.Value()
	}
	if r == (metrics.Resources{}) {
		return nil
	}
	return &r
}

func podRequests(p *corev1.Pod) *metrics.Resources {
	total := metrics.Resources{}
	for _, c := range p.Spec.Containers {
		if r := resources(c.Resources.Requests); r != nil {
			total.CPUMillis += r.CPUMillis
			total.MemoryBytes += r.MemoryBytes
		}
	}
	if total == (metrics.Resources{}) {
		return nil
	}
	return &total
}

func (b *Builder) podUsage(namespace, name string) *metrics.Resources {
	if b.usage == nil {
		return nil
	}
	if r, ok := b.usage.Pod(namespace, name); ok {
		return &r
	}
	return nil
}

func (b *Builder) nodeUsage(name string) *metrics.Resources {
	if b.usage == nil {
		return nil
	}
	if r, ok := b.usage.Node(name); ok {
		return &r
	}
	return nil
}
