import type { ClusterColor } from "../types/graph";

interface ClusterLegendProps {
  clusters: ClusterColor[];
}

export default function ClusterLegend({ clusters }: ClusterLegendProps) {
  return (
    <div className="absolute bottom-6 left-6 flex gap-4 pointer-events-none font-['JetBrains_Mono','SF_Mono',monospace]">
      {clusters.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px] text-white/40">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: c.core, boxShadow: `0 0 8px ${c.glow}` }}
          />
          C{i}
        </div>
      ))}
    </div>
  );
}
