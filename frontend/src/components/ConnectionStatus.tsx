import type { Connection } from "../hooks/useClustersSSE";
import { useSceneRendered } from "../lib/sceneSlot";

const DOT: Record<Connection, string> = {
  connecting: "bg-white/40",
  live: "bg-[#5bffb0] shadow-[0_0_8px_rgba(91,255,176,0.8)]",
  reconnecting: "bg-[#ffd666] animate-pulse",
  offline: "bg-[#ff3333]",
};

const LABEL: Record<Connection, string> = {
  connecting: "connecting",
  live: "live",
  reconnecting: "reconnecting",
  offline: "offline",
};

interface Props {
  connection: Connection;
  lastUpdate: Date | null;
  hasSnapshot: boolean;
}

export default function ConnectionStatus({ connection, lastUpdate, hasSnapshot }: Props) {
  const rendered = useSceneRendered();
  if (!hasSnapshot || !rendered) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 pointer-events-none font-['JetBrains_Mono',monospace]">
        <div className={`w-2.5 h-2.5 rounded-full ${connection === "offline" ? DOT.offline : "bg-[#00d4ff] animate-pulse"}`} />
        <div className="text-white/70 text-xs tracking-[2px]">
          {connection === "offline" ? "CAN'T REACH THE GALAXY BACKEND · RETRYING" : "CONNECTING TO CLUSTER"}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[rgba(8,8,25,0.85)] border border-white/[0.12] px-3 py-1.5 font-['JetBrains_Mono',monospace] text-[10px] text-white/70 backdrop-blur-xl pointer-events-none"
    >
      <span className={`w-2 h-2 rounded-full ${DOT[connection]}`} />
      <span>{LABEL[connection]}</span>
      {connection !== "live" && lastUpdate && (
        <span className="text-white/40">· last update {lastUpdate.toLocaleTimeString()}</span>
      )}
    </div>
  );
}
