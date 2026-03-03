export interface TopologyNode {
  id: string;
  type: "internet" | "loadbalancer" | "deployment" | "pod";
  name: string;
  namespace?: string;
  x: number;
  y: number;
  z: number;
  color: string;
  glow: string;
  size: number;
  status?: string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  type: "internet" | "lb" | "service";
  active: boolean;
  color: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
