import type { State } from "../lib/objectKey";

// Mirrors backend/internal/cluster/types.go (see specs/001-truthful-graph-and-camera/contracts/snapshot.md).

export interface ApiNode {
  key: string;
  id: string;
  state: State;
  capacity: {
    cpu: string;
    memory: string;
  };
  status: string;
}

export interface ApiOwner {
  kind: string;
  name?: string;
}

export interface ApiPod {
  key: string;
  id: string;
  namespace: string;
  nodeId: string;
  state: State;
  status: string;
  version?: string;
  owner: ApiOwner;
  /** @deprecated Read `owner`; removed in spec 001 T030. */
  controllerId?: string;
}

export interface ApiDeployment {
  key: string;
  id: string;
  namespace: string;
  state: State;
  desired: number;
  ready: number;
  available: number;
}

export interface ApiLoadBalancer {
  key: string;
  displayName: string;
  address?: string;
}

export interface ApiTopology {
  from: string;
  to: string;
  active: boolean;
  type: string;
}

export interface ApiCluster {
  id: string;
  nodes: ApiNode[];
  pods: ApiPod[];
  deployments: ApiDeployment[];
  loadBalancers: ApiLoadBalancer[];
  topology: ApiTopology[];
  metrics: Record<string, unknown>;
}

export interface ApiClustersResponse {
  clusters: ApiCluster[];
}
