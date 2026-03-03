import type { ApiCluster } from "../types/api";
import type { TopologyNode, TopologyEdge, TopologyGraph } from "../types/topology";

const COLORS = {
  internet: { color: "#00d4ff", glow: "#0088dd" },
  loadbalancer: { color: "#c084fc", glow: "#9333ea" },
  deployment: { color: "#fb923c", glow: "#ea580c" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

const EDGE_COLORS = {
  internet: "#00d4ff",
  lb: "#c084fc",
  service: "#5bffb0",
};

function arrangeNodesInCircle(
  count: number,
  radius: number,
  centerY: number,
  centerZ: number,
  yVariation: number = 0
): Array<{ x: number; y: number; z: number }> {
  const positions: Array<{ x: number; y: number; z: number }> = [];
  
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const y = centerY + (yVariation > 0 ? (Math.random() - 0.5) * yVariation : 0);
    
    positions.push({ x, y, z });
  }
  
  return positions;
}

function arrangeNodesInSphere(
  count: number,
  radius: number,
  centerX: number,
  centerY: number,
  centerZ: number
): Array<{ x: number; y: number; z: number }> {
  const positions: Array<{ x: number; y: number; z: number }> = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * i / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / count);
    
    const x = centerX + radius * Math.sin(phi) * Math.cos(theta);
    const y = centerY + radius * Math.sin(phi) * Math.sin(theta);
    const z = centerZ + radius * Math.cos(phi);
    
    positions.push({ x, y, z });
  }
  
  return positions;
}

export function transformTopology(apiCluster: ApiCluster): TopologyGraph {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number; z: number }>();

  const internetNodes = new Set<string>();
  const lbNodes = new Set<string>();
  const deploymentNodes = new Set<string>();
  const podNodes = new Set<string>();
  
  const connectionCounts = new Map<string, number>();

  apiCluster.topology.forEach((topo) => {
    connectionCounts.set(topo.from, (connectionCounts.get(topo.from) || 0) + 1);
    
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
    const y = 80;
    const z = 0;
    nodePositions.set(internet, { x, y, z });
    const outgoingConnections = connectionCounts.get(internet) || 0;
    nodes.push({
      id: internet,
      type: "internet",
      name: "INTERNET",
      x,
      y,
      z,
      color: COLORS.internet.color,
      glow: COLORS.internet.glow,
      size: 30,
      metadata: {
        connections: outgoingConnections === 0 ? 1 : outgoingConnections,
      },
    });
  }

  if (lbNodes.size > 0) {
    const lbs = Array.from(lbNodes);
    const lbPositions = arrangeNodesInCircle(lbs.length, 80, 30, -60, 30);
    
    lbs.forEach((lb, i) => {
      const pos = lbPositions[i]!;
      nodePositions.set(lb, pos);
      
      const lbName = lb.includes("elb") 
        ? lb.split("-").slice(-1)[0]?.substring(0, 8) || "LB"
        : "Load Balancer";
      
      const outgoingConnections = connectionCounts.get(lb) || 0;
      
      nodes.push({
        id: lb,
        type: "loadbalancer",
        name: lbName,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        color: COLORS.loadbalancer.color,
        glow: COLORS.loadbalancer.glow,
        size: 20,
        metadata: {
          connections: outgoingConnections === 0 ? 1 : outgoingConnections,
        },
      });
    });
  }

  if (deploymentNodes.size > 0) {
    const deployments = Array.from(deploymentNodes);
    const depPositions = arrangeNodesInCircle(deployments.length, 120, -30, -150, 40);
    
    deployments.forEach((depKey, i) => {
      const [namespace, deploymentId] = depKey.split("/");
      const deployment = apiCluster.deployments.find(
        (d) => d.id === deploymentId && d.namespace === namespace
      );
      
      const pos = depPositions[i]!;
      nodePositions.set(depKey, pos);
      
      const outgoingConnections = connectionCounts.get(depKey) || 0;
      
      nodes.push({
        id: depKey,
        type: "deployment",
        name: deploymentId || depKey,
        namespace,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        color: COLORS.deployment.color,
        glow: COLORS.deployment.glow,
        size: 16,
        status: deployment ? `${deployment.ready}/${deployment.desired}` : undefined,
        metadata: {
          desired: deployment?.desired,
          ready: deployment?.ready,
          available: deployment?.available,
          connections: outgoingConnections === 0 ? 1 : outgoingConnections,
        },
      });
    });
  }

  if (podNodes.size > 0) {
    const pods = Array.from(podNodes);
    const podPositions = arrangeNodesInSphere(pods.length, 130, 0, -100, -280);
    
    pods.forEach((podId, i) => {
      const pod = apiCluster.pods.find((p) => p.id === podId);
      const pos = podPositions[i]!;
      
      nodePositions.set(podId, pos);
      
      const outgoingConnections = connectionCounts.get(podId) || 0;
      
      nodes.push({
        id: podId,
        type: "pod",
        name: podId.split("-").slice(0, 2).join("-"),
        namespace: pod?.namespace,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        color: COLORS.pod.color,
        glow: COLORS.pod.glow,
        size: 12,
        status: pod?.status,
        metadata: {
          version: pod?.version,
          nodeId: pod?.nodeId,
          connections: outgoingConnections === 0 ? 1 : outgoingConnections,
        },
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
