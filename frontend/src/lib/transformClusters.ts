import type { ApiCluster, ApiClustersResponse, ApiPod } from "../types/api";
import type { ClusterGalaxyNode, ClusterGalaxyEdge, ClusterGalaxyGraph } from "../types/clusters";
import type { LayoutLink, LayoutNode } from "./layout/types";
import type { LabelCandidate } from "../components/Labels";
import {
  REF_STYLE,
  STATE_COLORS,
  STATE_LABELS,
  WORKLOAD_STYLE,
  isWorkloadKind,
  objectKey,
  podDisplayName,
  workloadKey,
  type RefKind,
  workloadStatus,
} from "./objectKey";

const CLUSTER_COLORS = [
  { color: "#00d4ff", glow: "#0088dd" },
  { color: "#f472b6", glow: "#ec4899" },
  { color: "#a78bfa", glow: "#7c3aed" },
  { color: "#fb923c", glow: "#ea580c" },
  { color: "#5bffb0", glow: "#00cc66" },
  { color: "#fbbf24", glow: "#f59e0b" },
];

const TYPE_COLORS = {
  node: { color: "#a78bfa", glow: "#7c3aed" },
  workload: { color: "#fb923c", glow: "#ea580c" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

// Pods stay tight around their workload; placement links (workload → the
// nodes its pods run on) are weak so workloads group by namespace, not by node.
const LINK: Record<ClusterGalaxyEdge["type"], { distance: number; strength: number }> = {
  "cluster-node": { distance: 90, strength: 0.3 },
  "node-workload": { distance: 160, strength: 0.02 },
  "workload-workload": { distance: 40, strength: 0.6 },
  "workload-pod": { distance: 26, strength: 0.8 },
  "node-pod": { distance: 40, strength: 0.4 },
  ref: { distance: 36, strength: 0.4 },
};

// Cluster → Node → Workload → Pod, with CronJob → Job → Pod. Each workload
// appears once per cluster and links to every node that runs one of its pods;
// pods without an owner hang directly off their node.
export function transformClusters(apiData: ApiClustersResponse): ClusterGalaxyGraph {
  const nodes: ClusterGalaxyNode[] = [];
  const edges: ClusterGalaxyEdge[] = [];

  apiData.clusters.forEach((apiCluster, clusterIndex) => {
    const clusterId = apiCluster.id;
    const id = (key: string) => `${clusterId}::${key}`;
    const clusterColor = CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]!;

    nodes.push({
      id: clusterId,
      type: "cluster",
      name: clusterId,
      group: "_",
      cluster: clusterId,
      tier: 0,
      ...clusterColor,
      size: 40,
      metadata: { clusterId },
    });

    const k8sNodeNames = new Set<string>();
    for (const n of [...apiCluster.nodes].sort((a, b) => a.key.localeCompare(b.key))) {
      k8sNodeNames.add(n.id);
      nodes.push({
        id: id(n.key),
        type: "node",
        name: n.id,
        group: "_",
        cluster: clusterId,
        tier: 1,
        parent: clusterId,
        ...(n.state === "running" ? TYPE_COLORS.node : STATE_COLORS[n.state]),
        size: 25,
        state: n.state,
        status: STATE_LABELS[n.state],
        metadata: { cpu: n.capacity.cpu, memory: n.capacity.memory, clusterId },
      });
      edges.push({ from: clusterId, to: id(n.key), type: "cluster-node", color: TYPE_COLORS.node.color });
    }

    const workloadKeys = new Set(apiCluster.workloads.map((w) => w.key));
    const podsByWorkload = new Map<string, ApiPod[]>();
    const podsWithoutWorkload: ApiPod[] = [];
    for (const pod of apiCluster.pods) {
      const ownerKey = isWorkloadKind(pod.owner.kind) && pod.owner.name ? workloadKey(pod.owner.kind, pod.namespace, pod.owner.name) : null;
      if (ownerKey && workloadKeys.has(ownerKey)) {
        podsByWorkload.set(ownerKey, [...(podsByWorkload.get(ownerKey) ?? []), pod]);
      } else {
        podsWithoutWorkload.push(pod);
      }
    }

    const addPod = (pod: ApiPod, parentId: string, edgeType: ClusterGalaxyEdge["type"]) => {
      nodes.push({
        id: id(pod.key),
        type: "pod",
        name: podDisplayName(pod),
        namespace: pod.namespace,
        group: pod.namespace,
        cluster: clusterId,
        tier: 3,
        parent: parentId,
        ...STATE_COLORS[pod.state],
        size: 8,
        state: pod.state,
        pulse: pod.recentRestart,
        status: STATE_LABELS[pod.state],
        metadata: {
          version: pod.version,
          nodeId: pod.nodeId,
          clusterId,
          owner: pod.owner.kind === "standalone" ? "standalone" : `${pod.owner.kind}/${pod.owner.name}`,
        },
      });
      edges.push({ from: parentId, to: id(pod.key), type: edgeType, color: TYPE_COLORS.pod.color });
    };

    for (const w of [...apiCluster.workloads].sort((a, b) => a.key.localeCompare(b.key))) {
      const wId = id(w.key);
      const pods = podsByWorkload.get(w.key) ?? [];
      const hostNodes = [...new Set(pods.map((p) => p.nodeId).filter((n) => k8sNodeNames.has(n)))];
      const ownerId = w.owner && isWorkloadKind(w.owner.kind) && w.owner.name ? id(workloadKey(w.owner.kind, w.namespace, w.owner.name)) : null;
      const style = WORKLOAD_STYLE[w.kind];
      nodes.push({
        id: wId,
        type: "workload",
        kind: w.kind,
        name: w.id,
        namespace: w.namespace,
        group: w.namespace,
        cluster: clusterId,
        tier: 2,
        parent: ownerId ?? (hostNodes[0] ? id(objectKey("node", undefined, hostNodes[0])) : clusterId),
        ...(w.state === "running" || w.state === "completed" ? { color: style.color, glow: style.glow } : STATE_COLORS[w.state]),
        size: 15,
        state: w.state,
        status: workloadStatus(w).status,
        metadata: { ...workloadStatus(w).replicas, clusterId },
      });
      if (ownerId) {
        edges.push({ from: ownerId, to: wId, type: "workload-workload", color: TYPE_COLORS.workload.color });
      }
      for (const nodeName of hostNodes) {
        edges.push({
          from: id(objectKey("node", undefined, nodeName)),
          to: wId,
          type: "node-workload",
          color: TYPE_COLORS.workload.color,
        });
      }
      for (const pod of pods) addPod(pod, wId, "workload-pod");
    }

    for (const pod of podsWithoutWorkload) {
      const parentId = k8sNodeNames.has(pod.nodeId) ? id(objectKey("node", undefined, pod.nodeId)) : clusterId;
      addPod(pod, parentId, "node-pod");
    }
  });

  return { nodes, edges };
}

export function clustersLayoutInput(graph: ClusterGalaxyGraph): { nodes: LayoutNode[]; links: LayoutLink[] } {
  return {
    nodes: graph.nodes.map((n) => ({ key: n.id, group: n.group, cluster: n.cluster, tier: n.tier, radius: n.size, parent: n.parent })),
    links: graph.edges.map((e) => ({ source: e.from, target: e.to, ...LINK[e.type] })),
  };
}

/** Clusters and namespaces first, then Deployments by pod count, nodes; Pods only up close. */
export function clustersLabels(graph: ClusterGalaxyGraph): LabelCandidate[] {
  const podsPer = new Map<string, number>();
  for (const e of graph.edges) if (e.type === "workload-pod") podsPer.set(e.from, (podsPer.get(e.from) ?? 0) + 1);
  const maxPods = Math.max(1, ...podsPer.values());
  const groups = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (n.group === "_") continue;
    const id = `${n.cluster}/${n.group}`;
    groups.set(id, [...(groups.get(id) ?? []), n.id]);
  }
  const maxGroup = Math.max(1, ...[...groups.values()].map((k) => k.length));

  const out: LabelCandidate[] = [...groups].map(([id, keys]) => ({
    id: `group:${id}`,
    text: id.slice(id.indexOf("/") + 1),
    rank: 1 - keys.length / maxGroup,
    keys,
    style: "group",
  }));
  for (const n of graph.nodes) {
    const base = { id: n.id, text: n.name, keys: [n.id], radius: n.size };
    if (n.type === "cluster") out.push({ ...base, rank: 0, style: "primary" });
    else if (n.type === "workload") out.push({ ...base, rank: 2 - (podsPer.get(n.id) ?? 0) / maxPods, style: "primary" });
    else if (n.type === "node") out.push({ ...base, rank: 3, style: "secondary" });
    else if (n.type === "pod") out.push({ ...base, rank: 5, style: "detail", maxDistance: 220 });
    else out.push({ ...base, rank: 3, style: "secondary" });
  }
  return out;
}

/** Same as topologyWithRefs, for the Clusters view's `<clusterId>::<key>` ids. */
export function clustersWithRefs(graph: ClusterGalaxyGraph, apiData: ApiClustersResponse | null, selectedId: string | null): ClusterGalaxyGraph {
  if (!selectedId || !apiData) return graph;
  const sep = selectedId.indexOf("::");
  if (sep < 0) return graph;
  const clusterId = selectedId.slice(0, sep);
  const cluster: ApiCluster | undefined = apiData.clusters.find((c) => c.id === clusterId);
  const pod = cluster?.pods.find((p) => p.key === selectedId.slice(sep + 2));
  if (!pod?.refs || !graph.nodes.some((n) => n.id === selectedId)) return graph;
  const extra: ClusterGalaxyNode[] = [];
  const add = (kind: RefKind, names: string[] | undefined) => {
    for (const name of names ?? []) {
      extra.push({
        id: `${clusterId}::${kind}/${pod.namespace}/${name}`,
        type: kind,
        name,
        namespace: pod.namespace,
        group: pod.namespace,
        cluster: clusterId,
        tier: 4,
        parent: selectedId,
        color: REF_STYLE[kind].color,
        glow: REF_STYLE[kind].glow,
        size: 7,
        status: REF_STYLE[kind].label,
      });
    }
  };
  add("pvc", pod.refs.pvcs);
  add("configmap", pod.refs.configMaps);
  add("secret", pod.refs.secrets);
  return {
    nodes: [...graph.nodes, ...extra],
    edges: [...graph.edges, ...extra.map((n) => ({ from: selectedId, to: n.id, type: "ref" as const, color: "#94a3b8" }))],
  };
}
