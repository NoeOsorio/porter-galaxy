import type { State } from "../lib/objectKey";

export type TopologyNodeType = "internet" | "loadbalancer" | "ingress" | "service" | "deployment" | "pod";

export interface TopologyNode {
  /** Object key (kind/namespace/name). */
  id: string;
  type: TopologyNodeType;
  name: string;
  namespace?: string;
  /** Namespace, or "_" for Internet and load balancers; groups the layout. */
  group: string;
  /** Vertical band from Internet (0) down to Pod (5). */
  tier: number;
  /** Upstream node a new node is placed next to. */
  parent?: string;
  color: string;
  glow: string;
  size: number;
  status?: string;
  state?: State;
  metadata?: {
    address?: string;
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
  type: "internet" | "lb" | "ingress" | "service" | "owns";
  active: boolean;
  color: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
