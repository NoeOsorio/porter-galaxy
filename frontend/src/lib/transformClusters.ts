import type { ApiClustersResponse, ApiPod } from "../types/api";
import type { ClusterGalaxyNode, ClusterGalaxyEdge, ClusterGalaxyGraph } from "../types/clusters";
import type { LayoutLink, LayoutNode } from "./layout/types";
import { STATE_COLORS, STATE_LABELS, objectKey, podDisplayName } from "./objectKey";

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
  deployment: { color: "#fb923c", glow: "#ea580c" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

// Pods stay tight around their Deployment; placement links (Deployment → the
// nodes its pods run on) are weak so Deployments group by namespace, not by node.
const LINK: Record<ClusterGalaxyEdge["type"], { distance: number; strength: number }> = {
  "cluster-node": { distance: 90, strength: 0.3 },
  "node-deployment": { distance: 160, strength: 0.02 },
  "deployment-pod": { distance: 26, strength: 0.8 },
  "node-pod": { distance: 40, strength: 0.4 },
};

// Cluster → Node → Deployment → Pod. Each Deployment appears once per cluster
// and links to every node that runs one of its pods; pods without a
// Deployment hang directly off their node.
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

    const podsByDeployment = new Map<string, ApiPod[]>();
    const podsWithoutDeployment: ApiPod[] = [];
    for (const pod of apiCluster.pods) {
      if (pod.owner.kind === "Deployment" && pod.owner.name) {
        const depKey = objectKey("deployment", pod.namespace, pod.owner.name);
        podsByDeployment.set(depKey, [...(podsByDeployment.get(depKey) ?? []), pod]);
      } else {
        podsWithoutDeployment.push(pod);
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

    for (const dep of [...apiCluster.deployments].sort((a, b) => a.key.localeCompare(b.key))) {
      const depId = id(dep.key);
      const pods = podsByDeployment.get(dep.key) ?? [];
      const hostNodes = [...new Set(pods.map((p) => p.nodeId).filter((n) => k8sNodeNames.has(n)))];
      nodes.push({
        id: depId,
        type: "deployment",
        name: dep.id,
        namespace: dep.namespace,
        group: dep.namespace,
        cluster: clusterId,
        tier: 2,
        parent: hostNodes[0] ? id(objectKey("node", undefined, hostNodes[0])) : clusterId,
        ...(dep.state === "running" ? TYPE_COLORS.deployment : STATE_COLORS[dep.state]),
        size: 15,
        state: dep.state,
        status: `${dep.ready}/${dep.desired} ready`,
        metadata: { desired: dep.desired, ready: dep.ready, available: dep.available, clusterId },
      });
      for (const nodeName of hostNodes) {
        edges.push({
          from: id(objectKey("node", undefined, nodeName)),
          to: depId,
          type: "node-deployment",
          color: TYPE_COLORS.deployment.color,
        });
      }
      for (const pod of pods) addPod(pod, depId, "deployment-pod");
    }

    for (const pod of podsWithoutDeployment) {
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
