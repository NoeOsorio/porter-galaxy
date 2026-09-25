import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import CameraRig, { type CameraRigHandle } from "./components/CameraRig";
import { useScene } from "./lib/sceneSlot";
import type { ApiClustersResponse } from "./types/api";
import { transformTopology } from "./lib/transformTopology";
import TopologyScene from "./components/three/TopologyScene";
import type { TopologyNode } from "./types/topology";
import { STATE_COLORS, type State } from "./lib/objectKey";

const TYPE_ICONS: Record<string, string> = {
  internet: "🌐",
  loadbalancer: "⚖️",
  ingress: "🚪",
  service: "🔀",
  deployment: "📦",
  pod: "⚛️",
};

const TYPE_LABELS: Record<string, string> = {
  internet: "Internet",
  loadbalancer: "Load Balancer",
  ingress: "Ingress",
  service: "Service",
  deployment: "Deployment",
  pod: "Pod",
};

function stateColor(state?: State): string {
  return state ? STATE_COLORS[state].color : "#ffffff";
}

export default function Topology({ snapshot: data }: { snapshot: ApiClustersResponse | null }) {
  const rigRef = useRef<CameraRigHandle>(null);
  const [hovered, setHovered] = useState<TopologyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string; type: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedClusterIndex, setSelectedClusterIndex] = useState(0);

  const topologyGraph = useMemo(() => {
    if (!data?.clusters || !data.clusters[selectedClusterIndex]) return null;
    return transformTopology(data.clusters[selectedClusterIndex]);
  }, [data, selectedClusterIndex]);

  // Selection follows the object by key across snapshots. An object that
  // disappears stays in the panel marked deleted until the next snapshot.
  const [selection, setSelection] = useState<{ node: TopologyNode; missing: boolean } | null>(null);
  const [seenGraph, setSeenGraph] = useState(topologyGraph);
  if (topologyGraph !== seenGraph) {
    setSeenGraph(topologyGraph);
    if (selection) {
      const live = topologyGraph?.nodes.find((n) => n.id === selection.node.id);
      if (live) setSelection({ node: live, missing: false });
      else if (selection.missing) setSelection(null);
      else setSelection({ ...selection, missing: true });
    }
  }
  const selected = selection?.node ?? null;
  const selectionMissing = selection?.missing ?? false;
  const setSelected = (node: TopologyNode | null) => setSelection(node ? { node, missing: false } : null);

  const filteredNodes = useMemo(() => {
    if (!topologyGraph) return new Set<string>();
    
    const matchingNodes = new Set<string>();
    
    topologyGraph.nodes.forEach(node => {
      const matchesSearch = searchQuery === "" || 
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFilter = filterType === "all" || node.type === filterType;
      
      if (matchesSearch && matchesFilter) {
        matchingNodes.add(node.id);
      }
    });
    
    return matchingNodes;
  }, [topologyGraph, searchQuery, filterType]);

  const errorPods = useMemo(() => {
    if (!topologyGraph) return [];
    return topologyGraph.nodes.filter(
      node => node.type === "pod" && node.state === "failed"
    );
  }, [topologyGraph]);

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
    rigRef.current?.flyTo(node.id);
  };

  const handleNodeClick = (node: TopologyNode) => {
    setSelected(node);
    rigRef.current?.flyTo(node.id);
  };

  const handleSearchEnter = () => {
    if (!searchQuery || !topologyGraph) return;
    const matches = [...filteredNodes];
    if (matches.length === 1) {
      const node = topologyGraph.nodes.find((n) => n.id === matches[0]);
      if (node) handleNodeClick(node);
    } else if (matches.length > 1) {
      rigRef.current?.frame(matches);
    }
  };

  const handleResetView = () => {
    rigRef.current?.frame();
    setSelected(null);
  };

  const handleAlarmClick = () => {
    if (errorPods.length > 0) {
      const firstErrorPod = errorPods[0];
      if (firstErrorPod) {
        setSelected(firstErrorPod);
        handleDoubleClick(firstErrorPod);
      }
    }
  };


  const scene = topologyGraph && (
    <>
      <color attach="background" args={["#05050f"]} />
      <fog attach="fog" args={["#05050f", 900, 2000]} />
      <TopologyScene
        graph={topologyGraph}
        onHover={setHovered}
        onClick={handleNodeClick}
        selectedNode={selectionMissing ? null : selected}
        onDoubleClick={handleDoubleClick}
        filteredNodes={filteredNodes}
        onEdgeHover={setHoveredEdge}
        errorPods={errorPods}
      />
      <CameraRig key={selectedClusterIndex} ref={rigRef} nodes={topologyGraph.nodes} edges={topologyGraph.edges} azimuth={0.7} polar={1.15} />
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          intensity={1.5}
          radius={0.7}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
  useScene(scene, () => setSelected(null));

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none font-['JetBrains_Mono','SF_Mono',monospace]"
    >

      <div className="absolute top-20 left-6 flex flex-col gap-3 pointer-events-auto">
        <div className="text-white/70 text-[11px] leading-[1.8] pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-lg font-semibold text-white/90 tracking-[4px]">
              TOPOLOGY
            </div>
          </div>
          <div className="opacity-40 text-[10px]">
            network flow visualization · drag to rotate · scroll to zoom
          </div>
        </div>

        {data?.clusters && data.clusters.length > 1 && (
          <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl p-3 backdrop-blur-xl">
            <div className="text-white/70 text-[10px] mb-2 font-semibold opacity-80">
              CLUSTER
            </div>
            <select
              value={selectedClusterIndex}
              onChange={(e) => {
                setSelectedClusterIndex(Number(e.target.value));
                setSelected(null);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-[11px] focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all cursor-pointer"
            >
              {data.clusters.map((cluster, index) => (
                <option key={cluster.id} value={index} className="bg-[#08081a] text-white/90">
                  {cluster.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl backdrop-blur-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-3 py-2 text-white/70 text-[10px] font-semibold hover:bg-white/5 transition-all flex items-center justify-between pointer-events-auto"
          >
            <span>FILTERS & SEARCH</span>
            <span className="text-[12px]">{showFilters ? "−" : "+"}</span>
          </button>
          
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-3 pt-0">
                  <input
                    type="text"
                    placeholder="Search nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearchEnter();
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-[11px] placeholder-white/40 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all"
                  />
                  
                  <div className="flex gap-1.5 mt-2">
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
                      onClick={() => setFilterType("internet")}
                      className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                        filterType === "internet"
                          ? "bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30"
                          : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      Internet
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType("loadbalancer")}
                      className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                        filterType === "loadbalancer"
                          ? "bg-[#f472b6]/20 text-[#f472b6] border border-[#f472b6]/30"
                          : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      LB
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType("ingress")}
                      className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                        filterType === "ingress"
                          ? "bg-[#a78bfa]/20 text-[#a78bfa] border border-[#a78bfa]/30"
                          : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      Ingress
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType("service")}
                      className={`px-2.5 py-1 rounded text-[9px] font-medium transition-all ${
                        filterType === "service"
                          ? "bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30"
                          : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      Svc
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
                      {filteredNodes.size === 0 ? "No matches" : `${filteredNodes.size} ${filteredNodes.size === 1 ? "node" : "nodes"} found`}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="absolute top-20 right-6 flex flex-col gap-3 pointer-events-auto">
        {errorPods.length > 0 && (
          <motion.button
            type="button"
            onClick={handleAlarmClick}
            className="bg-[rgba(139,0,0,0.8)] border border-red-500/30 rounded-xl py-2.5 px-4 backdrop-blur-xl text-red-400 text-[10px] font-semibold hover:bg-[rgba(139,0,0,0.95)] hover:text-red-300 transition-all duration-200 hover:border-red-500/50 flex items-center gap-2"
            animate={{
              boxShadow: [
                "0 0 10px rgba(255,51,51,0.3)",
                "0 0 20px rgba(255,51,51,0.6)",
                "0 0 10px rgba(255,51,51,0.3)",
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <span className="text-base">🚨</span>
            <span>{errorPods.length} ERROR{errorPods.length > 1 ? 'S' : ''}</span>
          </motion.button>
        )}
        <button
          type="button"
          onClick={handleResetView}
          className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl py-2.5 px-4 backdrop-blur-xl text-white/70 text-[10px] font-semibold hover:bg-[rgba(8,8,25,0.95)] hover:text-white/90 transition-all duration-200 hover:border-white/[0.15]"
        >
          RESET VIEW
        </button>
        
        <div className="bg-[rgba(8,8,25,0.8)] border border-white/[0.08] rounded-xl backdrop-blur-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLegend(!showLegend)}
            className="w-full px-4 py-2.5 text-white/70 text-[10px] font-semibold hover:bg-white/5 transition-all flex items-center justify-between pointer-events-auto"
          >
            <span>LEGEND</span>
            <span className="text-[12px]">{showLegend ? "−" : "+"}</span>
          </button>
          
          <AnimatePresence>
            {showLegend && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2 pointer-events-none">
                  <div className="flex items-center gap-2.5 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                    <span className="text-white/60">Internet</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f472b6] shadow-[0_0_8px_rgba(244,114,182,0.6)]" />
                    <span className="text-white/60">Load Balancer</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#a78bfa] shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
                    <span className="text-white/60">Ingress</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                    <span className="text-white/60">Service</span>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {hoveredEdge && (
          <motion.div
            key={`edge-${hoveredEdge.from}-${hoveredEdge.to}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 left-6 pointer-events-none min-w-[220px]"
          >
            <div className="bg-[rgba(8,8,25,0.9)] border border-white/[0.08] rounded-xl py-3.5 px-[18px] text-white/70 text-[11px] leading-[1.9] backdrop-blur-xl">
              <div className="font-medium text-[13px] text-white/90 mb-2">
                Connection
              </div>
              <div>
                from: <span className="text-white/90">{hoveredEdge.from}</span>
              </div>
              <div>
                to: <span className="text-white/90">{hoveredEdge.to}</span>
              </div>
              <div>
                type: <span className="text-white/90 capitalize">{hoveredEdge.type}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <span style={{ color: stateColor(hovered.state) }}>
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
            className={`absolute left-6 pointer-events-auto min-w-[260px] max-w-[320px] ${showFilters ? "top-[290px]" : "top-[200px]"}`}
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
                  {selectionMissing && (
                    <span className="ml-2 text-[10px] font-normal text-red-400">deleted</span>
                  )}
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
                    <span style={{ color: stateColor(selected.state) }}>
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

              {selected.type === "loadbalancer" && selected.metadata?.address && (
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="text-[10px] font-semibold opacity-60 mb-1.5">
                    ADDRESS
                  </div>
                  <div className="text-white/60 text-[10px] font-mono break-all">
                    {selected.metadata.address}
                  </div>
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
