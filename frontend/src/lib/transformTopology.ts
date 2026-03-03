import type { ApiCluster } from "../types/api";
import type { TopologyNode, TopologyEdge, TopologyGraph } from "../types/topology";

const COLORS = {
  internet: { color: "#00d4ff", glow: "#0088dd" },
  loadbalancer: { color: "#f472b6", glow: "#ec4899" },
  ingress: { color: "#a78bfa", glow: "#7c3aed" },
  deployment: { color: "#fb923c", glow: "#ea580c" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

const EDGE_COLORS = {
  internet: "#00d4ff",
  lb: "#f472b6",
  ingress: "#a78bfa",
  service: "#5bffb0",
};

export function transformTopology(apiCluster: ApiCluster): TopologyGraph {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number; z: number }>();

  const internetNodes = new Set<string>();
  const lbNodes = new Set<string>();
  const ingressNodes = new Set<string>();
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
      if (topo.to.startsWith("ingress/")) {
        ingressNodes.add(topo.to);
      } else {
        const [namespace, deploymentId] = topo.to.split("/");
        if (namespace && deploymentId) {
          deploymentNodes.add(topo.to);
        }
      }
    } else if (topo.type === "ingress") {
      if (topo.from.startsWith("ingress/")) {
        ingressNodes.add(topo.from);
      }
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

  const lbToIngressMap = new Map<string, string[]>();
  const ingressToDeploymentMap = new Map<string, string[]>();
  const deploymentToPodsMap = new Map<string, string[]>();

  apiCluster.topology.forEach((topo) => {
    if (topo.type === "lb" && topo.to.startsWith("ingress/")) {
      const list = lbToIngressMap.get(topo.from) || [];
      list.push(topo.to);
      lbToIngressMap.set(topo.from, list);
    }
    if (topo.type === "ingress") {
      const list = ingressToDeploymentMap.get(topo.from) || [];
      list.push(topo.to);
      ingressToDeploymentMap.set(topo.from, list);
    }
    if (topo.type === "service") {
      const list = deploymentToPodsMap.get(topo.from) || [];
      list.push(topo.to);
      deploymentToPodsMap.set(topo.from, list);
    }
  });

  if (internetNodes.size > 0) {
    const internet = Array.from(internetNodes)[0]!;
    const x = 0;
    const y = 200;
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
    const radius = 120;
    const angleStep = (Math.PI * 2) / lbs.length;
    
    lbs.forEach((lb, i) => {
      const angle = i * angleStep;
      const x = Math.cos(angle) * radius;
      const z = -100 + Math.sin(angle) * radius;
      const y = 120;
      
      nodePositions.set(lb, { x, y, z });
      
      const lbName = lb.includes("elb") 
        ? lb.split("-").slice(-1)[0]?.substring(0, 8) || "LB"
        : lb.match(/\d+\.\d+\.\d+\.\d+/)
          ? lb.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || "LB"
          : "Load Balancer";
      
      const outgoingConnections = connectionCounts.get(lb) || 0;
      
      nodes.push({
        id: lb,
        type: "loadbalancer",
        name: lbName,
        x,
        y,
        z,
        color: COLORS.loadbalancer.color,
        glow: COLORS.loadbalancer.glow,
        size: 20,
        metadata: {
          connections: outgoingConnections === 0 ? 1 : outgoingConnections,
        },
      });
    });
  }

  if (ingressNodes.size > 0) {
    const ingresses = Array.from(ingressNodes);
    const radius = 160;
    const angleStep = (Math.PI * 2) / ingresses.length;
    
    ingresses.forEach((ingressKey, i) => {
      const angle = i * angleStep + Math.PI / ingresses.length;
      const x = Math.cos(angle) * radius;
      const z = -180 + Math.sin(angle) * radius;
      const y = 40;
      
      nodePositions.set(ingressKey, { x, y, z });
      
      const parts = ingressKey.split("/");
      const namespace = parts[1];
      const ingressName = parts[2] || "ingress";
      
      const outgoingConnections = connectionCounts.get(ingressKey) || 0;
      
      nodes.push({
        id: ingressKey,
        type: "ingress",
        name: ingressName,
        namespace,
        x,
        y,
        z,
        color: COLORS.ingress.color,
        glow: COLORS.ingress.glow,
        size: 18,
        metadata: {
          connections: outgoingConnections === 0 ? 1 : outgoingConnections,
        },
      });
    });
  }

  if (deploymentNodes.size > 0) {
    const deployments = Array.from(deploymentNodes);
    const radius = 220;
    const angleStep = (Math.PI * 2) / deployments.length;
    
    deployments.forEach((depKey, i) => {
      const [namespace, deploymentId] = depKey.split("/");
      const deployment = apiCluster.deployments.find(
        (d) => d.id === deploymentId && d.namespace === namespace
      );
      
      const angle = i * angleStep;
      const x = Math.cos(angle) * radius;
      const z = -260 + Math.sin(angle) * radius;
      const y = -40;
      
      nodePositions.set(depKey, { x, y, z });
      
      const outgoingConnections = connectionCounts.get(depKey) || 0;
      
      nodes.push({
        id: depKey,
        type: "deployment",
        name: deploymentId || depKey,
        namespace,
        x,
        y,
        z,
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
    
    const podsByDeployment = new Map<string, string[]>();
    pods.forEach((podId) => {
      const pod = apiCluster.pods.find((p) => p.id === podId);
      if (pod) {
        const parentDeployments = Array.from(deploymentNodes).filter((depKey) => {
          const [namespace] = depKey.split("/");
          return namespace === pod.namespace;
        });
        
        parentDeployments.forEach((depKey) => {
          const list = podsByDeployment.get(depKey) || [];
          list.push(podId);
          podsByDeployment.set(depKey, list);
        });
      }
    });

    const radius = 280;
    const angleStep = (Math.PI * 2) / pods.length;
    
    pods.forEach((podId, i) => {
      const pod = apiCluster.pods.find((p) => p.id === podId);
      
      const angle = i * angleStep + Math.PI / pods.length;
      const x = Math.cos(angle) * radius;
      const z = -340 + Math.sin(angle) * radius;
      const y = -120;
      
      nodePositions.set(podId, { x, y, z });
      
      const outgoingConnections = connectionCounts.get(podId) || 0;
      
      const podStatus = pod?.status;
      let podColor = { color: "#ff3333", glow: "#dd0000" };
      if (podStatus === "Running") {
        podColor = { color: "#5bffb0", glow: "#00cc66" };
      } else if (podStatus === "Pending") {
        podColor = { color: "#ffd666", glow: "#cc9900" };
      }
      
      nodes.push({
        id: podId,
        type: "pod",
        name: podId.split("-").slice(0, 2).join("-"),
        namespace: pod?.namespace,
        x,
        y,
        z,
        color: podColor.color,
        glow: podColor.glow,
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
        type: topo.type as "internet" | "lb" | "ingress" | "service",
        active: topo.active,
        color: EDGE_COLORS[topo.type as keyof typeof EDGE_COLORS] || "#ffffff",
      });
    }
  });

  return { nodes, edges };
}
