import type { ApiClustersResponse } from "../types/api";
import type {
  ClusterGalaxyNode,
  ClusterGalaxyEdge,
  ClusterGalaxyGraph,
  ClusterConstellation,
} from "../types/clusters";

const CLUSTER_COLORS = [
  { color: "#00d4ff", glow: "#0088dd" },
  { color: "#f472b6", glow: "#ec4899" },
  { color: "#a78bfa", glow: "#7c3aed" },
  { color: "#fb923c", glow: "#ea580c" },
  { color: "#5bffb0", glow: "#00cc66" },
  { color: "#fbbf24", glow: "#f59e0b" },
];

const TYPE_COLORS = {
  cluster: { color: "#00d4ff", glow: "#0088dd" },
  node: { color: "#a78bfa", glow: "#7c3aed" },
  deployment: { color: "#fb923c", glow: "#ea580c" },
  pod: { color: "#5bffb0", glow: "#00cc66" },
};

export function transformClusters(
  apiData: ApiClustersResponse,
): ClusterGalaxyGraph {
  const allNodes: ClusterGalaxyNode[] = [];
  const allEdges: ClusterGalaxyEdge[] = [];

  const clusterCount = apiData.clusters.length;
  const clusterRadius = 600;
  const clusterAngleStep = (Math.PI * 2) / clusterCount;

  apiData.clusters.forEach((apiCluster, clusterIndex) => {
    const clusterAngle = clusterIndex * clusterAngleStep;
    const clusterCenterX = Math.cos(clusterAngle) * clusterRadius;
    const clusterCenterY = 0;
    const clusterCenterZ = Math.sin(clusterAngle) * clusterRadius;

    const clusterColor = CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]!;

    const clusterNode: ClusterGalaxyNode = {
      id: apiCluster.id,
      type: "cluster",
      name: apiCluster.id,
      x: clusterCenterX,
      y: clusterCenterY + 250,
      z: clusterCenterZ,
      color: clusterColor.color,
      glow: clusterColor.glow,
      size: 40,
      metadata: {
        clusterId: apiCluster.id,
      },
    };
    allNodes.push(clusterNode);

    const nodeCount = apiCluster.nodes.length;
    const nodeRadius = 180;
    const nodeAngleStep = (Math.PI * 2) / nodeCount;

    apiCluster.nodes.forEach((apiNode, nodeIndex) => {
      const nodeAngle = nodeIndex * nodeAngleStep;

      const nodeX = clusterCenterX + Math.cos(nodeAngle) * nodeRadius;
      const nodeY = clusterCenterY + 120;
      const nodeZ = clusterCenterZ - 120 + Math.sin(nodeAngle) * nodeRadius;

      const nodeFullId = `${apiCluster.id}::node::${apiNode.id}`;

      const k8sNode: ClusterGalaxyNode = {
        id: nodeFullId,
        type: "node",
        name: apiNode.id,
        x: nodeX,
        y: nodeY,
        z: nodeZ,
        color: TYPE_COLORS.node.color,
        glow: TYPE_COLORS.node.glow,
        size: 25,
        status: apiNode.status,
        metadata: {
          cpu: apiNode.capacity.cpu,
          memory: apiNode.capacity.memory,
          clusterId: apiCluster.id,
        },
      };
      allNodes.push(k8sNode);

      allEdges.push({
        from: apiCluster.id,
        to: nodeFullId,
        type: "cluster-node",
        color: TYPE_COLORS.node.color,
      });

      const podsOnThisNode = apiCluster.pods.filter(
        (pod) => pod.nodeId === apiNode.id,
      );

      const deploymentMap = new Map<
        string,
        (typeof apiCluster.deployments)[0]
      >();
      apiCluster.deployments.forEach((dep) => {
        deploymentMap.set(
          `${apiCluster.id}::deployment::${dep.namespace}/${dep.id}`,
          dep,
        );
      });

      const deploymentsOnNode = new Map<string, typeof apiCluster.pods>();
      podsOnThisNode.forEach((pod) => {
        const depKey = pod.controllerId
          ? `${apiCluster.id}::deployment::${pod.namespace}/${pod.controllerId}`
          : `${apiCluster.id}::deployment::${pod.namespace}/standalone`;
        if (!deploymentsOnNode.has(depKey)) {
          deploymentsOnNode.set(depKey, []);
        }
        deploymentsOnNode.get(depKey)!.push(pod);
      });

      const deploymentCount = deploymentsOnNode.size || 1;
      const deploymentRadius = 140;
      const deploymentAngleStep = (Math.PI * 2) / deploymentCount;

      let deploymentIdx = 0;
      deploymentsOnNode.forEach((pods, depKey) => {
        const deploymentAngle = deploymentIdx * deploymentAngleStep;
        const deploymentX =
          nodeX + Math.cos(deploymentAngle) * deploymentRadius;
        const deploymentY = clusterCenterY - 40;
        const deploymentZ =
          nodeZ - 120 + Math.sin(deploymentAngle) * deploymentRadius;

        const depKeyParts = depKey.split("::");
        const namespaceAndId = depKeyParts[2] || depKey;
        const [namespace, deploymentId] = namespaceAndId.split("/");
        const deploymentData = deploymentMap.get(depKey);

        const deployment: ClusterGalaxyNode = {
          id: depKey,
          type: "deployment",
          name: deploymentId || depKey,
          namespace,
          x: deploymentX,
          y: deploymentY,
          z: deploymentZ,
          color: TYPE_COLORS.deployment.color,
          glow: TYPE_COLORS.deployment.glow,
          size: 15,
          status: deploymentData
            ? `${deploymentData.ready}/${deploymentData.desired}`
            : undefined,
          metadata: {
            desired: deploymentData?.desired,
            ready: deploymentData?.ready,
            available: deploymentData?.available,
            nodeId: apiNode.id,
            clusterId: apiCluster.id,
          },
        };
        allNodes.push(deployment);

        allEdges.push({
          from: nodeFullId,
          to: depKey,
          type: "node-deployment",
          color: TYPE_COLORS.deployment.color,
        });

        const podCount = pods.length || 1;
        const podRadius = 55;
        const podAngleStep = (Math.PI * 2) / podCount;

        pods.forEach((apiPod, podIdx) => {
          const podAngle = podIdx * podAngleStep;
          const podX = deploymentX + Math.cos(podAngle) * podRadius;
          const podY = clusterCenterY - 180;
          const podZ = deploymentZ - 120 + Math.sin(podAngle) * podRadius;

          const podFullId = `${apiCluster.id}::pod::${apiPod.id}`;

          const pod: ClusterGalaxyNode = {
            id: podFullId,
            type: "pod",
            name: apiPod.id.split("-").slice(-2).join("-"),
            namespace: apiPod.namespace,
            x: podX,
            y: podY,
            z: podZ,
            color: TYPE_COLORS.pod.color,
            glow: TYPE_COLORS.pod.glow,
            size: 8,
            status: apiPod.status,
            metadata: {
              version: apiPod.version,
              nodeId: apiPod.nodeId,
              clusterId: apiCluster.id,
              controllerId: apiPod.controllerId,
            },
          };
          allNodes.push(pod);

          allEdges.push({
            from: depKey,
            to: podFullId,
            type: "deployment-pod",
            color: TYPE_COLORS.pod.color,
          });
        });

        deploymentIdx++;
      });
    });
  });

  return {
    nodes: allNodes,
    edges: allEdges,
  };
}

export function getConstellations(
  graph: ClusterGalaxyGraph,
): ClusterConstellation[] {
  const constellations: ClusterConstellation[] = [];

  const clusterNodes = graph.nodes.filter((n) => n.type === "cluster");

  clusterNodes.forEach((clusterNode) => {
    const nodesInCluster = graph.nodes.filter(
      (n) => n.metadata?.clusterId === clusterNode.id,
    );

    const edgesInCluster = graph.edges.filter((e) => {
      const fromNode = graph.nodes.find((n) => n.id === e.from);
      const toNode = graph.nodes.find((n) => n.id === e.to);
      return (
        fromNode?.metadata?.clusterId === clusterNode.id ||
        toNode?.metadata?.clusterId === clusterNode.id
      );
    });

    constellations.push({
      clusterId: clusterNode.id,
      centerX: clusterNode.x,
      centerY: clusterNode.y,
      centerZ: clusterNode.z,
      radius: 250,
      nodes: [clusterNode, ...nodesInCluster],
      edges: edgesInCluster,
    });
  });

  return constellations;
}
