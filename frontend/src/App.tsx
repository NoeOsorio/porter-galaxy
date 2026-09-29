import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { StatsGl } from "@react-three/drei";
import Topology from "./Topology";
import Clusters from "./Clusters";
import ConnectionStatus from "./components/ConnectionStatus";
import { useClustersSSE } from "./hooks/useClustersSSE";
import { useSession } from "./hooks/useSession";
import SceneSlot from "./components/SceneSlot";
import Login from "./components/Login";

type View = "topology" | "clusters";

const SHOW_STATS = new URLSearchParams(window.location.search).has("stats");
const HAS_WEBGL2 = !!document.createElement("canvas").getContext("webgl2");

export default function App() {
  const { session, signIn, signOut, expire } = useSession();

  if (!HAS_WEBGL2) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-2 bg-[#05050f] font-['JetBrains_Mono',monospace] text-center px-6">
        <div className="text-white/80 text-sm tracking-[2px]">GALAXY NEEDS WEBGL2</div>
        <div className="text-white/45 text-xs max-w-md">
          This browser has WebGL2 turned off or unsupported. Enable hardware acceleration, or open Galaxy in a
          recent Chrome, Firefox, Safari, or Edge.
        </div>
      </div>
    );
  }
  if (session.status === "checking") return <div className="fixed inset-0 bg-[#05050f]" />;
  if (session.status === "signed-out") return <Login onSignIn={signIn} />;
  // Mounted only while signed in, so signing out also closes the stream.
  return <Galaxy onUnauthorized={expire} onSignOut={session.username ? signOut : undefined} />;
}

function Galaxy({ onUnauthorized, onSignOut }: { onUnauthorized: () => void; onSignOut?: () => void }) {
  const [view, setView] = useState<View>("topology");
  const [dimension, setDimension] = useState<"3d" | "2d">("3d");
  const { snapshot, connection, lastUpdate } = useClustersSSE(onUnauthorized);

  return (
    <>
      <div className="fixed inset-0 bg-[#05050f]" style={{ touchAction: "none" }}>
        <Canvas
          gl={{ antialias: true }}
          camera={{ fov: 60, near: 1, far: 6000, position: [600, 400, 600] }}
        >
          <SceneSlot />
          {SHOW_STATS && <StatsGl className="!left-auto !right-6 !top-16" />}
        </Canvas>
      </div>
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
        <div className="w-px my-1.5 bg-white/[0.12]" />
        <button
          type="button"
          onClick={() => setDimension((d) => (d === "3d" ? "2d" : "3d"))}
          aria-pressed={dimension === "2d"}
          title={dimension === "3d" ? "Switch to a flat 2D view" : "Switch back to 3D"}
          className="px-4 py-2.5 rounded-full transition-all duration-200 text-white/60 hover:text-white/90 hover:bg-white/5"
        >
          {dimension === "3d" ? "3D" : "2D"}
        </button>
        {onSignOut && (
          <>
            <div className="w-px my-1.5 bg-white/[0.12]" />
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2.5 rounded-full transition-all duration-200 text-white/60 hover:text-white/90 hover:bg-white/5"
            >
              Sign out
            </button>
          </>
        )}
      </div>
      {view === "topology" && <Topology snapshot={snapshot} dimension={dimension} />}
      {view === "clusters" && <Clusters snapshot={snapshot} dimension={dimension} />}
      <ConnectionStatus connection={connection} lastUpdate={lastUpdate} hasSnapshot={snapshot !== null} />
    </>
  );
}
