import type {
  K8sMoleculeGraph,
  K8sMoleculeClusterNode,
  K8sMoleculeDeploymentNode,
  K8sMoleculePodNode,
} from "../types/k8sMolecule";

const NODE_COLORS = [
  { color: "#45caff", glow: "#0088dd" },
  { color: "#ff6b9d", glow: "#dd2266" },
  { color: "#ffd666", glow: "#cc9900" },
  { color: "#5bffb0", glow: "#00cc66" },
  { color: "#7c6bff", glow: "#4422ee" },
  { color: "#ff8c42", glow: "#ff5500" },
];

const DEPLOYMENTS_PER_NODE = [2, 3, 4];
const PODS_PER_DEPLOYMENT = [1, 2, 3, 4];
const POD_STATUSES: ("Running" | "Pending" | "CrashLoopBackOff")[] = [
  "Running",
  "Running",
  "Running",
  "Running",
  "Pending",
];

const CONTAINER_NAMES = [
  ["nginx"],
  ["api-server", "sidecar"],
  ["frontend"],
  ["backend", "cache"],
  ["worker"],
  ["database"],
];

export function generateK8sMoleculeGraph(): K8sMoleculeGraph {
  const nodes: K8sMoleculeClusterNode[] = [];
  const nodeCount = 5;
  
  const angleStep = (Math.PI * 2) / nodeCount;
  const radius = 200;

  for (let i = 0; i < nodeCount; i++) {
    const angle = i * angleStep;
    const nodeColor = NODE_COLORS[i % NODE_COLORS.length]!;
    
    const deploymentCount = DEPLOYMENTS_PER_NODE[Math.floor(Math.random() * DEPLOYMENTS_PER_NODE.length)]!;
    const deployments: K8sMoleculeDeploymentNode[] = [];
    
    const nodeId = `node-${i}`;
    
    const deployAngleStep = (Math.PI * 2) / deploymentCount;
    const deployRadius = 80;
    
    for (let d = 0; d < deploymentCount; d++) {
      const deployAngle = d * deployAngleStep;
      const deployId = `${nodeId}-deploy-${d}`;
      
      const podCount = PODS_PER_DEPLOYMENT[Math.floor(Math.random() * PODS_PER_DEPLOYMENT.length)]!;
      const pods: K8sMoleculePodNode[] = [];
      
      const podAngleStep = (Math.PI * 2) / podCount;
      const podRadius = 35;
      
      for (let p = 0; p < podCount; p++) {
        const podAngle = p * podAngleStep;
        const podId = `${deployId}-pod-${p}`;
        
        const deployX = Math.cos(angle) * radius + Math.cos(deployAngle) * deployRadius;
        const deployY = Math.sin(angle) * radius + Math.sin(deployAngle) * deployRadius;
        
        pods.push({
          id: podId,
          kind: "Pod",
          name: `pod-${i}-${d}-${p}`,
          x: deployX + Math.cos(podAngle) * podRadius,
          y: deployY + Math.sin(podAngle) * podRadius,
          color: nodeColor.color,
          glow: nodeColor.glow,
          size: 2.2,
          status: POD_STATUSES[Math.floor(Math.random() * POD_STATUSES.length)]!,
          containerNames: CONTAINER_NAMES[Math.floor(Math.random() * CONTAINER_NAMES.length)]!,
          parentId: deployId,
        });
      }
      
      deployments.push({
        id: deployId,
        kind: "Deployment",
        name: `deploy-${i}-${d}`,
        x: Math.cos(angle) * radius + Math.cos(deployAngle) * deployRadius,
        y: Math.sin(angle) * radius + Math.sin(deployAngle) * deployRadius,
        color: nodeColor.color,
        glow: nodeColor.glow,
        size: 4,
        replicas: podCount,
        containerNames: CONTAINER_NAMES[Math.floor(Math.random() * CONTAINER_NAMES.length)]!,
        pods,
        parentId: nodeId,
      });
    }
    
    nodes.push({
      id: nodeId,
      kind: "Node",
      name: `node-${i + 1}`,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      color: nodeColor.color,
      glow: nodeColor.glow,
      size: 6,
      deployments,
    });
  }

  return { nodes, edges: [] };
}

export function getAllNodesFlat(graph: K8sMoleculeGraph) {
  const flat: (K8sMoleculeClusterNode | K8sMoleculeDeploymentNode | K8sMoleculePodNode)[] = [];
  
  for (const node of graph.nodes) {
    if (node.kind === "Node") {
      flat.push(node);
      for (const deploy of node.deployments) {
        flat.push(deploy);
        for (const pod of deploy.pods) {
          flat.push(pod);
        }
      }
    }
  }
  
  return flat;
}
