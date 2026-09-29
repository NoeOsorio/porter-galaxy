package cluster

import (
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/metrics"
)

// Snapshot is the root payload broadcast to clients over SSE.
type Snapshot struct {
	Clusters []Cluster `json:"clusters"`
}

// Cluster represents a single Kubernetes cluster with its full observed topology.
type Cluster struct {
	ID string `json:"id"`
	// MetricsAvailable is false when the cluster does not serve metrics.k8s.io;
	// usage fields are then absent everywhere.
	MetricsAvailable bool                `json:"metricsAvailable"`
	Nodes            []NodeInfo          `json:"nodes"`
	Pods             []PodInfo           `json:"pods"`
	Workloads        []WorkloadInfo      `json:"workloads"`
	LoadBalancers    []LoadBalancerInfo  `json:"loadBalancers"`
	PVCs             []PVCInfo           `json:"pvcs"`
	HPAs             []HPAInfo           `json:"hpas"`
	NetworkPolicies  []NetworkPolicyInfo `json:"networkPolicies"`
	Namespaces       []NamespaceInfo     `json:"namespaces"`
	Topology         []Link              `json:"topology"`
}

// NodeInfo is the physical host that pods are scheduled onto.
type NodeInfo struct {
	Key        string            `json:"key"`
	ID         string            `json:"id"`
	State      State             `json:"state"`
	Capacity   map[string]string `json:"capacity"`
	Status     string            `json:"status"`
	Conditions []string          `json:"conditions,omitempty"` // DiskPressure, MemoryPressure, PIDPressure
	Warnings   []Warning         `json:"warnings,omitempty"`
	// Allocatable is what pods can use of the node; the reference for Usage.
	Allocatable *metrics.Resources `json:"allocatable,omitempty"`
	Usage       *metrics.Resources `json:"usage,omitempty"`
}

// PodInfo is a running container workload.
type PodInfo struct {
	Key       string `json:"key"`
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	NodeID    string `json:"nodeId"`
	State     State  `json:"state"`
	Version   string `json:"version,omitempty"`
	Owner     Owner  `json:"owner"`
	Refs      *Refs  `json:"refs,omitempty"`
	// Restarts sums the restart counts of the pod's containers.
	Restarts        int32        `json:"restarts,omitempty"`
	LastTermination *Termination `json:"lastTermination,omitempty"`
	// RecentRestart is true when a container terminated within RecentRestartWindow.
	RecentRestart bool      `json:"recentRestart,omitempty"`
	Warnings      []Warning `json:"warnings,omitempty"`
	// Requests sums the containers' requests; the reference for Usage.
	Requests *metrics.Resources `json:"requests,omitempty"`
	Usage    *metrics.Resources `json:"usage,omitempty"`
}

// Termination is the most recent terminated state among a pod's containers.
type Termination struct {
	Reason   string    `json:"reason"`
	ExitCode int32     `json:"exitCode"`
	At       time.Time `json:"at"`
}

// Warning is a Warning event about an object: at most MaxWarnings per object,
// newest first, none older than WarningTTL.
type Warning struct {
	Reason   string    `json:"reason"`
	Message  string    `json:"message"`
	Count    int32     `json:"count"`
	LastSeen time.Time `json:"lastSeen"`
}

// Refs are the names of objects a pod mounts or reads environment from.
// Only names: Secret and ConfigMap contents are never read.
type Refs struct {
	PVCs       []string `json:"pvcs,omitempty"`
	ConfigMaps []string `json:"configMaps,omitempty"`
	Secrets    []string `json:"secrets,omitempty"`
}

// Owner is the workload that controls a pod, resolved through owner
// references (a ReplicaSet owned by a Deployment reports the Deployment).
// Kind is "standalone" and Name is empty when the pod has no controller.
type Owner struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
}

// WorkloadInfo is a controller that owns pods: Deployment, StatefulSet,
// DaemonSet, Job, or CronJob.
type WorkloadInfo struct {
	Key       string `json:"key"`
	Kind      string `json:"kind"`
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	State     State  `json:"state"`
	// Desired and Ready count replicas; for DaemonSets, scheduled and ready
	// nodes; for Jobs, completions and succeeded pods.
	Desired int32 `json:"desired"`
	Ready   int32 `json:"ready"`
	// Owner is set for Jobs created by a CronJob.
	Owner    *Owner    `json:"owner,omitempty"`
	Warnings []Warning `json:"warnings,omitempty"`
}

type PVCInfo struct {
	Key          string `json:"key"`
	Namespace    string `json:"namespace"`
	Name         string `json:"name"`
	Phase        string `json:"phase"`
	StorageClass string `json:"storageClass,omitempty"`
}

type HPAInfo struct {
	Key       string `json:"key"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	// Target is the object key of the scaled workload.
	Target  string `json:"target"`
	Min     int32  `json:"min"`
	Max     int32  `json:"max"`
	Current int32  `json:"current"`
	Desired int32  `json:"desired"`
}

type NetworkPolicyInfo struct {
	Key       string `json:"key"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	// PodKeys are the pods the policy's podSelector matches.
	PodKeys []string `json:"podKeys"`
}

type NamespaceInfo struct {
	Key   string `json:"key"`
	Name  string `json:"name"`
	Phase string `json:"phase"`
}

// LoadBalancerInfo is an external entry point: a LoadBalancer Service, or the
// address an Ingress reports when no Service owns it.
type LoadBalancerInfo struct {
	Key         string `json:"key"`
	DisplayName string `json:"displayName"`
	// Address is the external hostname or IP; empty while it is being provisioned.
	Address string `json:"address,omitempty"`
}

// Link is a directed edge in the topology graph.
// Active=false signals the endpoint is not ready and should render as a broken/grey line.
type Link struct {
	// From and To are object keys (kind/namespace/name).
	From string `json:"from"`
	To   string `json:"to"`
	// Active=false when the endpoint behind the link is not ready.
	Active bool `json:"active"`
	// Type hints the rendering layer: "internet" | "lb" | "ingress" | "service" | "pod"
	Type string `json:"type,omitempty"`
}
