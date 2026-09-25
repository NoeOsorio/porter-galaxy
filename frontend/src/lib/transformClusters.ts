import type { ApiClustersResponse, ApiPod } from "../types/api";
import type { ClusterGalaxyNode, ClusterGalaxyEdge, ClusterGalaxyGraph } from "../types/clusters";
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

const CLUSTER_RING = 600;
const NODE_RING = 200;
const DEPLOYMENT_RING = 380;
const POD_RING = 60;

function ring(i: number, count: number, radius: number, cx: number, cz: number) {
  const angle = (i * Math.PI * 2) / Math.max(count, 1);
  return { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius };
}

// Cluster → Node → Deployment → Pod. Each Deployment appears once per cluster
// and links to every node that runs one of its pods; pods without a
// Deployment hang directly off their node.
export function transformClusters(apiData: ApiClustersResponse): ClusterGalaxyGraph {
  const nodes: ClusterGalaxyNode[] = [];
  const edges: ClusterGalaxyEdge[] = [];

  apiData.clusters.forEach((apiCluster, clusterIndex) => {
    const clusterId = apiCluster.id;
    const id = (key: string) => `${clusterId}::${key}`;
    const center = ring(clusterIndex, apiData.clusters.length, apiData.clusters.length > 1 ? CLUSTER_RING : 0, 0, 0);
    const clusterColor = CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]!;

    nodes.push({
      id: clusterId,
      type: "cluster",
      name: clusterId,
      x: center.x,
      y: 250,
      z: center.z,
      ...clusterColor,
      size: 40,
      metadata: { clusterId },
    });

    const nodePos = new Map<string, { x: number; z: number }>();
    const k8sNodes = [...apiCluster.nodes].sort((a, b) => a.key.localeCompare(b.key));
    k8sNodes.forEach((n, i) => {
      const pos = ring(i, k8sNodes.length, NODE_RING, center.x, center.z);
      nodePos.set(n.id, pos);
      nodes.push({
        id: id(n.key),
        type: "node",
        name: n.id,
        x: pos.x,
        y: 120,
        z: pos.z,
        ...(n.state === "running" ? TYPE_COLORS.node : STATE_COLORS[n.state]),
        size: 25,
        state: n.state,
        status: STATE_LABELS[n.state],
        metadata: { cpu: n.capacity.cpu, memory: n.capacity.memory, clusterId },
      });
      edges.push({ from: clusterId, to: id(n.key), type: "cluster-node", color: TYPE_COLORS.node.color });
    });

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

    const addPod = (pod: ApiPod, parentId: string, index: number, count: number, around: { x: number; z: number }, edgeType: ClusterGalaxyEdge["type"]) => {
      const pos = ring(index, count, POD_RING, around.x, around.z);
      nodes.push({
        id: id(pod.key),
        type: "pod",
        name: podDisplayName(pod),
        namespace: pod.namespace,
        x: pos.x,
        y: -180,
        z: pos.z,
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

    const deployments = [...apiCluster.deployments].sort((a, b) => a.key.localeCompare(b.key));
    deployments.forEach((dep, i) => {
      const pos = ring(i, deployments.length, DEPLOYMENT_RING, center.x, center.z);
      const depId = id(dep.key);
      nodes.push({
        id: depId,
        type: "deployment",
        name: dep.id,
        namespace: dep.namespace,
        x: pos.x,
        y: -40,
        z: pos.z,
        ...(dep.state === "running" ? TYPE_COLORS.deployment : STATE_COLORS[dep.state]),
        size: 15,
        state: dep.state,
        status: `${dep.ready}/${dep.desired} ready`,
        metadata: { desired: dep.desired, ready: dep.ready, available: dep.available, clusterId },
      });

      const pods = podsByDeployment.get(dep.key) ?? [];
      const hostNodes = new Set(pods.map((p) => p.nodeId).filter((n) => nodePos.has(n)));
      for (const nodeName of hostNodes) {
        edges.push({
          from: id(objectKey("node", undefined, nodeName)),
          to: depId,
          type: "node-deployment",
          color: TYPE_COLORS.deployment.color,
        });
      }
      pods.forEach((pod, j) => addPod(pod, depId, j, pods.length, pos, "deployment-pod"));
    });

    const looseByNode = new Map<string, ApiPod[]>();
    for (const pod of podsWithoutDeployment) {
      looseByNode.set(pod.nodeId, [...(looseByNode.get(pod.nodeId) ?? []), pod]);
    }
    for (const [nodeName, pods] of looseByNode) {
      const around = nodePos.get(nodeName) ?? center;
      const parentId = nodePos.has(nodeName) ? id(objectKey("node", undefined, nodeName)) : clusterId;
      pods.forEach((pod, j) => addPod(pod, parentId, j, pods.length, around, "node-pod"));
    }
  });

  return { nodes, edges };
}
