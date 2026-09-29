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
  warnings?: ApiWarning[];
  /** What pods can use of the node; the reference for usage. */
  allocatable?: ApiResources;
  usage?: ApiResources;
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
  restarts?: number;
  lastTermination?: ApiTermination;
  /** A container terminated within the last 10 minutes. */
  recentRestart?: boolean;
  warnings?: ApiWarning[];
  /** Sum of the containers' requests; the reference for usage. */
  requests?: ApiResources;
  /** Absent when the cluster has no metrics API or the pod has no sample yet. */
  usage?: ApiResources;
}

export interface ApiResources {
  cpuMillis: number;
  memoryBytes: number;
}

export interface ApiTermination {
  reason: string;
  exitCode: number;
  /** RFC 3339 time. */
  at: string;
}

/** A Warning event; at most 10 per object, newest first, none older than 1 hour. */
export interface ApiWarning {
  reason: string;
  message: string;
  count: number;
  /** RFC 3339 time. */
  lastSeen: string;
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
  warnings?: ApiWarning[];
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
  /** False when the cluster does not serve metrics.k8s.io; no usage is sent. */
  metricsAvailable: boolean;
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
