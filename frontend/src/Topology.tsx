import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useClustersSSE } from "./hooks/useClustersSSE";
import { transformTopology } from "./lib/transformTopology";
import TopologyScene from "./components/three/TopologyScene";
import type { TopologyNode } from "./types/topology";

const TYPE_ICONS: Record<string, string> = {
  internet: "🌐",
  loadbalancer: "⚖️",
  deployment: "📦",
  pod: "⚛️",
};

const TYPE_LABELS: Record<string, string> = {
  internet: "Internet",
  loadbalancer: "Load Balancer",
  deployment: "Deployment",
  pod: "Pod",
};

function statusColor(status?: string): string {
  if (!status) return "#ffffff";
  if (status.includes("Running")) return "#5bffb0";
  if (status.includes("Pending")) return "#ffd666";
  return "#ff3333";
}

export default function Topology() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { data, isLoading, isError, error } = useClustersSSE();
  const [hovered, setHovered] = useState<TopologyNode | null>(null);
  const [selected, setSelected] = useState<TopologyNode | null>(null);

  const topologyGraph = useMemo(() => {
    if (!data?.clusters[0]) return null;
    return transformTopology(data.clusters[0]);
  }, [data]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selected) {
        setSelected(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const handleDoubleClick = (node: TopologyNode) => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const distance = 200;
      const direction = new THREE.Vector3(1, 0.5, 1).normalize();
      const newPosition = new THREE.Vector3(
        node.x + direction.x * distance,
        node.y + direction.y * distance,
        node.z + direction.z * distance
      );
      
      controls.target.set(node.x, node.y, node.z);
      
      const camera = controls.object;
      const startPosition = camera.position.clone();
      const duration = 1000;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
        
        camera.position.lerpVectors(startPosition, newPosition, eased);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    }
  };

  const handleResetView = () => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const camera = controls.object;
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const defaultPosition = new THREE.Vector3(250, 50, 350);
      const defaultTarget = new THREE.Vector3(0, 0, -100);
      const duration = 1000;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
        
        camera.position.lerpVectors(startPosition, defaultPosition, eased);
        controls.target.lerpVectors(startTarget, defaultTarget, eased);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    }
    setSelected(null);
  };

  return (
    <div
      className="w-full h-screen bg-[#05050f] relative overflow-hidden font-['JetBrains_Mono','SF_Mono',monospace]"
      style={{ touchAction: "none" }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/70 text-sm">Loading topology...</div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-400 text-sm">
            Error loading topology: {error?.message || "Unknown error"}
          </div>
        </div>
      )}

      {topologyGraph && (
        <Canvas
          camera={{ position: [250, 50, 350], fov: 60 }}
          gl={{ antialias: true }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <color attach="background" args={["#05050f"]} />
          <fog attach="fog" args={["#05050f", 500, 1200]} />
          <TopologyScene
            graph={topologyGraph}
            onHover={setHovered}
            onClick={setSelected}
            selectedNode={selected}
            onDoubleClick={handleDoubleClick}
          />
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.5}
            zoomSpeed={0.8}
            minDistance={200}
            maxDistance={1000}
            target={[0, 0, -100]}
            enablePan={true}
            panSpeed={0.5}
            screenSpacePanning={true}
          />
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.2}
              intensity={1.5}
              radius={0.7}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}

      <div className="absolute top-20 left-6 text-white/70 text-[11px] leading-[1.8] pointer-events-none">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-lg font-semibold text-white/90 tracking-[4px]">
            TOPOLOGY
          </div>
        </div>
        <div className="opacity-40 text-[10px]">
          network flow visualization · drag to rotate · scroll to zoom
        </div>
      </div>

      <div className="absolute top-20 right-6 flex flex-col gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={handleResetView}
          className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-2.5 px-4 backdrop-blur-xl text-white/70 text-[10px] font-semibold hover:bg-[rgba(8,8,25,0.95)] hover:text-white/90 transition-all duration-200 hover:border-white/[0.15]"
        >
          RESET VIEW
        </button>
        
        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-3 px-4 backdrop-blur-xl pointer-events-none">
          <div className="text-white/70 text-[10px] mb-2 font-semibold opacity-80">
            LEGEND
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
              <span className="text-white/60">Internet</span>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff4d9f] shadow-[0_0_8px_rgba(255,77,159,0.6)]" />
              <span className="text-white/60">Load Balancer</span>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffd666] shadow-[0_0_8px_rgba(255,214,102,0.6)]" />
              <span className="text-white/60">Deployment</span>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#5bffb0] shadow-[0_0_8px_rgba(91,255,176,0.6)]" />
              <span className="text-white/60">Pod</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            key={`hover-${hovered.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 right-6 pointer-events-none min-w-[220px]"
          >
            <div className="bg-[rgba(8,8,25,0.9)] border border-white/[0.08] rounded-xl py-3.5 px-[18px] text-white/70 text-[11px] leading-[1.9] backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{TYPE_ICONS[hovered.type]}</span>
                <div>
                  <div
                    className="font-medium text-[13px]"
                    style={{ color: hovered.color || "#fff" }}
                  >
                    {hovered.name}
                  </div>
                  <div className="opacity-40 text-[9px] mt-0.5">
                    {TYPE_LABELS[hovered.type]}
                  </div>
                </div>
              </div>
              {hovered.namespace && (
                <div>
                  namespace:{" "}
                  <span className="opacity-80">{hovered.namespace}</span>
                </div>
              )}
              {hovered.status && (
                <div>
                  status:{" "}
                  <span style={{ color: statusColor(hovered.status) }}>
                    {hovered.status}
                  </span>
                </div>
              )}
              {hovered.metadata?.connections !== undefined && (
                <div>
                  connections:{" "}
                  <span className="opacity-80">
                    {hovered.metadata.connections}
                  </span>
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
            className="absolute top-[180px] left-6 pointer-events-auto min-w-[260px] max-w-[320px]"
          >
            <div
              className="bg-[rgba(8,8,25,0.92)] rounded-xl py-4 px-5 text-white/75 text-[11px] leading-[1.8] backdrop-blur-xl border"
              style={{
                borderColor: (selected.color || "rgba(255,255,255,0.1)") + "33",
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <div
                  className="font-semibold text-[15px]"
                  style={{ color: selected.color || "#fff" }}
                >
                  {TYPE_ICONS[selected.type]} {selected.name}
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

              <div className="border-t border-white/[0.06] pt-2 space-y-1">
                <div className="text-[10px] font-semibold opacity-60 mb-1.5">
                  DETAILS
                </div>

                <div>
                  type:{" "}
                  <span className="text-white/90">
                    {TYPE_LABELS[selected.type]}
                  </span>
                </div>

                <div>
                  id:{" "}
                  <span className="text-white/60 text-[10px] font-mono break-all">
                    {selected.id}
                  </span>
                </div>

                {selected.namespace && (
                  <div>
                    namespace:{" "}
                    <span className="text-white/90">{selected.namespace}</span>
                  </div>
                )}

                {selected.status && (
                  <div>
                    status:{" "}
                    <span style={{ color: statusColor(selected.status) }}>
                      {selected.status}
                    </span>
                  </div>
                )}

                {selected.metadata?.connections !== undefined && (
                  <div>
                    connections:{" "}
                    <span className="text-white/90">
                      {selected.metadata.connections}
                    </span>
                  </div>
                )}
              </div>

              {selected.type === "deployment" && selected.metadata && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">
                    REPLICAS
                  </div>
                  {selected.metadata.desired !== undefined && (
                    <div>
                      desired:{" "}
                      <span className="text-white/90">
                        {selected.metadata.desired}
                      </span>
                    </div>
                  )}
                  {selected.metadata.ready !== undefined && (
                    <div>
                      ready:{" "}
                      <span className="text-[#5bffb0]">
                        {selected.metadata.ready}
                      </span>
                    </div>
                  )}
                  {selected.metadata.available !== undefined && (
                    <div>
                      available:{" "}
                      <span className="text-white/90">
                        {selected.metadata.available}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selected.type === "pod" && selected.metadata && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">
                    POD INFO
                  </div>
                  {selected.metadata.version && (
                    <div>
                      version:{" "}
                      <span className="text-white/90">
                        {selected.metadata.version}
                      </span>
                    </div>
                  )}
                  {selected.metadata.nodeId && (
                    <div>
                      node:{" "}
                      <span className="text-white/60 text-[10px] font-mono">
                        {selected.metadata.nodeId}
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
