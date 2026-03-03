import type { ApiCluster } from "../types/api";
import type { TopologyNode, TopologyEdge, TopologyGraph } from "../types/topology";

const COLORS = {
  internet: { color: "#45caff", glow: "#0088dd" },
  loadbalancer: { color: "#ff6b9d", glow: "#dd2266" },
  deployment: { color: "#ffd666", glow: "#cc9900" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

const EDGE_COLORS = {
  internet: "#45caff",
  lb: "#ff6b9d",
  service: "#5bffb0",
};

export function transformTopology(apiCluster: ApiCluster): TopologyGraph {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number; z: number }>();

  let currentY = 0;
  const layerSpacing = 250;
  const nodeSpacing = 200;

  const internetNodes = new Set<string>();
  const lbNodes = new Set<string>();
  const deploymentNodes = new Set<string>();
  const podNodes = new Set<string>();

  apiCluster.topology.forEach((topo) => {
    if (topo.from === "INTERNET") {
      internetNodes.add(topo.from);
      lbNodes.add(topo.to);
    } else if (topo.type === "lb") {
      lbNodes.add(topo.from);
      const [namespace, deploymentId] = topo.to.split("/");
      if (namespace && deploymentId) {
        deploymentNodes.add(topo.to);
      }
    } else if (topo.type === "service") {
      const [namespace, deploymentId] = topo.from.split("/");
      if (namespace && deploymentId) {
        deploymentNodes.add(topo.from);
      }
      podNodes.add(topo.to);
    }
  });

  if (internetNodes.size > 0) {
    const internet = Array.from(internetNodes)[0]!;
    const x = 0;
    const y = currentY;
    nodePositions.set(internet, { x, y, z: 0 });
      nodes.push({
        id: internet,
        type: "internet",
        name: "INTERNET",
        x,
        y,
        z: 0,
        color: COLORS.internet.color,
        glow: COLORS.internet.glow,
        size: 25,
      });
    currentY -= layerSpacing;
  }

  if (lbNodes.size > 0) {
    const lbs = Array.from(lbNodes);
    const startX = -(lbs.length - 1) * nodeSpacing / 2;
    lbs.forEach((lb, i) => {
      const x = startX + i * nodeSpacing;
      const y = currentY;
      nodePositions.set(lb, { x, y, z: 0 });
      
      const lbName = lb.includes("elb") 
        ? lb.split("-").slice(-1)[0]?.substring(0, 8) || "LB"
        : "Load Balancer";
      
      nodes.push({
        id: lb,
        type: "loadbalancer",
        name: lbName,
        x,
        y,
        z: 0,
        color: COLORS.loadbalancer.color,
        glow: COLORS.loadbalancer.glow,
        size: 18,
      });
    });
    currentY -= layerSpacing;
  }

  if (deploymentNodes.size > 0) {
    const deployments = Array.from(deploymentNodes);
    const startX = -(deployments.length - 1) * nodeSpacing / 2;
    deployments.forEach((depKey, i) => {
      const [namespace, deploymentId] = depKey.split("/");
      const deployment = apiCluster.deployments.find(
        (d) => d.id === deploymentId && d.namespace === namespace
      );
      
      const x = startX + i * nodeSpacing;
      const y = currentY;
      nodePositions.set(depKey, { x, y, z: 0 });
      
      nodes.push({
        id: depKey,
        type: "deployment",
        name: deploymentId || depKey,
        namespace,
        x,
        y,
        z: 0,
        color: COLORS.deployment.color,
        glow: COLORS.deployment.glow,
        size: 14,
        status: deployment ? `${deployment.ready}/${deployment.desired}` : undefined,
      });
    });
    currentY -= layerSpacing;
  }

  if (podNodes.size > 0) {
    const pods = Array.from(podNodes);
    const startX = -(pods.length - 1) * nodeSpacing / 2;
    pods.forEach((podId, i) => {
      const pod = apiCluster.pods.find((p) => p.id === podId);
      
      const x = startX + i * nodeSpacing;
      const y = currentY;
      nodePositions.set(podId, { x, y, z: 0 });
      
      nodes.push({
        id: podId,
        type: "pod",
        name: podId.split("-").slice(0, 2).join("-"),
        namespace: pod?.namespace,
        x,
        y,
        z: 0,
        color: COLORS.pod.color,
        glow: COLORS.pod.glow,
        size: 10,
        status: pod?.status,
      });
    });
  }

  apiCluster.topology.forEach((topo) => {
    const fromPos = nodePositions.get(topo.from);
    const toPos = nodePositions.get(topo.to);
    
    if (fromPos && toPos) {
      edges.push({
        from: topo.from,
        to: topo.to,
        type: topo.type as "internet" | "lb" | "service",
        active: topo.active,
        color: EDGE_COLORS[topo.type as keyof typeof EDGE_COLORS] || "#ffffff",
      });
    }
  });

  return { nodes, edges };
}
