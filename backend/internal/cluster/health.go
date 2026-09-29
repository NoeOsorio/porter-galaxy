package cluster

import (
	"slices"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
)

const (
	RecentRestartWindow = 10 * time.Minute
	MaxWarnings         = 10
	WarningTTL          = time.Hour
)

// podHealth reads restarts and the latest termination from container statuses.
func podHealth(p *corev1.Pod, now time.Time) (restarts int32, last *Termination, recent bool) {
	for _, cs := range p.Status.ContainerStatuses {
		restarts += cs.RestartCount
		t := cs.LastTerminationState.Terminated
		if t == nil {
			continue
		}
		if last == nil || t.FinishedAt.After(last.At) {
			last = &Termination{Reason: t.Reason, ExitCode: t.ExitCode, At: t.FinishedAt.Time}
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
