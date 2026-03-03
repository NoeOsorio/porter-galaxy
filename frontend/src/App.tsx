import { useState } from "react";
import GalaxyGraph from "./GalaxyGraph";
import K8sGalaxy from "./K8sGalaxy";
import ClusterExplorer from "./ClusterExplorer";
import K8sMolecule from "./K8sMolecule";
import Topology from "./Topology";
import Clusters from "./Clusters";

type View = "galaxy" | "k8s" | "cluster" | "molecule" | "topology" | "clusters";

export default function App() {
  const [view, setView] = useState<View>("topology");

  return (
    <>
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex gap-1 rounded-full bg-[rgba(8,8,25,0.85)] border border-white/[0.12] p-1.5 font-['JetBrains_Mono',monospace] text-xs backdrop-blur-xl shadow-lg">
        <button
          type="button"
          onClick={() => setView("topology")}
          className={`px-5 py-2.5 rounded-full transition-all duration-200 ${
            view === "topology" 
              ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]" 
              : "text-white/60 hover:text-white/90 hover:bg-white/5"
          }`}
        >
          Topology
        </button>
        <button
          type="button"
          onClick={() => setView("clusters")}
          className={`px-5 py-2.5 rounded-full transition-all duration-200 ${
            view === "clusters" 
              ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]" 
              : "text-white/60 hover:text-white/90 hover:bg-white/5"
          }`}
        >
          Clusters
        </button>
      </div>
      {view === "galaxy" && <GalaxyGraph />}
      {view === "k8s" && <K8sGalaxy />}
      {view === "cluster" && <ClusterExplorer />}
      {view === "molecule" && <K8sMolecule />}
      {view === "topology" && <Topology />}
      {view === "clusters" && <Clusters />}
    </>
  );
}
