package cluster

// Snapshot is the root payload broadcast to clients over SSE.
type Snapshot struct {
	Clusters []Cluster `json:"clusters"`
}

// Cluster represents a single Kubernetes cluster with its full observed topology.
type Cluster struct {
	ID          string             `json:"id"`
	Nodes       []NodeInfo         `json:"nodes"`
	Pods        []PodInfo          `json:"pods"`
	Deployments []DeploymentInfo   `json:"deployments"`
	Topology    []Link             `json:"topology"`
	Metrics     map[string]Metrics `json:"metrics"`
}

// NodeInfo is the physical host that pods are scheduled onto.
type NodeInfo struct {
	ID         string            `json:"id"`
	Capacity   map[string]string `json:"capacity"`
	Status     string            `json:"status"`
	Conditions []string          `json:"conditions,omitempty"` // DiskPressure, MemoryPressure, PIDPressure
}

// PodInfo is a running container workload.
type PodInfo struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	NodeID    string `json:"nodeId"`
	Status    string `json:"status"`
	Version   string `json:"version,omitempty"`
}

// DeploymentInfo is a Kubernetes Deployment workload.
type DeploymentInfo struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	// Desired is the number of desired replicas (spec.replicas).
	Desired int32 `json:"desired"`
	// Ready is the number of replicas currently ready.
	Ready int32 `json:"ready"`
	// Available is the number of replicas available to serve traffic.
	Available int32 `json:"available"`
}

// Link is a directed edge in the topology graph.
// Active=false signals the endpoint is not ready and should render as a broken/grey line.
type Link struct {
	From string `json:"from"`
	To   string `json:"to"`
	// Active=false when the endpoint behind the link is not ready.
	Active bool `json:"active"`
	// Type hints the rendering layer: "internet" | "lb" | "service" | "pod"
	Type string `json:"type,omitempty"`
}

// Metrics is a placeholder for Prometheus-sourced data (future work).
type Metrics struct {
	RPS       float64 `json:"rps"`
	Latency   string  `json:"latency"`
	ErrorRate float64 `json:"errorRate"`
}
