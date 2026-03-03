export interface ApiNode {
  id: string;
  capacity: {
    cpu: string;
    memory: string;
  };
  status: string;
}

export interface ApiPod {
  id: string;
  namespace: string;
  nodeId: string;
  status: string;
  version?: string;
  controllerId?: string;
}

export interface ApiDeployment {
  id: string;
  namespace: string;
  desired: number;
  ready: number;
  available: number;
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
  topology: ApiTopology[];
  metrics: Record<string, unknown>;
}

export interface ApiClustersResponse {
  clusters: ApiCluster[];
}
