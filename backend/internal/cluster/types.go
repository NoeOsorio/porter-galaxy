package cluster

// Snapshot is the root payload broadcast to clients over SSE.
type Snapshot struct {
	Clusters []Cluster `json:"clusters"`
}

// Cluster represents a single Kubernetes cluster with its full observed topology.
type Cluster struct {
	ID            string             `json:"id"`
	Nodes         []NodeInfo         `json:"nodes"`
	Pods          []PodInfo          `json:"pods"`
	Deployments   []DeploymentInfo   `json:"deployments"`
	LoadBalancers []LoadBalancerInfo `json:"loadBalancers"`
	Topology      []Link             `json:"topology"`
	Metrics       map[string]Metrics `json:"metrics"`
}

// NodeInfo is the physical host that pods are scheduled onto.
type NodeInfo struct {
	Key        string            `json:"key"`
	ID         string            `json:"id"`
	State      State             `json:"state"`
	Capacity   map[string]string `json:"capacity"`
	Status     string            `json:"status"`
	Conditions []string          `json:"conditions,omitempty"` // DiskPressure, MemoryPressure, PIDPressure
}

// PodInfo is a running container workload.
type PodInfo struct {
	Key       string `json:"key"`
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	NodeID    string `json:"nodeId"`
	State     State  `json:"state"`
	Status    string `json:"status"`
	Version   string `json:"version,omitempty"`
	Owner     Owner  `json:"owner"`
	// ControllerID is Owner.Name when the owner is a Deployment. Deprecated:
	// kept until spec 001 T030 removes it; read Owner instead.
	ControllerID string `json:"controllerId,omitempty"`
}

// Owner is the workload that controls a pod, resolved through owner
// references (a ReplicaSet owned by a Deployment reports the Deployment).
// Kind is "standalone" and Name is empty when the pod has no controller.
type Owner struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
}

// DeploymentInfo is a Kubernetes Deployment workload.
type DeploymentInfo struct {
	Key       string `json:"key"`
	ID        string `json:"id"`
	State     State  `json:"state"`
	Namespace string `json:"namespace"`
	// Desired is the number of desired replicas (spec.replicas).
	Desired int32 `json:"desired"`
	// Ready is the number of replicas currently ready.
	Ready int32 `json:"ready"`
	// Available is the number of replicas available to serve traffic.
	Available int32 `json:"available"`
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

// Metrics is a placeholder for Prometheus-sourced data (future work).
type Metrics struct {
	RPS       float64 `json:"rps"`
	Latency   string  `json:"latency"`
	ErrorRate float64 `json:"errorRate"`
}
