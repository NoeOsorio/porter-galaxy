import type { State, WorkloadKind } from "../lib/objectKey";

export type TopologyNodeType =
  | "internet"
  | "loadbalancer"
  | "ingress"
  | "service"
  | "workload"
  | "pod"
  | "pvc"
  | "configmap"
  | "secret";

export interface TopologyNode {
  /** Object key (kind/namespace/name). */
  id: string;
  type: TopologyNodeType;
  /** Set on workload nodes. */
  kind?: WorkloadKind;
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
  /** A container restarted within the last 10 minutes. */
  pulse?: boolean;
  /** Usage over requests (pods) or allocatable (nodes); drives size and glow. */
  load?: number;
  metadata?: {
    address?: string;
    desired?: number;
    ready?: number;
    version?: string;
    nodeId?: string;
    connections?: number;
  };
}

export interface TopologyEdge {
  from: string;
  to: string;
  type: "internet" | "lb" | "ingress" | "service" | "owns" | "ref";
  active: boolean;
  color: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
