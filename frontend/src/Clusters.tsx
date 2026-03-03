import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useClustersSSE } from "./hooks/useClustersSSE";
import { transformClusters } from "./lib/transformClusters";
import ClustersScene from "./components/three/ClustersScene";
import type { ClusterGalaxyNode } from "./types/clusters";

const TYPE_ICONS: Record<string, string> = {
  cluster: "🌌",
  node: "🖥️",
  deployment: "📦",
  pod: "⚛️",
};

const TYPE_LABELS: Record<string, string> = {
  cluster: "Cluster",
  node: "Node",
  deployment: "Deployment",
  pod: "Pod",
};

function statusColor(status?: string): string {
  if (!status) return "#ffffff";
  if (status.includes("Running") || status.includes("Ready")) return "#5bffb0";
  if (status.includes("Pending")) return "#ffd666";
  if (status.includes("Failed") || status.includes("Error")) return "#ff3333";
  return "#ffffff";
}

export default function Clusters() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { data, isLoading, isError, error } = useClustersSSE();
  const [hovered, setHovered] = useState<ClusterGalaxyNode | null>(null);
  const [selected, setSelected] = useState<ClusterGalaxyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const clustersGraph = useMemo(() => {
    if (!data?.clusters) return null;
    return transformClusters(data);
  }, [data]);

  const filteredNodes = useMemo(() => {
    if (!clustersGraph) return new Set<string>();

    const matchingNodes = new Set<string>();

    clustersGraph.nodes.forEach((node) => {
      const matchesSearch =
        searchQuery === "" ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.namespace?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = filterType === "all" || node.type === filterType;

      if (matchesSearch && matchesFilter) {
        matchingNodes.add(node.id);
      }
    });

    return matchingNodes;
  }, [clustersGraph, searchQuery, filterType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selected) {
        setSelected(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const handleDoubleClick = (node: ClusterGalaxyNode) => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const distance =
        node.type === "cluster" ? 400 : node.type === "node" ? 250 : 150;
      const direction = new THREE.Vector3(1, 0.5, 1).normalize();
      const newPosition = new THREE.Vector3(
        node.x + direction.x * distance,
        node.y + direction.y * distance,
        node.z + direction.z * distance,
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
      const defaultPosition = new THREE.Vector3(1200, 800, 1200);
      const defaultTarget = new THREE.Vector3(0, 0, 0);
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

  const clusterStats = useMemo(() => {
    if (!data?.clusters) return null;

    const totalNodes = data.clusters.reduce(
      (sum, c) => sum + c.nodes.length,
      0,
    );
    const totalPods = data.clusters.reduce((sum, c) => sum + c.pods.length, 0);
    const totalDeployments = data.clusters.reduce(
      (sum, c) => sum + c.deployments.length,
      0,
    );

    return {
      clusters: data.clusters.length,
      nodes: totalNodes,
      deployments: totalDeployments,
      pods: totalPods,
    };
  }, [data]);

  return (
    <div
      className="w-full h-screen bg-[#05050f] relative overflow-hidden font-['JetBrains_Mono','SF_Mono',monospace]"
      style={{ touchAction: "none" }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/70 text-sm">Loading clusters...</div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-400 text-sm">
            Error loading clusters: {error?.message || "Unknown error"}
          </div>
        </div>
      )}

      {clustersGraph && (
        <Canvas
          camera={{ position: [600, 400, 600], fov: 60, near: 1, far: 5000 }}
          gl={{ antialias: true }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <color attach="background" args={["#05050f"]} />
          <fog attach="fog" args={["#05050f", 1200, 3000]} />
          <ClustersScene
            graph={clustersGraph}
            onHover={setHovered}
            onClick={setSelected}
            selectedNode={selected}
            onDoubleClick={handleDoubleClick}
            filteredNodes={filteredNodes}
          />
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.5}
            zoomSpeed={0.8}
            minDistance={100}
            maxDistance={1500}
            target={[0, 0, 0]}
            enablePan={true}
            panSpeed={0.5}
            screenSpacePanning={true}
          />
          <Stars radius={1500} depth={500} count={3000} factor={3} />
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

      <div className="absolute top-20 left-6 flex flex-col gap-3 pointer-events-auto">
        <div className="text-white/70 text-[11px] leading-[1.8] pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-lg font-semibold text-white/90 tracking-[4px]">
              CLUSTERS
            </div>
          </div>
          <div className="opacity-40 text-[10px]">
            multicluster galaxy view · drag to rotate · scroll to zoom
          </div>
        </div>

        {clusterStats && (
          <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl p-3 backdrop-blur-xl">
            <div className="text-white/70 text-[10px] mb-2 font-semibold opacity-80">
              OVERVIEW
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                <span className="text-white/60">
                  {clusterStats.clusters} cluster
                  {clusterStats.clusters !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#45caff] shadow-[0_0_8px_rgba(69,202,255,0.6)]" />
                <span className="text-white/60">
                  {clusterStats.nodes} node{clusterStats.nodes !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#fb923c] shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
                <span className="text-white/60">
                  {clusterStats.deployments} deployment
                  {clusterStats.deployments !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#5bffb0] shadow-[0_0_8px_rgba(91,255,176,0.6)]" />
                <span className="text-white/60">
                  {clusterStats.pods} pod{clusterStats.pods !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl p-3 backdrop-blur-xl">
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-[11px] placeholder-white/40 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all"
          />

          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                filterType === "all"
                  ? "bg-white/20 text-white/90 border border-white/20"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType("cluster")}
              className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                filterType === "cluster"
                  ? "bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              Cluster
            </button>
            <button
              type="button"
              onClick={() => setFilterType("node")}
              className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                filterType === "node"
                  ? "bg-[#45caff]/20 text-[#45caff] border border-[#45caff]/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              Node
            </button>
            <button
              type="button"
              onClick={() => setFilterType("deployment")}
              className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                filterType === "deployment"
                  ? "bg-[#fb923c]/20 text-[#fb923c] border border-[#fb923c]/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              Deploy
            </button>
            <button
              type="button"
              onClick={() => setFilterType("pod")}
              className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                filterType === "pod"
                  ? "bg-[#5bffb0]/20 text-[#5bffb0] border border-[#5bffb0]/30"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
              }`}
            >
              Pod
            </button>
          </div>

          {(searchQuery || filterType !== "all") && (
            <div className="mt-2 text-[9px] text-white/50">
              {filteredNodes.size}{" "}
              {filteredNodes.size === 1 ? "resource" : "resources"} found
            </div>
          )}
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
              <span className="text-white/60">Cluster</span>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#45caff] shadow-[0_0_8px_rgba(69,202,255,0.6)]" />
              <span className="text-white/60">Node</span>
            </div>
            <div className="flex items-center gap-2.5 text-[10px]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#fb923c] shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
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
              {hovered.type === "node" && hovered.metadata && (
                <>
                  {hovered.metadata.cpu && (
                    <div>
                      cpu:{" "}
                      <span className="opacity-80">{hovered.metadata.cpu}</span>
                    </div>
                  )}
                  {hovered.metadata.memory && (
                    <div>
                      memory:{" "}
                      <span className="opacity-80">
                        {hovered.metadata.memory}
                      </span>
                    </div>
                  )}
                </>
              )}
              {hovered.type === "deployment" && hovered.metadata && (
                <>
                  {hovered.metadata.desired !== undefined && (
                    <div>
                      replicas:{" "}
                      <span className="opacity-80">
                        {hovered.metadata.ready}/{hovered.metadata.desired}
                      </span>
                    </div>
                  )}
                </>
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
            className="absolute top-[260px] left-6 pointer-events-auto min-w-[260px] max-w-[320px]"
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
              </div>

              {selected.type === "node" && selected.metadata && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">
                    CAPACITY
                  </div>
                  {selected.metadata.cpu && (
                    <div>
                      cpu:{" "}
                      <span className="text-white/90">
                        {selected.metadata.cpu}
                      </span>
                    </div>
                  )}
                  {selected.metadata.memory && (
                    <div>
                      memory:{" "}
                      <span className="text-white/90">
                        {selected.metadata.memory}
                      </span>
                    </div>
                  )}
                </div>
              )}

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
                      <span className="text-white/60 text-[10px] font-mono break-all">
                        {selected.metadata.nodeId}
                      </span>
                    </div>
                  )}
                  {selected.metadata.controllerId && (
                    <div>
                      controller:{" "}
                      <span className="text-white/60 text-[10px] font-mono break-all">
                        {selected.metadata.controllerId}
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
