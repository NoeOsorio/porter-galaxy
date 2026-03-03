export interface ClusterGalaxyNode {
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
  metadata?: {
    cpu?: string;
    memory?: string;
    desired?: number;
    ready?: number;
    available?: number;
    version?: string;
    nodeId?: string;
    clusterId?: string;
    controllerId?: string;
  };
}

export interface ClusterGalaxyEdge {
  from: string;
  to: string;
  type: "cluster-node" | "node-deployment" | "deployment-pod";
  color: string;
}

export interface ClusterGalaxyGraph {
  nodes: ClusterGalaxyNode[];
  edges: ClusterGalaxyEdge[];
}

export interface ClusterConstellation {
  clusterId: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  nodes: ClusterGalaxyNode[];
  edges: ClusterGalaxyEdge[];
}
