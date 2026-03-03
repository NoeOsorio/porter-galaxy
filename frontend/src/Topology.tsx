import { useState, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
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
        >
          <color attach="background" args={["#05050f"]} />
          <fog attach="fog" args={["#05050f", 500, 1200]} />
          <TopologyScene
            graph={topologyGraph}
            onHover={setHovered}
            onClick={setSelected}
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

      <div className="absolute top-5 left-6 text-white/70 text-[11px] leading-[1.8] pointer-events-none">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-lg font-semibold text-white/90 tracking-[4px]">
            TOPOLOGY
          </div>
        </div>
        <div className="opacity-40 text-[10px]">
          network flow visualization · drag to rotate · scroll to zoom
        </div>
        {topologyGraph && (
          <div className="mt-3 text-[10px] opacity-60">
            <div className="font-semibold opacity-80 mb-1">NETWORK MAP</div>
            <div>Nodes: {topologyGraph.nodes.length}</div>
            <div>Connections: {topologyGraph.edges.length}</div>
            <div>Active: {topologyGraph.edges.filter(e => e.active).length}</div>
          </div>
        )}
      </div>

      <div className="absolute top-5 right-6 pointer-events-none">
        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-3 px-4 backdrop-blur-xl">
          <div className="text-white/70 text-[10px] mb-2 font-semibold opacity-80">
            LEGEND
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-base">{TYPE_ICONS.internet}</span>
              <span className="text-white/60">Internet</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-base">{TYPE_ICONS.loadbalancer}</span>
              <span className="text-white/60">Load Balancer</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-base">{TYPE_ICONS.deployment}</span>
              <span className="text-white/60">Deployment</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-base">{TYPE_ICONS.pod}</span>
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
                <span className="text-base">
                  {TYPE_ICONS[hovered.type]}
                </span>
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
                  namespace: <span className="opacity-80">{hovered.namespace}</span>
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
                  connections: <span className="opacity-80">{hovered.metadata.connections}</span>
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
            className="absolute top-20 left-6 pointer-events-auto min-w-[260px] max-w-[320px]"
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
                <div className="text-[10px] font-semibold opacity-60 mb-1.5">DETAILS</div>
                
                <div>
                  type: <span className="text-white/90">{TYPE_LABELS[selected.type]}</span>
                </div>
                
                <div>
                  id: <span className="text-white/60 text-[10px] font-mono break-all">{selected.id}</span>
                </div>
                
                {selected.namespace && (
                  <div>namespace: <span className="text-white/90">{selected.namespace}</span></div>
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
                  <div>connections: <span className="text-white/90">{selected.metadata.connections}</span></div>
                )}
              </div>
              
              {(selected.type === "deployment" && selected.metadata) && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">REPLICAS</div>
                  {selected.metadata.desired !== undefined && (
                    <div>desired: <span className="text-white/90">{selected.metadata.desired}</span></div>
                  )}
                  {selected.metadata.ready !== undefined && (
                    <div>ready: <span className="text-[#5bffb0]">{selected.metadata.ready}</span></div>
                  )}
                  {selected.metadata.available !== undefined && (
                    <div>available: <span className="text-white/90">{selected.metadata.available}</span></div>
                  )}
                </div>
              )}
              
              {(selected.type === "pod" && selected.metadata) && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">POD INFO</div>
                  {selected.metadata.version && (
                    <div>version: <span className="text-white/90">{selected.metadata.version}</span></div>
                  )}
                  {selected.metadata.nodeId && (
                    <div>node: <span className="text-white/60 text-[10px] font-mono">{selected.metadata.nodeId}</span></div>
                  )}
                </div>
              )}
              
              <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                <div className="text-[10px] font-semibold opacity-60 mb-1.5">POSITION</div>
                <div className="text-[10px] font-mono text-white/50">
                  x: {selected.x.toFixed(1)} · y: {selected.y.toFixed(1)} · z: {selected.z.toFixed(1)}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
