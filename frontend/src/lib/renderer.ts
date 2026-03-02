import type { Node, ProjectedNode, Edge } from "../types/graph";

export interface Viewport {
  width: number;
  height: number;
}

export interface Rotation {
  x: number;
  y: number;
}

export function project(
  node: { x: number; y: number; z: number },
  rotation: Rotation,
  viewport: Viewport,
  zoom: number
): { sx: number; sy: number; scale: number; depth: number } {
  const { x, y, z } = node;
  const cosX = Math.cos(rotation.x), sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y), sinY = Math.sin(rotation.y);

  let px = x * cosY - z * sinY;
  let pz = x * sinY + z * cosY;
  let py = y * cosX - pz * sinX;
  pz = y * sinX + pz * cosX;

  const perspective = 800;
  const scale = (perspective / (perspective + pz)) * zoom;
  return {
    sx: viewport.width / 2 + px * scale,
    sy: viewport.height / 2 + py * scale,
    scale,
    depth: pz,
  };
}

export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, "0"));
  gradient.addColorStop(0.4, color + Math.round(alpha * 0.3 * 255).toString(16).padStart(2, "0"));
  gradient.addColorStop(1, color + "00");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function projectNodes(
  nodes: Node[],
  rotation: Rotation,
  viewport: Viewport,
  zoom: number
): ProjectedNode[] {
  return nodes
    .map((n) => ({ ...n, ...project(n, rotation, viewport, zoom) }))
    .sort((a, b) => b.depth - a.depth);
}

export function drawEdges(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedNode[],
  edges: Edge[],
  clusterColors: { core: string }[],
  highlighted?: Set<number>
): void {
  const byId = new Map(projected.map((n) => [n.id, n]));

  for (const edge of edges) {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) continue;

    const isHighlighted = highlighted?.has(edge.source) || highlighted?.has(edge.target);
    if (isHighlighted) continue; // drawn separately

    const alpha = Math.max(0.02, 0.08 * Math.min(s.scale, t.scale));
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = clusterColors[s.cluster].core + Math.round(alpha * 255).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.moveTo(s.sx, s.sy);
    ctx.lineTo(t.sx, t.sy);
    ctx.stroke();
  }
}

export function drawHighlightedEdges(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedNode[],
  edges: Edge[],
  nodeId: number,
  color: string
): void {
  const byId = new Map(projected.map((n) => [n.id, n]));
  ctx.lineWidth = 1;
  ctx.strokeStyle = color + "66";

  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (s && t) {
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      ctx.lineTo(t.sx, t.sy);
      ctx.stroke();
    }
  }
}
