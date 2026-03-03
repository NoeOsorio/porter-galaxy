import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  K8sMoleculeNode,
  K8sMoleculeClusterNode,
  K8sMoleculeDeploymentNode,
} from "./types/k8sMolecule";
import { useClustersSSE } from "./hooks/useClustersSSE";
import { transformClusterData } from "./lib/transformClusterData";
import ClusterScene from "./components/three/ClusterScene";

type DrillLevel = "cluster" | "node" | "deployment" | "pod";

const LEVEL_LABELS: Record<DrillLevel, string> = {
  cluster: "Cluster",
  node: "Node",
  deployment: "Deployment",
  pod: "Pod",
};

const DRILL_ORDER: DrillLevel[] = ["cluster", "node", "deployment", "pod"];

const ZOOM_THRESHOLDS = {
  node: 400,
  deployment: 200,
  pod: 80,
};

export default function ClusterExplorer() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { data, isLoading, isError, error } = useClustersSSE();

  const [level, setLevel] = useState<DrillLevel>("cluster");
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [hovered, setHovered] = useState<K8sMoleculeNode | null>(null);
  const [selected, setSelected] = useState<K8sMoleculeNode | null>(null);
  const [cameraDistance, setCameraDistance] = useState(500);

  useEffect(() => {
    if (cameraDistance > ZOOM_THRESHOLDS.node) {
      setLevel("cluster");
      setFocusPath([]);
    } else if (cameraDistance > ZOOM_THRESHOLDS.deployment) {
      if (level !== "node") {
        setLevel("node");
        setFocusPath([]);
      }
    } else if (cameraDistance > ZOOM_THRESHOLDS.pod) {
      if (level !== "deployment" && focusPath.length >= 1) {
        setLevel("deployment");
      }
    } else {
      if (level !== "pod" && focusPath.length >= 2) {
        setLevel("pod");
      }
    }
  }, [cameraDistance, level, focusPath.length]);

  const onDrillDown = useCallback((entity: K8sMoleculeNode) => {
    if (entity.kind === "Node") {
      setLevel("deployment");
      setFocusPath([entity.id]);
      setSelected(null);
    } else if (entity.kind === "Deployment") {
      setLevel("pod");
      setFocusPath((prev) => [...prev, entity.id]);
      setSelected(null);
    }
  }, []);

  const goToLevel = useCallback((targetLevel: DrillLevel) => {
    if (targetLevel === "cluster") {
      setLevel("cluster");
      setFocusPath([]);
    } else {
      const idx = DRILL_ORDER.indexOf(targetLevel);
      setLevel(targetLevel);
      setFocusPath((prev) => prev.slice(0, idx));
    }
    setSelected(null);
  }, []);

  const transformedData = useMemo(() => {
    if (!data?.clusters[0]) return null;
    return transformClusterData(data.clusters[0]);
  }, [data]);

  const breadcrumbSegments = useMemo(() => {
    const segments: { level: DrillLevel; label: string }[] = [
      { level: "cluster", label: "Cluster" },
    ];
    if (level === "cluster" || !transformedData) return segments;

    if (focusPath.length >= 1) {
      const nodeId = focusPath[0]!;
      const node = transformedData.nodes.find((n) => n.id === nodeId);
      segments.push({ level: "node", label: node?.name ?? nodeId });
    }
    if (focusPath.length >= 2 && level === "pod") {
      const depId = focusPath[1]!;
      const dep = transformedData.deployments.find((d) => d.id === depId);
      segments.push({ level: "deployment", label: dep?.name ?? depId });
    }
    return segments;
  }, [transformedData, level, focusPath]);

  return (
    <div
      className="w-full h-screen bg-[#05050f] relative overflow-hidden font-['JetBrains_Mono','SF_Mono',monospace]"
      style={{ touchAction: "none" }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/70 text-sm">Loading cluster data...</div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-400 text-sm">
            Error loading clusters: {error?.message || "Unknown error"}
          </div>
        </div>
      )}

      {transformedData && (
        <Canvas
          camera={{ position: [0, 0, 500], fov: 60 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#05050f"]} />
          <fog attach="fog" args={["#05050f", 300, 900]} />
          <ClusterScene
            clusterData={transformedData}
            level={level}
            focusPath={focusPath}
            onDrillDown={onDrillDown}
            onHover={setHovered}
            onClick={setSelected}
            onCameraDistanceChange={setCameraDistance}
            controlsRef={
              controlsRef as React.RefObject<{ target: THREE.Vector3 } | null>
            }
          />
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={5}
            maxDistance={600}
          />
          <Stars radius={500} depth={200} count={2000} factor={2} />
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
        <div className="text-lg font-semibold text-white/90 tracking-[4px] mb-1.5">
          CLUSTER EXPLORER
        </div>
        <div className="opacity-40 text-[10px]">
          zoom in to drill deeper · zoom out to go back · click for details
        </div>
      </div>

      <div className="absolute top-[110px] left-6 flex items-center gap-1.5 text-[11px] text-white/60 pointer-events-auto">
        {breadcrumbSegments.map((seg, i) => (
          <span key={seg.level} className="flex items-center gap-1.5">
            {i > 0 && <span className="opacity-50">/</span>}
            <button
              type="button"
              onClick={() => goToLevel(seg.level)}
              className={`transition-colors ${
                seg.level === level
                  ? "text-white/90"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {seg.label}
            </button>
          </span>
        ))}
        {level !== "cluster" && (
          <span className="opacity-30 text-[9px] ml-2">
            {LEVEL_LABELS[level]} level
          </span>
        )}
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
              <div
                className="font-medium text-[13px]"
                style={{ color: hovered.color || "#fff" }}
              >
                {hovered.name}
              </div>
              <div className="opacity-40 text-[9px] mt-0.5">{hovered.kind}</div>
              {"replicas" in hovered && hovered.replicas !== undefined && (
                <div className="mt-1">replicas: {hovered.replicas}</div>
              )}
              {"status" in hovered && hovered.status && (
                <div>status: {hovered.status}</div>
              )}
              {"containerNames" in hovered && hovered.containerNames && (
                <div>
                  containers:{" "}
                  <span className="opacity-80">
                    {hovered.containerNames.join(", ")}
                  </span>
                </div>
              )}
              {hasChildrenEntity(hovered) && (
                <div className="mt-1 opacity-40 text-[9px]">
                  zoom in to explore
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
            className="absolute top-[150px] left-6 pointer-events-auto min-w-[240px] max-w-[300px]"
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
                  {selected.name}
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
                {"replicas" in selected && selected.replicas !== undefined && (
                  <div>replicas: {selected.replicas}</div>
                )}
                {"status" in selected && selected.status && (
                  <div>status: {selected.status}</div>
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function hasChildrenEntity(e: K8sMoleculeNode): boolean {
  if (e.kind === "Node") {
    return (e as K8sMoleculeClusterNode).deployments.length > 0;
  }
  if (e.kind === "Deployment") {
    return (e as K8sMoleculeDeploymentNode).pods.length > 0;
  }
  return false;
}
