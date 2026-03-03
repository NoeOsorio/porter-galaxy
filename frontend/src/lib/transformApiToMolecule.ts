import type { ApiCluster } from "../types/api";
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

export function transformApiToMoleculeGraph(
  apiCluster: ApiCluster
): K8sMoleculeGraph {
  const nodes: K8sMoleculeClusterNode[] = [];
  const nodeCount = apiCluster.nodes.length;

  const angleStep = (Math.PI * 2) / nodeCount;
  const radius = 200;

  apiCluster.nodes.forEach((apiNode, i) => {
    const angle = i * angleStep;
    const nodeColor = NODE_COLORS[i % NODE_COLORS.length]!;
    const nodeId = apiNode.id;

    const nodeDeployments = apiCluster.deployments.filter((deploy) => {
      const nodePods = apiCluster.pods.filter(
        (pod) => pod.nodeId === apiNode.id
      );
      return nodePods.some((pod) => pod.namespace === deploy.namespace);
    });

    const deployments: K8sMoleculeDeploymentNode[] = [];
    const deploymentCount = nodeDeployments.length || 1;
    const deployAngleStep = (Math.PI * 2) / deploymentCount;
    const deployRadius = 80;

    nodeDeployments.forEach((apiDeploy, d) => {
      const deployAngle = d * deployAngleStep;
      const deployId = `${nodeId}-${apiDeploy.namespace}-${apiDeploy.id}`;

      const deployPods = apiCluster.pods.filter(
        (pod) =>
          pod.nodeId === apiNode.id &&
          pod.namespace === apiDeploy.namespace &&
          pod.id.startsWith(apiDeploy.id)
      );

      const pods: K8sMoleculePodNode[] = [];
      const podCount = deployPods.length || 1;
      const podAngleStep = (Math.PI * 2) / podCount;
      const podRadius = 35;

      deployPods.forEach((apiPod, p) => {
        const podAngle = p * podAngleStep;
        const podId = apiPod.id;

        const deployX =
          Math.cos(angle) * radius + Math.cos(deployAngle) * deployRadius;
        const deployY =
          Math.sin(angle) * radius + Math.sin(deployAngle) * deployRadius;

        const containerNames = [apiPod.id.split("-").slice(0, 2).join("-")];

        pods.push({
          id: podId,
          kind: "Pod",
          name: apiPod.id,
          x: deployX + Math.cos(podAngle) * podRadius,
          y: deployY + Math.sin(podAngle) * podRadius,
          color: nodeColor.color,
          glow: nodeColor.glow,
          size: 2.2,
          status:
            apiPod.status === "Running"
              ? "Running"
              : apiPod.status === "Pending"
                ? "Pending"
                : "CrashLoopBackOff",
          containerNames,
          parentId: deployId,
        });
      });

      const containerNames = [apiDeploy.id];

      deployments.push({
        id: deployId,
        kind: "Deployment",
        name: `${apiDeploy.namespace}/${apiDeploy.id}`,
        x: Math.cos(angle) * radius + Math.cos(deployAngle) * deployRadius,
        y: Math.sin(angle) * radius + Math.sin(deployAngle) * deployRadius,
        color: nodeColor.color,
        glow: nodeColor.glow,
        size: 4,
        replicas: apiDeploy.desired,
        containerNames,
        pods,
        parentId: nodeId,
      });
    });

    nodes.push({
      id: nodeId,
      kind: "Node",
      name: apiNode.id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      color: nodeColor.color,
      glow: nodeColor.glow,
      size: 6,
      deployments,
    });
  });

  return { nodes, edges: [] };
}
