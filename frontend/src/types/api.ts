import type { State, WorkloadKind } from "../lib/objectKey";

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
  version?: string;
  owner: ApiOwner;
  refs?: ApiRefs;
}

/** Names of objects a pod mounts or reads env from; contents are never sent. */
export interface ApiRefs {
  pvcs?: string[];
  configMaps?: string[];
  secrets?: string[];
}

export interface ApiWorkload {
  key: string;
  kind: WorkloadKind;
  id: string;
  namespace: string;
  state: State;
  desired: number;
  ready: number;
  /** Set for Jobs created by a CronJob. */
  owner?: ApiOwner;
}

export interface ApiPVC {
  key: string;
  namespace: string;
  name: string;
  phase: string;
  storageClass?: string;
}

export interface ApiHPA {
  key: string;
  namespace: string;
  name: string;
  /** Object key of the scaled workload. */
  target: string;
  min: number;
  max: number;
  current: number;
  desired: number;
}

export interface ApiNetworkPolicy {
  key: string;
  namespace: string;
  name: string;
  podKeys: string[];
}

export interface ApiNamespace {
  key: string;
  name: string;
  phase: string;
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
  workloads: ApiWorkload[];
  loadBalancers: ApiLoadBalancer[];
  pvcs: ApiPVC[];
  hpas: ApiHPA[];
  networkPolicies: ApiNetworkPolicy[];
  namespaces: ApiNamespace[];
  topology: ApiTopology[];
}

export interface ApiClustersResponse {
  clusters: ApiCluster[];
}

export interface ApiSnapshotEvent extends ApiClustersResponse {
  version: number;
}

type ApiList = { [K in keyof ApiCluster]: ApiCluster[K] extends unknown[] ? K : never }[keyof ApiCluster];

export interface ApiClusterPatch {
  id: string;
  upsert?: { [K in ApiList]?: ApiCluster[K] };
  /** Keys of removed objects; topology links use `from|to`. */
  remove?: { [K in ApiList]?: string[] };
  fields?: Partial<ApiCluster>;
}

/** Applies only to the snapshot at version `base`. */
export interface ApiPatchEvent {
  base: number;
  version: number;
  clusters: ApiClusterPatch[];
  addedClusters: ApiCluster[];
  removedClusters: string[];
}
