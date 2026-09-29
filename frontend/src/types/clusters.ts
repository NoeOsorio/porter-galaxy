import type { State } from "../lib/objectKey";

export interface ClusterGalaxyNode {
  /** `<clusterId>::<object key>`; the cluster node itself uses the cluster ID. */
  id: string;
  type: "cluster" | "node" | "deployment" | "pod";
  name: string;
  namespace?: string;
  /** Namespace, or "_" for clusters and nodes; groups the layout. */
  group: string;
  cluster: string;
  /** Vertical band: cluster 0, node 1, deployment 2, pod 3. */
  tier: number;
  /** Node a new node is placed next to. */
  parent?: string;
  color: string;
  glow: string;
  size: number;
  status?: string;
  state?: State;
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
  type: "cluster-node" | "node-deployment" | "deployment-pod" | "node-pod";
  color: string;
}

export interface ClusterGalaxyGraph {
  nodes: ClusterGalaxyNode[];
  edges: ClusterGalaxyEdge[];
}
