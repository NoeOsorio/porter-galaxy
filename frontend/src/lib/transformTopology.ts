import type { ApiCluster, ApiPod } from "../types/api";
import type { TopologyNode, TopologyEdge, TopologyGraph, TopologyNodeType } from "../types/topology";
import type { LayoutLink, LayoutNode } from "./layout/types";
import type { LabelCandidate } from "../components/Labels";
import {
  INTERNET_KEY,
  REF_STYLE,
  STATE_COLORS,
  STATE_LABELS,
  WORKLOAD_STYLE,
  isWorkloadKind,
  parseKey,
  podDisplayName,
  workloadKey,
  type RefKind,
} from "./objectKey";

const COLORS: Record<Exclude<TopologyNodeType, "pod" | "workload" | RefKind>, { color: string; glow: string }> = {
  internet: { color: "#00d4ff", glow: "#0088dd" },
  loadbalancer: { color: "#f472b6", glow: "#ec4899" },
  ingress: { color: "#a78bfa", glow: "#7c3aed" },
  service: { color: "#38bdf8", glow: "#0284c7" },
};

const EDGE_COLORS: Record<TopologyEdge["type"], string> = {
  internet: "#00d4ff",
  lb: "#f472b6",
  ingress: "#a78bfa",
  service: "#38bdf8",
  owns: "#5bffb0",
  ref: "#94a3b8",
};

const TIER: Record<TopologyNodeType, number> = {
  internet: 0,
  loadbalancer: 1,
  ingress: 2,
  service: 3,
  workload: 4,
  pod: 5,
  pvc: 6,
  configmap: 6,
  secret: 6,
};

const SIZE: Record<TopologyNodeType, number> = {
  internet: 30,
  loadbalancer: 20,
  ingress: 18,
  service: 15,
  workload: 16,
  pod: 12,
  pvc: 10,
  configmap: 10,
  secret: 10,
};

// Short, strong links keep a Deployment's pods tight around it; routing links
// are looser so namespaces can spread.
const LINK: Record<TopologyEdge["type"], { distance: number; strength: number }> = {
  internet: { distance: 120, strength: 0.05 },
  lb: { distance: 90, strength: 0.1 },
  ingress: { distance: 60, strength: 0.3 },
  service: { distance: 45, strength: 0.5 },
  owns: { distance: 28, strength: 0.8 },
  ref: { distance: 40, strength: 0.4 },
};

type PartialNode = Omit<TopologyNode, "size" | "group" | "tier" | "parent">;

export function transformTopology(apiCluster: ApiCluster): TopologyGraph {
  const podsByKey = new Map(apiCluster.pods.map((p) => [p.key, p]));
  const workloadsByKey = new Map(apiCluster.workloads.map((w) => [w.key, w]));
  const lbsByKey = new Map(apiCluster.loadBalancers.map((lb) => [lb.key, lb]));

  const nodes = new Map<string, PartialNode>();
  const edges = new Map<string, TopologyEdge>();

  const addEdge = (from: string, to: string, type: TopologyEdge["type"], active: boolean) => {
    const id = `${from}|${to}`;
    const existing = edges.get(id);
    if (existing) {
      existing.active = existing.active || active;
      return;
    }
    edges.set(id, { from, to, type, active, color: EDGE_COLORS[type] });
  };

  const addKindNode = (key: string, type: keyof typeof COLORS) => {
    if (nodes.has(key)) return;
    const { namespace, name } = parseKey(key);
    const lb = lbsByKey.get(key);
    nodes.set(key, {
      id: key,
      type,
      name: type === "internet" ? "INTERNET" : lb?.displayName ?? name,
      namespace: type === "loadbalancer" ? undefined : namespace,
      ...COLORS[type],
      metadata: lb?.address ? { address: lb.address } : undefined,
    });
  };

  const addWorkloadNode = (key: string) => {
    const w = workloadsByKey.get(key);
    if (nodes.has(key) || !w) return;
    nodes.set(key, {
      id: key,
      type: "workload",
      kind: w.kind,
      name: w.id,
      namespace: w.namespace,
      color: WORKLOAD_STYLE[w.kind].color,
      glow: WORKLOAD_STYLE[w.kind].glow,
      state: w.state,
      status: `${w.ready}/${w.desired} ready`,
      metadata: { desired: w.desired, ready: w.ready },
    });
  };

  const addPodNode = (pod: ApiPod) => {
    if (nodes.has(pod.key)) return;
    nodes.set(pod.key, {
      id: pod.key,
      type: "pod",
      name: podDisplayName(pod),
      namespace: pod.namespace,
      ...STATE_COLORS[pod.state],
      state: pod.state,
      status: STATE_LABELS[pod.state],
      metadata: { version: pod.version, nodeId: pod.nodeId },
    });
  };

  for (const link of apiCluster.topology) {
    switch (link.type) {
      case "internet":
        addKindNode(INTERNET_KEY, "internet");
        addKindNode(link.to, "loadbalancer");
        addEdge(link.from, link.to, "internet", link.active);
        break;
      case "lb": {
        addKindNode(link.from, "loadbalancer");
        const toKind = parseKey(link.to).kind;
        addKindNode(link.to, toKind === "ingress" ? "ingress" : "service");
        addEdge(link.from, link.to, "lb", link.active);
        break;
      }
      case "ingress":
        addKindNode(link.from, "ingress");
        addKindNode(link.to, "service");
        addEdge(link.from, link.to, "ingress", link.active);
        break;
      case "service": {
        const pod = podsByKey.get(link.to);
        if (!pod) break; // endpoint for a pod the cache has not seen yet
        addKindNode(link.from, "service");
        addPodNode(pod);
        const ownerKey = isWorkloadKind(pod.owner.kind) && pod.owner.name ? workloadKey(pod.owner.kind, pod.namespace, pod.owner.name) : null;
        if (ownerKey && workloadsByKey.has(ownerKey)) {
          addWorkloadNode(ownerKey);
          addEdge(link.from, ownerKey, "service", link.active);
          addEdge(ownerKey, pod.key, "owns", link.active);
        } else {
          addEdge(link.from, pod.key, "service", link.active);
        }
        break;
      }
    }
  }

  const outgoing = new Map<string, number>();
  for (const e of edges.values()) outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);

  const parentOf = new Map<string, string>();
  for (const e of edges.values()) if (!parentOf.has(e.to)) parentOf.set(e.to, e.from);

  const placed: TopologyNode[] = [...nodes.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      ...n,
      group: n.namespace ?? "_",
      tier: TIER[n.type],
      parent: parentOf.get(n.id),
      size: SIZE[n.type],
      metadata: { ...n.metadata, connections: Math.max(1, outgoing.get(n.id) ?? 0) },
    }));

  return { nodes: placed, edges: [...edges.values()] };
}

export function topologyLayoutInput(graph: TopologyGraph): { nodes: LayoutNode[]; links: LayoutLink[] } {
  return {
    nodes: graph.nodes.map((n) => ({ key: n.id, group: n.group, cluster: "_", tier: n.tier, radius: n.size, parent: n.parent })),
    links: graph.edges.map((e) => ({ source: e.from, target: e.to, ...LINK[e.type] })),
  };
}

/** Namespaces first, then Deployments by pod count, then the rest; Pods only up close. */
export function topologyLabels(graph: TopologyGraph): LabelCandidate[] {
  const podsPer = new Map<string, number>();
  for (const e of graph.edges) if (e.type === "owns") podsPer.set(e.from, (podsPer.get(e.from) ?? 0) + 1);
  const maxPods = Math.max(1, ...podsPer.values());
  const groups = new Map<string, string[]>();
  for (const n of graph.nodes) if (n.group !== "_") groups.set(n.group, [...(groups.get(n.group) ?? []), n.id]);
  const maxGroup = Math.max(1, ...[...groups.values()].map((k) => k.length));

  const out: LabelCandidate[] = [...groups].map(([group, keys]) => ({
    id: `group:${group}`,
    text: group,
    rank: 1 - keys.length / maxGroup,
    keys,
    style: "group",
  }));
  for (const n of graph.nodes) {
    const base = { id: n.id, text: n.name, keys: [n.id], radius: n.size };
    if (n.type === "workload") out.push({ ...base, rank: 2 - (podsPer.get(n.id) ?? 0) / maxPods, style: "primary" });
    else if (n.type === "pod") out.push({ ...base, rank: 5, style: "detail", maxDistance: 260 });
    else out.push({ ...base, rank: n.type === "internet" ? 2 : 3, style: "secondary" });
  }
  return out;
}

/**
 * The selected pod's PVC, ConfigMap, and Secret references as extra nodes.
 * They exist only while the pod is selected, so shared references never turn
 * the whole graph into a hairball.
 */
export function topologyWithRefs(graph: TopologyGraph, apiCluster: ApiCluster | undefined, selectedId: string | null): TopologyGraph {
  const pod = selectedId ? apiCluster?.pods.find((p) => p.key === selectedId) : undefined;
  const podNode = pod && graph.nodes.find((n) => n.id === pod.key);
  if (!pod?.refs || !podNode) return graph;
  const extra: TopologyNode[] = [];
  const add = (kind: RefKind, names: string[] | undefined) => {
    for (const name of names ?? []) {
      extra.push({
        id: `${kind}/${pod.namespace}/${name}`,
        type: kind,
        name,
        namespace: pod.namespace,
        group: pod.namespace,
        tier: TIER[kind],
        parent: pod.key,
        size: SIZE[kind],
        color: REF_STYLE[kind].color,
        glow: REF_STYLE[kind].glow,
        status: REF_STYLE[kind].label,
      });
    }
  };
  add("pvc", pod.refs.pvcs);
  add("configmap", pod.refs.configMaps);
  add("secret", pod.refs.secrets);
  return {
    nodes: [...graph.nodes, ...extra],
    edges: [...graph.edges, ...extra.map((n) => ({ from: pod.key, to: n.id, type: "ref" as const, active: true, color: EDGE_COLORS.ref }))],
  };
}
