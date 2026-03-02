export interface Node {
  id: number;
  cluster: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  brightness: number;
  label: string;
}

export interface ProjectedNode extends Node {
  sx: number;
  sy: number;
  scale: number;
  depth: number;
}

export interface Edge {
  source: number;
  target: number;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface ClusterColor {
  core: string;
  glow: string;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  clusters: number;
}
