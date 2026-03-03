import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Graph, ProjectedNode, GraphStats } from "./types/graph";
import { generateGraph, forceStep } from "./lib/graph";
import {
  projectNodes,
  drawGlow,
  drawEdges,
  drawHighlightedEdges,
} from "./lib/renderer";
import HUD from "./components/HUD";
import ClusterLegend from "./components/ClusterLegend";
import NodeDetail from "./components/NodeDetail";

const CLUSTER_COLORS = [
  { core: "#ff6b9d", glow: "#ff2d7b" },
  { core: "#45caff", glow: "#0099ff" },
  { core: "#ffd666", glow: "#ffaa00" },
  { core: "#7c6bff", glow: "#5b3aff" },
  { core: "#5bffb0", glow: "#00ff88" },
  { core: "#ff8c42", glow: "#ff5500" },
];

const BG = "#05050f";

export default function GalaxyGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const zoomRef = useRef(1);
  const hoveredIdRef = useRef<number | null>(null);

  const [hovered, setHovered] = useState<ProjectedNode | null>(null);
  const [stats, setStats] = useState<GraphStats>({ nodes: 0, edges: 0, clusters: 0 });

  // Generate graph once
  useEffect(() => {
    const graph = generateGraph(600, 6);
    graphRef.current = graph;
    setStats({ nodes: graph.nodes.length, edges: graph.edges.length, clusters: 6 });
    for (let i = 0; i < 100; i++) {
      forceStep(graph.nodes, graph.edges, 0.05 * (1 - i / 100));
    }
  }, []);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0, height = 0;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function render() {
      const graph = graphRef.current;
      if (!graph) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      forceStep(graph.nodes, graph.edges, 0.001);

      // Background
      ctx!.fillStyle = BG;
      ctx!.fillRect(0, 0, width, height);

      // Static star field
      ctx!.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 200; i++) {
        const sx = (i * 7919 + 1) % width;
        const sy = (i * 6271 + 3) % height;
        const sz = 0.3 + ((i * 3571) % 100) / 100;
        ctx!.beginPath();
        ctx!.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx!.fill();
      }

      const projected = projectNodes(
        graph.nodes,
        rotationRef.current,
        { width, height },
        zoomRef.current
      );

      // Edges
      drawEdges(ctx!, projected, graph.edges, CLUSTER_COLORS);

      // Nodes
      let closestNode: ProjectedNode | null = null;
      let closestDist = 20;
      const { x: mx, y: my } = mouseRef.current;

      for (const n of projected) {
        const color = CLUSTER_COLORS[n.cluster];
        const r = n.size * n.scale * 1.5;
        const alpha = Math.min(1, 0.3 + n.brightness * 0.7 * n.scale);

        drawGlow(ctx!, n.sx, n.sy, r * 4, color.glow, alpha * 0.15);

        ctx!.fillStyle = color.core + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx!.beginPath();
        ctx!.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = "#ffffff" + Math.round(alpha * 0.6 * 255).toString(16).padStart(2, "0");
        ctx!.beginPath();
        ctx!.arc(n.sx, n.sy, r * 0.3, 0, Math.PI * 2);
        ctx!.fill();

        const dist = Math.sqrt((n.sx - mx) ** 2 + (n.sy - my) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestNode = n;
        }
      }

      // Hover highlight
      if (closestNode) {
        const n = closestNode;
        const color = CLUSTER_COLORS[n.cluster];

        drawGlow(ctx!, n.sx, n.sy, 30, color.glow, 0.4);

        ctx!.strokeStyle = color.core;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.arc(n.sx, n.sy, n.size * n.scale * 1.5 + 5, 0, Math.PI * 2);
        ctx!.stroke();

        ctx!.font = "11px 'JetBrains Mono', monospace";
        ctx!.fillStyle = color.core;
        ctx!.textAlign = "left";
        ctx!.fillText(n.label, n.sx + 14, n.sy - 8);
        ctx!.fillStyle = "rgba(255,255,255,0.5)";
        ctx!.font = "10px 'JetBrains Mono', monospace";
        ctx!.fillText(`cluster ${n.cluster}`, n.sx + 14, n.sy + 6);

        drawHighlightedEdges(ctx!, projected, graph.edges, n.id, color.core);

        if (hoveredIdRef.current !== n.id) {
          hoveredIdRef.current = n.id;
          setHovered(n);
        }
      } else if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null;
        setHovered(null);
      }

      // Nebula glow per cluster center
      for (let c = 0; c < CLUSTER_COLORS.length; c++) {
        const clusterNodes = projected.filter((n) => n.cluster === c);
        if (clusterNodes.length === 0) continue;
        const avgX = clusterNodes.reduce((s, n) => s + n.sx, 0) / clusterNodes.length;
        const avgY = clusterNodes.reduce((s, n) => s + n.sy, 0) / clusterNodes.length;
        drawGlow(ctx!, avgX, avgY, 80, CLUSTER_COLORS[c].glow, 0.03);
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (dragRef.current.dragging) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        rotationRef.current.y += dx * 0.005;
        rotationRef.current.x += dy * 0.005;
        rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
      }
    }

    function onMouseDown(e: MouseEvent) {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
    }

    function onMouseUp() {
      dragRef.current.dragging = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current - e.deltaY * 0.001));
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="w-full h-screen bg-[#05050f] relative overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab" />
      <HUD stats={stats} />
      <ClusterLegend clusters={CLUSTER_COLORS} />
      <AnimatePresence>
        {hovered && <NodeDetail key={hovered.id} node={hovered} clusterColors={CLUSTER_COLORS} />}
      </AnimatePresence>
    </div>
  );
}
