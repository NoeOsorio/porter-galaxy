import type {
  ClusterEntity,
  NodeEntity,
  DeploymentEntity,
  PodEntity,
} from "../types/cluster";

const LEVEL_COLORS: Record<string, string[]> = {
  cluster: ["#7c6bff"],
  node: ["#45caff", "#ff6b9d", "#ffd666", "#5bffb0", "#ff8c42", "#9d7bff", "#00d4aa", "#ff4d6a"],
  deployment: ["#45caff", "#ff6b9d", "#ffd666", "#5bffb0", "#ff8c42"],
  pod: ["#5bffb0", "#ffd666", "#45caff", "#ff6b9d"],
};

const POD_STATUSES = ["Running", "Running", "Running", "Pending"];

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export function distributeInSphere(
  count: number,
  parentRadius: number,
  seed = 0
): Point3[] {
  const points: Point3[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const r = parentRadius * Math.cbrt(rnd());
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    points.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
    });
  }
  return points;
}

function colorFor(level: keyof typeof LEVEL_COLORS, index: number): string {
  const palette = LEVEL_COLORS[level];
  return palette[index % palette.length] ?? "#ffffff";
}

export function generateClusterHierarchy(seed = 42): ClusterEntity {
  const clusterRadius = 80;
  const nodeRadius = 20;
  const deploymentRadius = 6;
  const podRadius = 2;

  const nodeCount = 5 + (seed % 4);
  const nodePositions = distributeInSphere(nodeCount, 70, seed);

  const nodes: NodeEntity[] = nodePositions.map((p, i) => {
    const deployCount = 2 + (seed + i) % 4;
    const deployPositions = distributeInSphere(
      deployCount,
      nodeRadius * 0.85,
      seed + 100 + i
    );
    const deployments: DeploymentEntity[] = deployPositions.map((dp, j) => {
      const podCount = 1 + (seed + i + j) % 4;
      const podPositions = distributeInSphere(
        podCount,
        deploymentRadius * 0.8,
        seed + 200 + i * 10 + j
      );
      const pods: PodEntity[] = podPositions.map((pp, k) => ({
        id: `pod-${i}-${j}-${k}`,
        name: `pod-${k + 1}`,
        x: p.x + dp.x + pp.x,
        y: p.y + dp.y + pp.y,
        z: p.z + dp.z + pp.z,
        radius: podRadius,
        color: colorFor("pod", k),
        level: "pod",
        status: POD_STATUSES[(seed + i + j + k) % POD_STATUSES.length],
      }));
      return {
        id: `deploy-${i}-${j}`,
        name: `deploy-${j + 1}`,
        x: p.x + dp.x,
        y: p.y + dp.y,
        z: p.z + dp.z,
        radius: deploymentRadius,
        color: colorFor("deployment", j),
        level: "deployment",
        replicas: pods.length,
        children: pods,
      };
    });
    return {
      id: `node-${i}`,
      name: `node-${i + 1}`,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: nodeRadius,
      color: colorFor("node", i),
      level: "node",
      children: deployments,
    };
  });

  return {
    id: "cluster",
    name: "Cluster",
    x: 0,
    y: 0,
    z: 0,
    radius: clusterRadius,
    color: colorFor("cluster", 0),
    level: "cluster",
    children: nodes,
  };
}
