import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { K8sNode, K8sGraph, ProjectedK8sNode, K8sPodNode } from "./types/k8s";
import { generateK8sCluster, forceStepK8s } from "./lib/k8sGraph";
import { drawGlow, project } from "./lib/renderer";
import {
  projectK8sNodes,
  drawPodAtom,
  drawDeploymentStar,
  drawServiceDiamond,
  drawIngressWormhole,
  drawNamespaceNode,
  drawK8sEdges,
} from "./lib/k8sRenderer";

const BG = "#05050f";

const KIND_ICONS: Record<string, string> = {
  Namespace: "◉",
  Deployment: "★",
  Pod: "⚛",
  Service: "◆",
  Ingress: "⊕",
};

const LEGEND_ITEMS = [
  { icon: "◉", label: "Namespace", desc: "nebula" },
  { icon: "★", label: "Deployment", desc: "star system" },
  { icon: "⚛", label: "Pod", desc: "atom" },
  { icon: "◆", label: "Service", desc: "light bridge" },
  { icon: "⊕", label: "Ingress", desc: "wormhole" },
];

function statusColor(status: string): string {
  if (status === "Running") return "#5bffb0";
  if (status === "Pending") return "#ffd666";
  return "#ff3333";
}

export default function K8sGalaxy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<K8sGraph | null>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rotationRef = useRef({ x: 0.35, y: 0 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const zoomRef = useRef(1);
  const hoveredIdRef = useRef<number | null>(null);

  const ZOOM_FOCUSED = 2;
  const ZOOM_DEFAULT = 1;

  const [hovered, setHovered] = useState<ProjectedK8sNode | null>(null);
  const [selected, setSelected] = useState<ProjectedK8sNode | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const data = generateK8sCluster();
    dataRef.current = data;
    for (let i = 0; i < 150; i++) {
      forceStepK8s(data.nodes, data.edges, 0.04 * (1 - i / 150));
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0,
      height = 0;

    const stars = Array.from({ length: 300 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.3 + Math.random() * 0.8,
      b: 0.1 + Math.random() * 0.2,
    }));

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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function render() {
      const data = dataRef.current;
      if (!data) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const targetZoom = filter === "all" ? ZOOM_DEFAULT : ZOOM_FOCUSED;
      zoomRef.current += (targetZoom - zoomRef.current) * 0.06;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const projected = projectK8sNodes(
        data.nodes,
        rotationRef.current,
        { width, height },
        zoomRef.current
      );

      let offsetX = 0;
      let offsetY = 0;
      if (filter !== "all") {
        const focusNodes = data.nodes.filter(
          (n) => n.kind === "Namespace" && n.name === filter
        );
        const focusNode = focusNodes[0];
        if (focusNode) {
          const focusProj = project(focusNode, rotationRef.current, { width, height }, zoomRef.current);
          offsetX = width / 2 - focusProj.sx;
          offsetY = height / 2 - focusProj.sy;
        }
      }

      const projectedWithOffset = projected.map((n) => ({
        ...n,
        sx: n.sx + offsetX,
        sy: n.sy + offsetY,
      }));

      const visible =
        filter === "all"
          ? projectedWithOffset
          : projectedWithOffset.filter((n) => n.namespace === filter || n.kind === "Namespace");
      const visibleIds = new Set(visible.map((n) => n.id));

      const nodeSizeScale = 0.55 + 0.45 * Math.min(zoomRef.current, 2.5);

      for (const st of stars) {
        ctx.fillStyle = `rgba(255,255,255,${st.b})`;
        ctx.beginPath();
        ctx.arc(st.x * width, st.y * height, st.s, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const n of data.nodes) {
        if (n.kind !== "Namespace") continue;
        const p = projectedWithOffset.find((proj) => proj.id === n.id);
        if (!p) continue;
        drawGlow(ctx, p.sx, p.sy, 70 * p.scale, n.glow, 0.012);
      }

      drawK8sEdges(ctx, projectedWithOffset, data.edges, visibleIds, 0);

      let closestNode: (ProjectedK8sNode & { sx: number; sy: number }) | null = null;
      let closestDist = 25;
      const { x: mx, y: my } = mouseRef.current;

      for (const n of visible) {
        const r = n.size * n.scale * nodeSizeScale;
        if (r < 0.3) continue;

        if (n.kind === "Pod") {
          drawPodAtom(ctx, n.sx, n.sy, r, n as ProjectedK8sNode & K8sPodNode, 0, n.scale);
        } else if (n.kind === "Service") {
          drawServiceDiamond(ctx, n.sx, n.sy, r, n, 0, n.scale);
        } else if (n.kind === "Ingress") {
          drawIngressWormhole(ctx, n.sx, n.sy, r, n, 0, n.scale);
        } else if (n.kind === "Namespace") {
          drawNamespaceNode(ctx, n.sx, n.sy, r, n, 0, n.scale);
        } else {
          drawDeploymentStar(ctx, n.sx, n.sy, r, n, n.scale);
        }

        const dx = n.sx - mx;
        const dy = n.sy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitR = Math.max(12, r * 2);
        if (dist < hitR && dist < closestDist) {
          closestDist = dist;
          closestNode = n;
        }
      }

      if (closestNode) {
        const n = closestNode;
        drawGlow(ctx, n.sx, n.sy, 35, n.glow || n.color, 0.3);

        ctx.strokeStyle = (n.color || "#ffffff") + "88";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, n.size * n.scale * nodeSizeScale + 6, 0, Math.PI * 2);
        ctx.stroke();

        const byId = new Map(projectedWithOffset.map((p) => [p.id, p]));
        for (const e of data.edges) {
          if (e.source !== n.id && e.target !== n.id) continue;
          const s = byId.get(e.source);
          const t = byId.get(e.target);
          if (s && t) {
            ctx.strokeStyle = (n.color || "#ffffff") + "44";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.lineTo(t.sx, t.sy);
            ctx.stroke();
          }
        }

        if (hoveredIdRef.current !== n.id) {
          hoveredIdRef.current = n.id;
          setHovered(n);
        }
      } else if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null;
        setHovered(null);
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (dragRef.current.dragging) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        rotationRef.current.y += dx * 0.005;
        rotationRef.current.x += dy * 0.005;
        rotationRef.current.x = Math.max(-1.3, Math.min(1.3, rotationRef.current.x));
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

    function onClick() {
      const data = dataRef.current;
      if (!data) return;
      if (hoveredIdRef.current !== null) {
        const node = data.nodes.find((n) => n.id === hoveredIdRef.current);
        const projected = projectK8sNodes(
          data.nodes,
          rotationRef.current,
          { width, height },
          zoomRef.current
        );
        const proj = projected.find((p) => p.id === node?.id);
        setSelected((prev) => (prev?.id === proj?.id ? null : proj ?? null));
      } else {
        setSelected(null);
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomRef.current = Math.max(0.4, Math.min(3.2, zoomRef.current - e.deltaY * 0.001));
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("click", onClick);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [filter]);

  const namespaces = dataRef.current?.namespaces ?? [];

  return (
    <div className="w-full h-screen bg-[#05050f] relative overflow-hidden font-['JetBrains_Mono','SF_Mono',monospace]">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab" />

      <div className="absolute top-5 left-6 text-white/70 text-[11px] leading-[1.8] pointer-events-none">
        <div className="text-lg font-semibold text-white/90 tracking-[4px] mb-1.5">K8S GALAXY</div>
        <div className="opacity-40 text-[10px]">drag to rotate · scroll to zoom · zoom changes scale and spacing · click to inspect</div>
      </div>

      <div className="absolute top-5 right-6 flex flex-col gap-1.5 text-[10px] text-white/50 pointer-events-none">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-[18px] text-center text-sm">{item.icon}</span>
            <span>{item.label}</span>
            <span className="opacity-40">({item.desc})</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-6 flex gap-2 flex-wrap pointer-events-auto">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3.5 py-1.5 text-[10px] font-medium transition-colors duration-200 ${
            filter === "all"
              ? "bg-white/15 border-white/20 text-white/80"
              : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.08]"
          }`}
        >
          all
        </button>
        {namespaces.map((ns) => (
          <button
            key={ns.name}
            type="button"
            onClick={() => setFilter(ns.name)}
            className={`rounded-full border px-3.5 py-1.5 text-[10px] font-medium flex items-center gap-1.5 transition-colors duration-200 ${
              filter === ns.name ? "text-white/90" : "border-white/10 text-white/50 hover:bg-white/[0.06]"
            }`}
            style={
              filter === ns.name
                ? {
                    background: ns.color + "22",
                    borderColor: ns.color + "55",
                    color: ns.color,
                  }
                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: ns.color, boxShadow: `0 0 6px ${ns.glow}` }}
            />
            {ns.name}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            key={`hover-${hovered.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 right-6 pointer-events-none min-w-[200px]"
          >
            <div className="bg-[rgba(8,8,25,0.9)] border border-white/[0.08] rounded-xl py-3.5 px-[18px] text-white/70 text-[11px] leading-[1.9] backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{KIND_ICONS[hovered.kind] ?? "●"}</span>
                <div>
                  <div className="font-medium text-[13px]" style={{ color: hovered.color || "#fff" }}>
                    {hovered.name}
                  </div>
                  <div className="opacity-40 text-[9px] mt-0.5">{hovered.kind}</div>
                </div>
              </div>
              {"namespace" in hovered && hovered.namespace && (
                <div>
                  ns: <span style={{ color: hovered.color }}>{hovered.namespace}</span>
                </div>
              )}
              {"status" in hovered && hovered.status && (
                <div>
                  status: <span style={{ color: statusColor(hovered.status) }}>{hovered.status}</span>
                </div>
              )}
              {"containerNames" in hovered && hovered.containerNames && (
                <div>
                  containers: <span className="opacity-80">{hovered.containerNames.join(", ")}</span>
                </div>
              )}
              {"serviceType" in hovered && hovered.serviceType && (
                <div>
                  type: <span className="opacity-80">{hovered.serviceType}</span>
                </div>
              )}
              {"replicas" in hovered && hovered.replicas !== undefined && (
                <div>
                  replicas: <span className="opacity-80">{hovered.replicas}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="absolute top-20 left-6 pointer-events-auto min-w-[240px] max-w-[300px]"
          >
            <div
              className="bg-[rgba(8,8,25,0.92)] rounded-xl py-4 px-5 text-white/75 text-[11px] leading-8 backdrop-blur-xl border"
              style={{
                borderColor: (selected.color || "rgba(255,255,255,0.1)") + "33",
              }}
            >
              <div className="flex justify-between items-start">
                <div
                  className="font-semibold text-[15px] mb-2"
                  style={{ color: selected.color || "#fff" }}
                >
                  {KIND_ICONS[selected.kind]} {selected.name}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="bg-transparent border-none text-white/30 cursor-pointer text-base p-0 hover:text-white/50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="border-t border-white/[0.06] pt-2">
                <div>
                  kind: <span className="text-white/90">{selected.kind}</span>
                </div>
                {"namespace" in selected && selected.namespace && (
                  <div>
                    namespace: <span style={{ color: selected.color }}>{selected.namespace}</span>
                  </div>
                )}
                {"status" in selected && selected.status && (
                  <div>
                    status:{" "}
                    <span style={{ color: statusColor(selected.status) }}>{selected.status}</span>
                  </div>
                )}
                {"containerNames" in selected && selected.containerNames && (
                  <div className="mt-1.5">
                    <div className="opacity-50 text-[9px] mb-1">CONTAINERS</div>
                    {selected.containerNames.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 py-0.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full opacity-70"
                          style={{ background: selected.color }}
                        />
                        {c}
                      </div>
                    ))}
                  </div>
                )}
                {"replicas" in selected && selected.replicas !== undefined && (
                  <div>replicas: {selected.replicas}</div>
                )}
                {"serviceType" in selected && selected.serviceType && (
                  <div>type: {selected.serviceType}</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
