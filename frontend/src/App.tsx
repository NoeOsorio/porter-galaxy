import { useState } from "react";
import GalaxyGraph from "./GalaxyGraph";
import K8sGalaxy from "./K8sGalaxy";
import ClusterExplorer from "./ClusterExplorer";
import K8sMolecule from "./K8sMolecule";
import Topology from "./Topology";

type View = "galaxy" | "k8s" | "cluster" | "molecule" | "topology";

export default function App() {
  const [view, setView] = useState<View>("molecule");

  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-10 flex gap-1 rounded-full bg-black/40 border border-white/10 p-1 font-['JetBrains_Mono',monospace] text-xs">
        <button
          type="button"
          onClick={() => setView("galaxy")}
          className={`px-4 py-2 rounded-full transition-colors ${
            view === "galaxy" ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          Galaxy
        </button>
        <button
          type="button"
          onClick={() => setView("k8s")}
          className={`px-4 py-2 rounded-full transition-colors ${
            view === "k8s" ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          K8s Galaxy
        </button>
        <button
          type="button"
          onClick={() => setView("cluster")}
          className={`px-4 py-2 rounded-full transition-colors ${
            view === "cluster" ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          Cluster Explorer
        </button>
        <button
          type="button"
          onClick={() => setView("molecule")}
          className={`px-4 py-2 rounded-full transition-colors ${
            view === "molecule" ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          K8s Molecule
        </button>
        <button
          type="button"
          onClick={() => setView("topology")}
          className={`px-4 py-2 rounded-full transition-colors ${
            view === "topology" ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
          }`}
        >
          Topology
        </button>
      </div>
      {view === "galaxy" && <GalaxyGraph />}
      {view === "k8s" && <K8sGalaxy />}
      {view === "cluster" && <ClusterExplorer />}
      {view === "molecule" && <K8sMolecule />}
      {view === "topology" && <Topology />}
    </>
  );
}
