package cluster

import (
	"cmp"
	"slices"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

// ── Workloads ─────────────────────────────────────────────────────────────────

func (b *Builder) buildWorkloads() []WorkloadInfo {
	out := []WorkloadInfo{}
	add := func(kind, ns, name string, state State, desired, ready int32, owner *Owner) {
		out = append(out, WorkloadInfo{
			Key:       objectKey(strings.ToLower(kind), ns, name),
			Kind:      kind,
			ID:        name,
			Namespace: ns,
			State:     state,
			Desired:   desired,
			Ready:     ready,
			Owner:     owner,
		})
	}

	for _, d := range all(b.listers.Deployments.List) {
		desired := replicas(d.Spec.Replicas)
		add("Deployment", d.Namespace, d.Name, replicaState(desired, d.Status.ReadyReplicas), desired, d.Status.ReadyReplicas, nil)
	}
	for _, s := range all(b.listers.StatefulSets.List) {
		desired := replicas(s.Spec.Replicas)
		add("StatefulSet", s.Namespace, s.Name, replicaState(desired, s.Status.ReadyReplicas), desired, s.Status.ReadyReplicas, nil)
	}
	for _, d := range all(b.listers.DaemonSets.List) {
		add("DaemonSet", d.Namespace, d.Name, replicaState(d.Status.DesiredNumberScheduled, d.Status.NumberReady), d.Status.DesiredNumberScheduled, d.Status.NumberReady, nil)
	}
	for _, j := range all(b.listers.Jobs.List) {
		completions := replicas(j.Spec.Completions)
		var owner *Owner
		if ref := metav1.GetControllerOf(j); ref != nil && ref.Kind == "CronJob" {
			owner = &Owner{Kind: "CronJob", Name: ref.Name}
		}
		add("Job", j.Namespace, j.Name, jobState(completions, j.Status.Succeeded, j.Status.Failed, j.Status.Active), completions, j.Status.Succeeded, owner)
	}
	for _, c := range all(b.listers.CronJobs.List) {
		add("CronJob", c.Namespace, c.Name, cronJobState(c.Spec.Suspend, len(c.Status.Active), c.Status.LastSuccessfulTime != nil), int32(len(c.Status.Active)), int32(len(c.Status.Active)), nil)
	}

	slices.SortFunc(out, func(a, b WorkloadInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}

func replicas(n *int32) int32 {
	if n == nil {
		return 1
	}
	return *n
}

func replicaState(desired, ready int32) State {
	switch {
	case desired == 0:
		return StateScaledToZero
	case ready >= desired:
		return StateRunning
	case ready == 0:
		return StateFailed
	default:
		return StatePending
	}
}

func jobState(completions, succeeded, failed, active int32) State {
	switch {
	case succeeded >= completions:
		return StateCompleted
	case active > 0:
		return StateRunning
	case failed > 0:
		return StateFailed
	default:
		return StatePending
	}
}

func cronJobState(suspend *bool, active int, everSucceeded bool) State {
	switch {
	case suspend != nil && *suspend:
		return StateScaledToZero
	case active > 0:
		return StateRunning
	case everSucceeded:
		return StateCompleted
	default:
		return StatePending
	}
}

// ── References ────────────────────────────────────────────────────────────────

func podRefs(p *corev1.Pod) *Refs {
	pvcs, cms, secrets := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, v := range p.Spec.Volumes {
		switch {
		case v.PersistentVolumeClaim != nil:
			pvcs[v.PersistentVolumeClaim.ClaimName] = true
		case v.ConfigMap != nil:
			cms[v.ConfigMap.Name] = true
		case v.Secret != nil:
			secrets[v.Secret.SecretName] = true
		// Every pod gets a projected service-account token volume that also
		// mounts kube-root-ca.crt; listing it on every pod would be noise.
		case v.Projected != nil && !strings.HasPrefix(v.Name, "kube-api-access-"):
			for _, src := range v.Projected.Sources {
				if src.ConfigMap != nil {
					cms[src.ConfigMap.Name] = true
				}
				if src.Secret != nil {
					secrets[src.Secret.Name] = true
				}
			}
		}
	}
	for _, c := range slices.Concat(p.Spec.InitContainers, p.Spec.Containers) {
		for _, from := range c.EnvFrom {
			if from.ConfigMapRef != nil {
				cms[from.ConfigMapRef.Name] = true
			}
			if from.SecretRef != nil {
				secrets[from.SecretRef.Name] = true
			}
		}
		for _, env := range c.Env {
			if env.ValueFrom == nil {
				continue
			}
			if env.ValueFrom.ConfigMapKeyRef != nil {
				cms[env.ValueFrom.ConfigMapKeyRef.Name] = true
			}
			if env.ValueFrom.SecretKeyRef != nil {
				secrets[env.ValueFrom.SecretKeyRef.Name] = true
			}
		}
	}
	if len(pvcs)+len(cms)+len(secrets) == 0 {
		return nil
	}
	return &Refs{PVCs: sortedKeys(pvcs), ConfigMaps: sortedKeys(cms), Secrets: sortedKeys(secrets)}
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

// ── PVCs, HPAs, NetworkPolicies, Namespaces ───────────────────────────────────

func (b *Builder) buildPVCs() []PVCInfo {
	out := []PVCInfo{}
	for _, c := range all(b.listers.PVCs.List) {
		info := PVCInfo{Key: objectKey("pvc", c.Namespace, c.Name), Namespace: c.Namespace, Name: c.Name, Phase: string(c.Status.Phase)}
		if c.Spec.StorageClassName != nil {
			info.StorageClass = *c.Spec.StorageClassName
		}
		out = append(out, info)
	}
	slices.SortFunc(out, func(a, b PVCInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}

func (b *Builder) buildHPAs() []HPAInfo {
	out := []HPAInfo{}
	for _, h := range all(b.listers.HPAs.List) {
		out = append(out, HPAInfo{
			Key:       objectKey("hpa", h.Namespace, h.Name),
			Namespace: h.Namespace,
			Name:      h.Name,
			Target:    objectKey(strings.ToLower(h.Spec.ScaleTargetRef.Kind), h.Namespace, h.Spec.ScaleTargetRef.Name),
			Min:       replicas(h.Spec.MinReplicas),
			Max:       h.Spec.MaxReplicas,
			Current:   h.Status.CurrentReplicas,
			Desired:   h.Status.DesiredReplicas,
		})
	}
	slices.SortFunc(out, func(a, b HPAInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}

func (b *Builder) buildNetworkPolicies() []NetworkPolicyInfo {
	out := []NetworkPolicyInfo{}
	for _, np := range all(b.listers.NetworkPolicies.List) {
		info := NetworkPolicyInfo{Key: objectKey("networkpolicy", np.Namespace, np.Name), Namespace: np.Namespace, Name: np.Name, PodKeys: []string{}}
		if sel, err := metav1.LabelSelectorAsSelector(&np.Spec.PodSelector); err == nil {
			pods, _ := b.listers.Pods.Pods(np.Namespace).List(sel)
			for _, p := range pods {
				info.PodKeys = append(info.PodKeys, objectKey("pod", p.Namespace, p.Name))
			}
			slices.Sort(info.PodKeys)
		}
		out = append(out, info)
	}
	slices.SortFunc(out, func(a, b NetworkPolicyInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}

func (b *Builder) buildNamespaces() []NamespaceInfo {
	namespaces, _ := b.listers.Namespaces.List(labels.Everything())
	out := make([]NamespaceInfo, 0, len(namespaces))
	for _, ns := range namespaces {
		out = append(out, NamespaceInfo{Key: objectKey("namespace", "", ns.Name), Name: ns.Name, Phase: string(ns.Status.Phase)})
	}
	slices.SortFunc(out, func(a, b NamespaceInfo) int { return cmp.Compare(a.Key, b.Key) })
	return out
}
