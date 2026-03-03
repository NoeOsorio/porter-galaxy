import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { Node, GraphStats } from "./types/graph";
import HUD from "./components/HUD";
import ClusterLegend from "./components/ClusterLegend";
import NodeDetail from "./components/NodeDetail";
import GalaxyScene from "./components/three/GalaxyScene";

const CLUSTER_COLORS = [
  { core: "#ff6b9d", glow: "#ff2d7b" },
  { core: "#45caff", glow: "#0099ff" },
  { core: "#ffd666", glow: "#ffaa00" },
  { core: "#7c6bff", glow: "#5b3aff" },
  { core: "#5bffb0", glow: "#00ff88" },
  { core: "#ff8c42", glow: "#ff5500" },
];

export default function GalaxyGraph() {
  const [hovered, setHovered] = useState<Node | null>(null);
  const [stats, setStats] = useState<GraphStats>({
    nodes: 0,
    edges: 0,
    clusters: 0,
  });

  const onStats = useCallback((s: GraphStats) => setStats(s), []);

  return (
    <div
      className="w-full h-screen bg-[#05050f] relative overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <Canvas
        camera={{ position: [0, 0, 500], fov: 60 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#05050f"]} />
        <fog attach="fog" args={["#05050f", 550, 1100]} />
        <GalaxyScene
          clusterColors={CLUSTER_COLORS}
          onHover={setHovered}
          onStats={onStats}
        />
        <OrbitControls enableDamping dampingFactor={0.05} />
        <Stars radius={600} depth={200} count={2000} factor={2} />
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.4}
            intensity={1.2}
            radius={0.6}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
      <HUD stats={stats} />
      <ClusterLegend clusters={CLUSTER_COLORS} />
      <AnimatePresence>
        {hovered && (
          <NodeDetail
            key={hovered.id}
            node={hovered}
            clusterColors={CLUSTER_COLORS}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
