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

const NODE_COLORS = [
  { color: "#45caff", glow: "#0088dd" },
  { color: "#ff6b9d", glow: "#dd2266" },
  { color: "#ffd666", glow: "#cc9900" },
  { color: "#5bffb0", glow: "#00cc66" },
  { color: "#7c6bff", glow: "#4422ee" },
  { color: "#ff8c42", glow: "#ff5500" },
];

export function transformClusters(
  apiData: ApiClustersResponse
): ClusterGalaxyGraph {
  const allNodes: ClusterGalaxyNode[] = [];
  const allEdges: ClusterGalaxyEdge[] = [];

  const clusterCount = apiData.clusters.length;
  const clusterRadius = 500;
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
      y: clusterCenterY,
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
    const nodeRadius = 200;
    const nodeAngleStep = (Math.PI * 2) / nodeCount;

    apiCluster.nodes.forEach((apiNode, nodeIndex) => {
      const nodeAngle = nodeIndex * nodeAngleStep;
      const nodeColor = NODE_COLORS[nodeIndex % NODE_COLORS.length]!;

      const nodeX = clusterCenterX + Math.cos(nodeAngle) * nodeRadius;
      const nodeY = clusterCenterY + Math.sin(nodeAngle) * nodeRadius * 0.3;
      const nodeZ = clusterCenterZ + Math.sin(nodeAngle) * nodeRadius;

      const k8sNode: ClusterGalaxyNode = {
        id: apiNode.id,
        type: "node",
        name: apiNode.id,
        x: nodeX,
        y: nodeY,
        z: nodeZ,
        color: nodeColor.color,
        glow: nodeColor.glow,
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
        to: apiNode.id,
        type: "cluster-node",
        color: clusterColor.color,
      });

      const podsOnThisNode = apiCluster.pods.filter(
        (pod) => pod.nodeId === apiNode.id
      );

      const deploymentMap = new Map<string, typeof apiCluster.deployments[0]>();
      apiCluster.deployments.forEach((dep) => {
        deploymentMap.set(`${dep.namespace}/${dep.id}`, dep);
      });

      const deploymentsOnNode = new Map<string, typeof apiCluster.pods>();
      podsOnThisNode.forEach((pod) => {
        const depKey = pod.controllerId
          ? `${pod.namespace}/${pod.controllerId}`
          : `${pod.namespace}/standalone`;
        if (!deploymentsOnNode.has(depKey)) {
          deploymentsOnNode.set(depKey, []);
        }
        deploymentsOnNode.get(depKey)!.push(pod);
      });

      const deploymentCount = deploymentsOnNode.size || 1;
      const deploymentRadius = 80;
      const deploymentAngleStep = (Math.PI * 2) / deploymentCount;

      let deploymentIdx = 0;
      deploymentsOnNode.forEach((pods, depKey) => {
        const deploymentAngle = deploymentIdx * deploymentAngleStep;
        const deploymentX =
          nodeX + Math.cos(deploymentAngle) * deploymentRadius;
        const deploymentY =
          nodeY + Math.sin(deploymentAngle) * deploymentRadius * 0.5;
        const deploymentZ =
          nodeZ + Math.sin(deploymentAngle) * deploymentRadius;

        const [namespace, deploymentId] = depKey.split("/");
        const deploymentData = deploymentMap.get(depKey);

        const deployment: ClusterGalaxyNode = {
          id: depKey,
          type: "deployment",
          name: deploymentId || depKey,
          namespace,
          x: deploymentX,
          y: deploymentY,
          z: deploymentZ,
          color: nodeColor.color,
          glow: nodeColor.glow,
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
          from: apiNode.id,
          to: depKey,
          type: "node-deployment",
          color: nodeColor.color,
        });

        const podCount = pods.length || 1;
        const podRadius = 35;
        const podAngleStep = (Math.PI * 2) / podCount;

        pods.forEach((apiPod, podIdx) => {
          const podAngle = podIdx * podAngleStep;
          const podX = deploymentX + Math.cos(podAngle) * podRadius;
          const podY = deploymentY + Math.sin(podAngle) * podRadius * 0.3;
          const podZ = deploymentZ + Math.sin(podAngle) * podRadius;

          const pod: ClusterGalaxyNode = {
            id: apiPod.id,
            type: "pod",
            name: apiPod.id.split("-").slice(-2).join("-"),
            namespace: apiPod.namespace,
            x: podX,
            y: podY,
            z: podZ,
            color: nodeColor.color,
            glow: nodeColor.glow,
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
            to: apiPod.id,
            type: "deployment-pod",
            color: nodeColor.color,
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
  graph: ClusterGalaxyGraph
): ClusterConstellation[] {
  const constellations: ClusterConstellation[] = [];

  const clusterNodes = graph.nodes.filter((n) => n.type === "cluster");

  clusterNodes.forEach((clusterNode) => {
    const nodesInCluster = graph.nodes.filter(
      (n) => n.metadata?.clusterId === clusterNode.id
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
