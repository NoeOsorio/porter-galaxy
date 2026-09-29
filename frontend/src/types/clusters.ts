import type { RefKind, State, WorkloadKind } from "../lib/objectKey";

export interface ClusterGalaxyNode {
  /** `<clusterId>::<object key>`; the cluster node itself uses the cluster ID. */
  id: string;
  type: "cluster" | "node" | "workload" | "pod" | RefKind;
  /** Set on workload nodes. */
  kind?: WorkloadKind;
  name: string;
  namespace?: string;
  /** Namespace, or "_" for clusters and nodes; groups the layout. */
  group: string;
  cluster: string;
  /** Vertical band: cluster 0, node 1, workload 2, pod 3, references 4. */
  tier: number;
  /** Node a new node is placed next to. */
  parent?: string;
  color: string;
  glow: string;
  size: number;
  status?: string;
  state?: State;
  /** A container restarted within the last 10 minutes. */
  pulse?: boolean;
  /** Usage over requests (pods) or allocatable (nodes); drives size and glow. */
  load?: number;
  metadata?: {
    cpu?: string;
    memory?: string;
    desired?: number;
    ready?: number;
    available?: number;
    version?: string;
    nodeId?: string;
    clusterId?: string;
    owner?: string;
  };
}

export interface ClusterGalaxyEdge {
  from: string;
  to: string;
  type: "cluster-node" | "node-workload" | "workload-workload" | "workload-pod" | "node-pod" | "ref";
  color: string;
}

export interface ClusterGalaxyGraph {
  nodes: ClusterGalaxyNode[];
  edges: ClusterGalaxyEdge[];
}
