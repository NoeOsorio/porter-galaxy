import type { ApiCluster } from "../types/api";
import type {
  K8sMoleculeClusterNode,
  K8sMoleculeDeploymentNode,
  K8sMoleculePodNode,
} from "../types/k8sMolecule";

export interface K8sMoleculeClusterEntity {
  id: string;
  kind: "Cluster";
  name: string;
  x: number;
  y: number;
  color: string;
  glow: string;
  size: number;
  nodes: K8sMoleculeClusterNode[];
}

const NODE_COLORS = [
  { color: "#45caff", glow: "#0088dd" },
  { color: "#ff6b9d", glow: "#dd2266" },
  { color: "#ffd666", glow: "#cc9900" },
  { color: "#5bffb0", glow: "#00cc66" },
  { color: "#7c6bff", glow: "#4422ee" },
  { color: "#ff8c42", glow: "#ff5500" },
];

export interface TransformedClusterData {
  cluster: K8sMoleculeClusterEntity;
  nodes: K8sMoleculeClusterNode[];
  deployments: K8sMoleculeDeploymentNode[];
  pods: K8sMoleculePodNode[];
}

export function transformClusterData(
  apiCluster: ApiCluster
): TransformedClusterData {
  const nodeCount = apiCluster.nodes.length;
  const angleStep = (Math.PI * 2) / nodeCount;
  const radius = 200;

  const nodes: K8sMoleculeClusterNode[] = [];
  const allDeployments: K8sMoleculeDeploymentNode[] = [];
  const allPods: K8sMoleculePodNode[] = [];

  apiCluster.nodes.forEach((apiNode, i) => {
    const angle = i * angleStep;
    const nodeColor = NODE_COLORS[i % NODE_COLORS.length]!;

    const nodeX = Math.cos(angle) * radius;
    const nodeY = Math.sin(angle) * radius;

    const nodeDeployments = apiCluster.deployments.filter((dep) => {
      const nodePods = apiCluster.pods.filter(
        (pod) => pod.nodeId === apiNode.id
      );
      return nodePods.some((pod) => pod.namespace === dep.namespace);
    });

    const deploymentCount = nodeDeployments.length || 1;
    const deployAngleStep = (Math.PI * 2) / deploymentCount;
    const deployRadius = 80;

    const deployments: K8sMoleculeDeploymentNode[] = [];

    nodeDeployments.forEach((apiDep, d) => {
      const deployAngle = d * deployAngleStep;
      const deployX = nodeX + Math.cos(deployAngle) * deployRadius;
      const deployY = nodeY + Math.sin(deployAngle) * deployRadius;

      const depPods = apiCluster.pods.filter(
        (pod) =>
          pod.nodeId === apiNode.id && pod.namespace === apiDep.namespace
      );

      const podCount = depPods.length || 1;
      const podAngleStep = (Math.PI * 2) / podCount;
      const podRadius = 35;

      const pods: K8sMoleculePodNode[] = [];

      depPods.forEach((apiPod, p) => {
        const podAngle = p * podAngleStep;
        const podX = deployX + Math.cos(podAngle) * podRadius;
        const podY = deployY + Math.sin(podAngle) * podRadius;

        const pod: K8sMoleculePodNode = {
          id: apiPod.id,
          kind: "Pod",
          name: apiPod.id.split("-").slice(-2).join("-"),
          x: podX,
          y: podY,
          color: nodeColor.color,
          glow: nodeColor.glow,
          size: 2.2,
          status:
            apiPod.status === "Running"
              ? "Running"
              : apiPod.status === "Pending"
                ? "Pending"
                : "CrashLoopBackOff",
          containerNames: ["container"],
          parentId: apiDep.id,
        };

        pods.push(pod);
        allPods.push(pod);
      });

      const deployment: K8sMoleculeDeploymentNode = {
        id: apiDep.id,
        kind: "Deployment",
        name: apiDep.id,
        x: deployX,
        y: deployY,
        color: nodeColor.color,
        glow: nodeColor.glow,
        size: 4,
        replicas: apiDep.desired,
        containerNames: ["container"],
        pods,
        parentId: apiNode.id,
      };

      deployments.push(deployment);
      allDeployments.push(deployment);
    });

    const node: K8sMoleculeClusterNode = {
      id: apiNode.id,
      kind: "Node",
      name: apiNode.id,
      x: nodeX,
      y: nodeY,
      color: nodeColor.color,
      glow: nodeColor.glow,
      size: 6,
      deployments,
    };

    nodes.push(node);
  });

  const cluster: K8sMoleculeClusterEntity = {
    id: apiCluster.id,
    kind: "Cluster",
    name: apiCluster.id,
    x: 0,
    y: 0,
    color: "#45caff",
    glow: "#0088dd",
    size: 10,
    nodes,
  };

  return {
    cluster,
    nodes,
    deployments: allDeployments,
    pods: allPods,
  };
}
