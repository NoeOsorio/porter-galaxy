import { useEffect, useRef, useState } from "react";

interface Node {
  id: number;
  cluster: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  brightness: number;
  label: string;
}

interface ProjectedNode extends Node {
  sx: number;
  sy: number;
  scale: number;
  depth: number;
}

interface Edge {
  source: number;
  target: number;
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
}

interface ClusterColor {
  core: string;
  glow: string;
}

const COLORS: { bg: string; clusters: ClusterColor[] } = {
  bg: "#05050f",
  clusters: [
    { core: "#ff6b9d", glow: "#ff2d7b" },
    { core: "#45caff", glow: "#0099ff" },
    { core: "#ffd666", glow: "#ffaa00" },
    { core: "#7c6bff", glow: "#5b3aff" },
    { core: "#5bffb0", glow: "#00ff88" },
    { core: "#ff8c42", glow: "#ff5500" },
  ],
};

function generateGraph(nodeCount = 600, clusterCount = 6): Graph {
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

function forceStep(nodes: Node[], edges: Edge[], alpha = 0.01): void {
  const repulsion = 800;
  const attraction = 0.0003;
  const centerGravity = 0.001;

  for (let i = 0; i < nodes.length; i++) {
    let fx = 0, fy = 0;

    fx -= nodes[i].x * centerGravity;
    fy -= nodes[i].y * centerGravity;

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

export default function GalaxyGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.3, y: 0, autoRotate: true });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const zoomRef = useRef(1);
  const hoveredRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState<ProjectedNode | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, clusters: 0 });

  useEffect(() => {
    const graph = generateGraph(600, 6);
    graphRef.current = graph;
    setStats({ nodes: graph.nodes.length, edges: graph.edges.length, clusters: 6 });

    for (let i = 0; i < 100; i++) {
      forceStep(graph.nodes, graph.edges, 0.05 * (1 - i / 100));
    }
  }, []);

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

    function project(x: number, y: number, z: number) {
      const rot = rotationRef.current;
      const cosX = Math.cos(rot.x), sinX = Math.sin(rot.x);
      const cosY = Math.cos(rot.y), sinY = Math.sin(rot.y);

      let px = x * cosY - z * sinY;
      let pz = x * sinY + z * cosY;
      let py = y * cosX - pz * sinX;
      pz = y * sinX + pz * cosX;

      const perspective = 800;
      const scale = (perspective / (perspective + pz)) * zoomRef.current;
      return { sx: width / 2 + px * scale, sy: height / 2 + py * scale, scale, depth: pz };
    }

    function drawGlow(x: number, y: number, radius: number, color: string, alpha: number) {
      const gradient = ctx!.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, "0"));
      gradient.addColorStop(0.4, color + Math.round(alpha * 0.3 * 255).toString(16).padStart(2, "0"));
      gradient.addColorStop(1, color + "00");
      ctx!.fillStyle = gradient;
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fill();
    }

    function render() {
      const graph = graphRef.current;
      if (!graph) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      if (rotationRef.current.autoRotate) {
        rotationRef.current.y += 0.002;
      }

      forceStep(graph.nodes, graph.edges, 0.001);

      ctx!.fillStyle = COLORS.bg;
      ctx!.fillRect(0, 0, width, height);

      ctx!.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 200; i++) {
        const sx = (i * 7919 + 1) % width;
        const sy = (i * 6271 + 3) % height;
        const sz = 0.3 + ((i * 3571) % 100) / 100;
        ctx!.beginPath();
        ctx!.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx!.fill();
      }

      const projected: ProjectedNode[] = graph.nodes.map((n) => {
        const p = project(n.x, n.y, n.z);
        return { ...n, ...p };
      });

      projected.sort((a, b) => b.depth - a.depth);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx!.lineWidth = 0.5;
      for (const edge of graph.edges) {
        const s = projected.find((n) => n.id === edge.source);
        const t = projected.find((n) => n.id === edge.target);
        if (!s || !t) continue;

        const alpha = Math.max(0.02, 0.08 * Math.min(s.scale, t.scale));
        const color = COLORS.clusters[s.cluster];
        ctx!.strokeStyle = color.core + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx!.beginPath();
        ctx!.moveTo(s.sx, s.sy);
        ctx!.lineTo(t.sx, t.sy);
        ctx!.stroke();
      }

      let closestNode: ProjectedNode | null = null;
      let closestDist = 20;

      for (const n of projected) {
        const color = COLORS.clusters[n.cluster];
        const r = n.size * n.scale * 1.5;
        const alpha = Math.min(1, 0.3 + n.brightness * 0.7 * n.scale);

        drawGlow(n.sx, n.sy, r * 4, color.glow, alpha * 0.15);

        ctx!.fillStyle = color.core + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx!.beginPath();
        ctx!.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = "#ffffff" + Math.round(alpha * 0.6 * 255).toString(16).padStart(2, "0");
        ctx!.beginPath();
        ctx!.arc(n.sx, n.sy, r * 0.3, 0, Math.PI * 2);
        ctx!.fill();

        const dx = n.sx - mx;
        const dy = n.sy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestNode = n;
        }
      }

      if (closestNode) {
        const n = closestNode;
        const color = COLORS.clusters[n.cluster];
        drawGlow(n.sx, n.sy, 30, color.glow, 0.4);

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

        ctx!.lineWidth = 1;
        ctx!.strokeStyle = color.core + "66";
        for (const edge of graph.edges) {
          if (edge.source === n.id || edge.target === n.id) {
            const s = projected.find((p) => p.id === edge.source);
            const t = projected.find((p) => p.id === edge.target);
            if (s && t) {
              ctx!.beginPath();
              ctx!.moveTo(s.sx, s.sy);
              ctx!.lineTo(t.sx, t.sy);
              ctx!.stroke();
            }
          }
        }

        if (hoveredRef.current !== n.id) {
          hoveredRef.current = n.id;
          setHovered(n);
        }
      } else if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        setHovered(null);
      }

      for (let c = 0; c < 6; c++) {
        const clusterNodes = projected.filter((n) => n.cluster === c);
        if (clusterNodes.length === 0) continue;
        const avgX = clusterNodes.reduce((s, n) => s + n.sx, 0) / clusterNodes.length;
        const avgY = clusterNodes.reduce((s, n) => s + n.sy, 0) / clusterNodes.length;
        const color = COLORS.clusters[c];
        drawGlow(avgX, avgY, 80, color.glow, 0.03);
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
      rotationRef.current.autoRotate = false;
    }

    function onMouseUp() {
      dragRef.current.dragging = false;
      setTimeout(() => { rotationRef.current.autoRotate = true; }, 3000);
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
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: COLORS.bg,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&display=swap"
        rel="stylesheet"
      />
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: "grab" }}
      />

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          color: "rgba(255,255,255,0.6)",
          fontSize: 11,
          lineHeight: 1.8,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: 3,
            marginBottom: 8,
          }}
        >
          GALAXY GRAPH
        </div>
        <div style={{ opacity: 0.5 }}>
          {stats.nodes} nodes · {stats.edges} edges · {stats.clusters} clusters
        </div>
        <div style={{ opacity: 0.35, marginTop: 4, fontSize: 10 }}>
          drag to rotate · scroll to zoom
        </div>
      </div>

      {/* Cluster legend */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          display: "flex",
          gap: 16,
          pointerEvents: "none",
        }}
      >
        {COLORS.clusters.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: c.core,
                boxShadow: `0 0 8px ${c.glow}`,
              }}
            />
            C{i}
          </div>
        ))}
      </div>

      {/* Node detail panel */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            background: "rgba(10,10,30,0.85)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "14px 18px",
            color: "rgba(255,255,255,0.7)",
            fontSize: 11,
            lineHeight: 1.8,
            backdropFilter: "blur(12px)",
            minWidth: 160,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: COLORS.clusters[hovered.cluster].core,
              fontWeight: 500,
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            {hovered.label}
          </div>
          <div>
            cluster:{" "}
            <span style={{ color: COLORS.clusters[hovered.cluster].core }}>
              {hovered.cluster}
            </span>
          </div>
          <div>
            pos: ({Math.round(hovered.x)}, {Math.round(hovered.y)},{" "}
            {Math.round(hovered.z)})
          </div>
          <div>size: {hovered.size.toFixed(1)}</div>
        </div>
      )}
    </div>
  );
}
