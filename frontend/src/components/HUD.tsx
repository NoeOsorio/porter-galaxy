import type { GraphStats } from "../types/graph";

interface HUDProps {
  title?: string;
  stats: GraphStats;
}

export default function HUD({ title = "GALAXY GRAPH", stats }: HUDProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 24,
        color: "rgba(255,255,255,0.6)",
        fontSize: 11,
        lineHeight: 1.8,
        pointerEvents: "none",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: 3,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ opacity: 0.5 }}>
        {stats.nodes} nodes · {stats.edges} edges · {stats.clusters} clusters
      </div>
      <div style={{ opacity: 0.35, marginTop: 4, fontSize: 10 }}>
        drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
