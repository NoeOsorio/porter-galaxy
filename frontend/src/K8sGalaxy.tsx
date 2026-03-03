import { useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { K8sNode, K8sGraph } from "./types/k8s";
import K8sScene from "./components/three/K8sScene";

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
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [graph, setGraph] = useState<K8sGraph | null>(null);
  const [hovered, setHovered] = useState<K8sNode | null>(null);
  const [selected, setSelected] = useState<K8sNode | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const onReady = useCallback((g: K8sGraph) => setGraph(g), []);

  const namespaces = graph?.namespaces ?? [];

  return (
    <div
      className="w-full h-screen bg-[#05050f] relative overflow-hidden font-['JetBrains_Mono','SF_Mono',monospace]"
      style={{ touchAction: "none" }}
    >
      <Canvas
        camera={{ position: [0, 0, 500], fov: 60 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#05050f"]} />
        <fog attach="fog" args={["#05050f", 400, 1100]} />
        <K8sScene
          filter={filter}
          onHover={setHovered}
          onSelect={setSelected}
          onReady={onReady}
          controlsRef={controlsRef as React.RefObject<{ target: THREE.Vector3 } | null>}
        />
        <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} />
        <Stars radius={500} depth={150} count={2000} factor={2} />
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            intensity={1.5}
            radius={0.7}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      <div className="absolute top-5 left-6 text-white/70 text-[11px] leading-[1.8] pointer-events-none">
        <div className="text-lg font-semibold text-white/90 tracking-[4px] mb-1.5">
          K8S GALAXY
        </div>
        <div className="opacity-40 text-[10px]">
          drag to rotate · scroll to zoom · zoom changes scale and spacing ·
          click to inspect
        </div>
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
              filter === ns.name
                ? "text-white/90"
                : "border-white/10 text-white/50 hover:bg-white/[0.06]"
            }`}
            style={
              filter === ns.name
                ? {
                    background: ns.color + "22",
                    borderColor: ns.color + "55",
                    color: ns.color,
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.08)",
                  }
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
                <span className="text-base">
                  {KIND_ICONS[hovered.kind] ?? "●"}
                </span>
                <div>
                  <div
                    className="font-medium text-[13px]"
                    style={{ color: hovered.color || "#fff" }}
                  >
                    {hovered.name}
                  </div>
                  <div className="opacity-40 text-[9px] mt-0.5">
                    {hovered.kind}
                  </div>
                </div>
              </div>
              {"namespace" in hovered && hovered.namespace && (
                <div>
                  ns:{" "}
                  <span style={{ color: hovered.color }}>{hovered.namespace}</span>
                </div>
              )}
              {"status" in hovered && hovered.status && (
                <div>
                  status:{" "}
                  <span style={{ color: statusColor(hovered.status) }}>
                    {hovered.status}
                  </span>
                </div>
              )}
              {"containerNames" in hovered && hovered.containerNames && (
                <div>
                  containers:{" "}
                  <span className="opacity-80">
                    {hovered.containerNames.join(", ")}
                  </span>
                </div>
              )}
              {"serviceType" in hovered && hovered.serviceType && (
                <div>
                  type:{" "}
                  <span className="opacity-80">{hovered.serviceType}</span>
                </div>
              )}
              {"replicas" in hovered && hovered.replicas !== undefined && (
                <div>
                  replicas:{" "}
                  <span className="opacity-80">{hovered.replicas}</span>
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
                borderColor:
                  (selected.color || "rgba(255,255,255,0.1)") + "33",
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
                    namespace:{" "}
                    <span style={{ color: selected.color }}>
                      {selected.namespace}
                    </span>
                  </div>
                )}
                {"status" in selected && selected.status && (
                  <div>
                    status:{" "}
                    <span
                      style={{ color: statusColor(selected.status) }}
                    >
                      {selected.status}
                    </span>
                  </div>
                )}
                {"containerNames" in selected && selected.containerNames && (
                  <div className="mt-1.5">
                    <div className="opacity-50 text-[9px] mb-1">
                      CONTAINERS
                    </div>
                    {selected.containerNames.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 py-0.5"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full opacity-70"
                          style={{ background: selected.color }}
                        />
                        {c}
                      </div>
                    ))}
                  </div>
                )}
                {"replicas" in selected &&
                  selected.replicas !== undefined && (
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
