import type { State } from "../lib/objectKey";

export interface ClusterGalaxyNode {
  /** `<clusterId>::<object key>`; the cluster node itself uses the cluster ID. */
  id: string;
  type: "cluster" | "node" | "deployment" | "pod";
  name: string;
  namespace?: string;
  x: number;
  y: number;
  z: number;
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
