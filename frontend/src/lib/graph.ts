import type { Graph, Node, Edge } from "../types/graph";

export function generateGraph(nodeCount = 600, clusterCount = 6): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodesPerCluster = Math.floor(nodeCount / clusterCount);

  for (let c = 0; c < clusterCount; c++) {
    const angle = (c / clusterCount) * Math.PI * 2;
    const armRadius = 200 + Math.random() * 80;
    const cx = Math.cos(angle) * armRadius;
    const cy = Math.sin(angle) * armRadius;
    const cz = (Math.random() - 0.5) * 60;

    for (let i = 0; i < nodesPerCluster; i++) {
      const spread = 40 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * spread;

      nodes.push({
        id: nodes.length,
        cluster: c,
        x: cx + r * Math.sin(phi) * Math.cos(theta),
        y: cy + r * Math.sin(phi) * Math.sin(theta),
        z: cz + r * Math.cos(phi) * 0.4,
        vx: 0,
        vy: 0,
        size: 0.5 + Math.random() * 2.5,
        brightness: 0.3 + Math.random() * 0.7,
        label: `node-${nodes.length}`,
      });
    }
  }

  for (let c = 0; c < clusterCount; c++) {
    const clusterNodes = nodes.filter((n) => n.cluster === c);
    for (let i = 0; i < clusterNodes.length; i++) {
      const connections = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < connections; j++) {
        const target = clusterNodes[Math.floor(Math.random() * clusterNodes.length)];
        if (target.id !== clusterNodes[i].id) {
          edges.push({ source: clusterNodes[i].id, target: target.id });
        }
      }
    }
  }

  for (let i = 0; i < clusterCount * 3; i++) {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const b = nodes[Math.floor(Math.random() * nodes.length)];
    if (a.cluster !== b.cluster) {
      edges.push({ source: a.id, target: b.id });
    }
  }

  return { nodes, edges };
}

export function forceStep(nodes: Node[], edges: Edge[], alpha = 0.01): void {
  const repulsion = 800;
  const attraction = 0.0003;
  const centerGravity = 0.001;

  for (let i = 0; i < nodes.length; i++) {
    let fx = 0, fy = 0;

    fx -= nodes[i].x * centerGravity;
    fy -= nodes[i].y * centerGravity;

    // Sample ~20 random nodes for repulsion (O(n) approximation)
    for (let s = 0; s < 20; s++) {
      const j = Math.floor(Math.random() * nodes.length);
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = repulsion / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }

    nodes[i].vx = nodes[i].vx * 0.9 + fx * alpha;
    nodes[i].vy = nodes[i].vy * 0.9 + fy * alpha;
    nodes[i].x += nodes[i].vx;
    nodes[i].y += nodes[i].vy;
  }

  for (const edge of edges) {
    const s = nodes[edge.source];
    const t = nodes[edge.target];
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const force = dist * attraction;
    s.vx += dx * force;
    s.vy += dy * force;
    t.vx -= dx * force;
    t.vy -= dy * force;
  }
}
