import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { K8sMoleculeNode } from "./types/k8sMolecule";
import K8sMoleculeScene from "./components/three/K8sMoleculeScene";

const KIND_ICONS: Record<string, string> = {
  Node: "◉",
  Deployment: "★",
  Pod: "⚛",
};

function statusColor(status: string): string {
  if (status === "Running") return "#5bffb0";
  if (status === "Pending") return "#ffd666";
  return "#ff3333";
}

export default function K8sMolecule() {
  const [hovered, setHovered] = useState<K8sMoleculeNode | null>(null);
  const [selected, setSelected] = useState<K8sMoleculeNode | null>(null);
  const [nodeSpacing, setNodeSpacing] = useState(1.0);
  const sceneRef = useRef<{ resetPositions: () => void }>(null);

  const handleReset = useCallback(() => {
    sceneRef.current?.resetPositions();
  }, []);

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
        <K8sMoleculeScene
          ref={sceneRef}
          onHover={setHovered}
          onSelect={setSelected}
          nodeSpacing={nodeSpacing}
        />
        <OrbitControls
          enableRotate={false}
          enablePan={false}
          enableZoom={true}
          zoomSpeed={0.5}
          minDistance={50}
          maxDistance={1500}
        />
        <Stars radius={500} depth={150} count={2000} factor={2} />
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.4}
            intensity={1.2}
            radius={0.6}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      <div className="absolute top-5 left-6 text-white/70 text-[11px] leading-[1.8] pointer-events-none">
        <div className="text-lg font-semibold text-white/90 tracking-[4px] mb-1.5">
          K8S MOLECULE
        </div>
        <div className="opacity-40 text-[10px]">
          drag nodes to move · shift+drag for node only · scroll to zoom camera
          · slider for node spacing
        </div>
      </div>

      <div className="absolute top-5 right-6 flex flex-col gap-2 pointer-events-auto">
        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-3 px-4 backdrop-blur-xl">
          <div className="text-white/70 text-[10px] mb-2">Node Spacing</div>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={nodeSpacing}
            onChange={(e) => setNodeSpacing(parseFloat(e.target.value))}
            className="w-32 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/80"
          />
          <div className="text-white/50 text-[9px] mt-1">
            {nodeSpacing.toFixed(1)}x
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-2 px-4 text-white/70 text-[10px] backdrop-blur-xl hover:bg-[rgba(8,8,25,0.95)] transition-colors"
        >
          Reset Layout
        </button>
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
                {"status" in selected && selected.status && (
                  <div>
                    status:{" "}
                    <span style={{ color: statusColor(selected.status) }}>
                      {selected.status}
                    </span>
                  </div>
                )}
                {"containerNames" in selected && selected.containerNames && (
                  <div className="mt-1.5">
                    <div className="opacity-50 text-[9px] mb-1">CONTAINERS</div>
                    {selected.containerNames.map((c: string, i: number) => (
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
