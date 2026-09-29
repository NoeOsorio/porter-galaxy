import type { ApiCluster, ApiHPA, ApiPod, ApiRefs, ApiWorkload, ApiPVC } from "../types/api";
import { REF_STYLE, WORKLOAD_STYLE, isWorkloadKind, parseKey, workloadKey, type RefKind, type WorkloadKind } from "./objectKey";

export interface ObjectDetails {
  /** Controllers above the object, outermost first (e.g. CronJob → Job). */
  owners: string[];
  workload?: ApiWorkload;
  pod?: ApiPod;
  hpa?: ApiHPA;
  /** Names of the NetworkPolicies that select this pod. */
  policies: string[];
  refs?: ApiRefs;
  pvc?: ApiPVC;
}

const TYPE_ICONS: Record<string, string> = {
  internet: "🌐",
  loadbalancer: "⚖️",
  ingress: "🚪",
  service: "🔀",
  pod: "⚛️",
  cluster: "🌌",
  node: "🖥️",
};

const TYPE_LABELS: Record<string, string> = {
  internet: "Internet",
  loadbalancer: "Load Balancer",
  ingress: "Ingress",
  service: "Service",
  pod: "Pod",
  cluster: "Cluster",
  node: "Node",
};

/** Icon and label for any node type the views draw. */
export function describeNode(type: string, kind?: WorkloadKind): { icon: string; label: string } {
  if (type === "workload" && kind) return { icon: WORKLOAD_STYLE[kind].icon, label: kind };
  if (type in REF_STYLE) return { icon: REF_STYLE[type as RefKind].icon, label: REF_STYLE[type as RefKind].label };
  return { icon: TYPE_ICONS[type] ?? "•", label: TYPE_LABELS[type] ?? type };
}

/** Everything the detail panel shows about the object with `key` in `cluster`. */
export function objectDetails(cluster: ApiCluster | undefined, key: string): ObjectDetails {
  const details: ObjectDetails = { owners: [], policies: [] };
  if (!cluster) return details;
  const workloads = new Map(cluster.workloads.map((w) => [w.key, w]));

  const ownerChain = (w: ApiWorkload | undefined) => {
    const chain: string[] = [];
    for (let cur = w; cur; ) {
      chain.unshift(`${cur.kind} ${cur.id}`);
      cur = cur.owner && isWorkloadKind(cur.owner.kind) && cur.owner.name ? workloads.get(workloadKey(cur.owner.kind, cur.namespace, cur.owner.name)) : undefined;
    }
    return chain;
  };

  const pod = cluster.pods.find((p) => p.key === key);
  if (pod) {
    details.pod = pod;
    details.refs = pod.refs;
    const owner = isWorkloadKind(pod.owner.kind) && pod.owner.name ? workloads.get(workloadKey(pod.owner.kind, pod.namespace, pod.owner.name)) : undefined;
    details.owners = owner ? ownerChain(owner) : pod.owner.kind === "standalone" ? [] : [`${pod.owner.kind} ${pod.owner.name ?? ""}`];
    details.policies = cluster.networkPolicies.filter((np) => np.podKeys.includes(key)).map((np) => np.name);
    return details;
  }

  const workload = workloads.get(key);
  if (workload) {
    details.workload = workload;
    details.owners = ownerChain(workload).slice(0, -1);
    details.hpa = cluster.hpas.find((h) => h.target === key);
    return details;
  }

  if (parseKey(key).kind === "pvc") details.pvc = cluster.pvcs.find((p) => p.key === key);
  return details;
}
