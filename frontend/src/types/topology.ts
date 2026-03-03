export interface TopologyNode {
  id: string;
  type: "internet" | "loadbalancer" | "ingress" | "deployment" | "pod";
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
    desired?: number;
    ready?: number;
    available?: number;
    version?: string;
    nodeId?: string;
    connections?: number;
  };
}

export interface TopologyEdge {
  from: string;
  to: string;
  type: "internet" | "lb" | "ingress" | "service";
  active: boolean;
  color: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
