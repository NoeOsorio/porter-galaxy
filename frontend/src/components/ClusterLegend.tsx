import type { ClusterColor } from "../types/graph";

interface ClusterLegendProps {
  clusters: ClusterColor[];
}

export default function ClusterLegend({ clusters }: ClusterLegendProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 24,
        display: "flex",
        gap: 16,
        pointerEvents: "none",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      {clusters.map((c, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: c.core,
              boxShadow: `0 0 8px ${c.glow}`,
            }}
          />
          C{i}
        </div>
      ))}
    </div>
  );
}
