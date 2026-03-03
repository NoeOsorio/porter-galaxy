import { project, drawGlow } from "./renderer";
import type { Viewport, Rotation } from "./renderer";
import type { K8sNode, K8sEdge, ProjectedK8sNode, K8sPodNode } from "../types/k8s";

export type { Viewport, Rotation };

export function projectK8sNodes(
  nodes: K8sNode[],
  rotation: Rotation,
  viewport: Viewport,
  zoom: number
): ProjectedK8sNode[] {
  return nodes
    .map((n) => ({ ...n, ...project(n, rotation, viewport, zoom) }))
    .sort((a, b) => b.depth - a.depth);
}

export function drawPodAtom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  node: ProjectedK8sNode & K8sPodNode,
  time: number,
  scale: number
): void {
  let baseColor = node.color;
  let pulseAlpha = 0.8;

  if (node.status === "CrashLoopBackOff") {
    baseColor = "#ff3333";
    pulseAlpha = 0.4 + Math.sin(time * 6) * 0.3;
  } else if (node.status === "Pending") {
    pulseAlpha = 0.3 + Math.sin(time * 2) * 0.15;
  }

  drawGlow(ctx, x, y, r * 5, node.glow, pulseAlpha * 0.12 * scale);

  ctx.fillStyle = baseColor;
  ctx.globalAlpha = pulseAlpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = pulseAlpha * 0.7;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (node.containers && r > 1.5) {
    node.containers.forEach((c, ci) => {
      const orbitR = r * 2.5 + ci * 2;
      const speed = 1.5 + ci * 0.7;
      const particleAngle = c.angle + time * speed;
      const px = x + Math.cos(particleAngle) * orbitR;
      const py = y + Math.sin(particleAngle) * orbitR;
      const particleR = Math.max(0.8, r * 0.3);

      ctx.strokeStyle = baseColor + "20";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, orbitR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = baseColor;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(px, py, particleR, 0, Math.PI * 2);
      ctx.fill();

      drawGlow(ctx, px, py, particleR * 3, baseColor, 0.2);
      ctx.globalAlpha = 1;
    });
  }
}

export function drawDeploymentStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  node: ProjectedK8sNode,
  scale: number
): void {
  drawGlow(ctx, x, y, r * 5, node.glow, 0.12 * scale);
  ctx.fillStyle = node.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawServiceDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  node: ProjectedK8sNode,
  time: number,
  scale: number
): void {
  const pulse = 0.7 + Math.sin(time * 1.5) * 0.15;
  drawGlow(ctx, x, y, r * 4, node.glow, 0.15 * scale);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = node.color;
  ctx.globalAlpha = pulse;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = pulse * 0.5;
  ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawIngressWormhole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  node: ProjectedK8sNode,
  time: number,
  scale: number
): void {
  const pulse = 0.6 + Math.sin(time * 2) * 0.3;
  drawGlow(ctx, x, y, r * 6, node.glow, 0.2 * scale * pulse);

  ctx.strokeStyle = node.glow;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = pulse * 0.6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawNamespaceNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  node: ProjectedK8sNode,
  time: number,
  scale: number
): void {
  const pulse = 0.5 + Math.sin(time * 0.5 + node.nsIndex) * 0.1;
  drawGlow(ctx, x, y, r * 8, node.glow, 0.06 * scale);
  drawGlow(ctx, x, y, r * 3, node.color, 0.2 * scale);

  ctx.fillStyle = node.color;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = pulse * 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawK8sEdges(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedK8sNode[],
  edges: K8sEdge[],
  visibleIds: Set<number>,
  time: number
): void {
  const byId = new Map(projected.map((n) => [n.id, n]));

  for (const e of edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;

    let alpha: number, color: string, width: number, dash: number[];
    if (e.type === "ownership") {
      alpha = 0.07;
      color = s.color;
      width = 0.5;
      dash = [];
    } else if (e.type === "service") {
      alpha = 0.12 + Math.sin(time * 3 + e.source) * 0.04;
      color = s.color;
      width = 1;
      dash = [4, 4];
    } else {
      alpha = 0.15 + Math.sin(time * 2) * 0.05;
      color = "#ffffff";
      width = 1.2;
      dash = [6, 3];
    }

    const aHex = Math.round(Math.min(1, alpha) * 255).toString(16).padStart(2, "0");
    ctx.strokeStyle = color + aHex;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(s.sx, s.sy);
    ctx.lineTo(t.sx, t.sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
