import type { GraphStats } from "../types/graph";

interface HUDProps {
  title?: string;
  stats: GraphStats;
}

export default function HUD({ title = "GALAXY GRAPH", stats }: HUDProps) {
  return (
    <div className="absolute top-5 left-6 text-white/60 text-[11px] leading-[1.8] pointer-events-none font-['JetBrains_Mono','SF_Mono',monospace]">
      <div className="text-base font-medium text-white/85 tracking-[3px] mb-2">
        {title}
      </div>
      <div className="opacity-50">
        {stats.nodes} nodes · {stats.edges} edges · {stats.clusters} clusters
      </div>
      <div className="opacity-[0.35] mt-1 text-[10px]">
        drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
