import type { ProjectedNode, ClusterColor } from "../types/graph";

interface NodeDetailProps {
  node: ProjectedNode;
  clusterColors: ClusterColor[];
}

export default function NodeDetail({ node, clusterColors }: NodeDetailProps) {
  const color = clusterColors[node.cluster];

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 24,
        background: "rgba(10,10,30,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "14px 18px",
        color: "rgba(255,255,255,0.7)",
        fontSize: 11,
        lineHeight: 1.8,
        backdropFilter: "blur(12px)",
        minWidth: 160,
        pointerEvents: "none",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      <div
        style={{
          color: color.core,
          fontWeight: 500,
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        {node.label}
      </div>
      <div>
        cluster:{" "}
        <span style={{ color: color.core }}>{node.cluster}</span>
      </div>
      <div>
        pos: ({Math.round(node.x)}, {Math.round(node.y)}, {Math.round(node.z)})
      </div>
      <div>size: {node.size.toFixed(1)}</div>
    </div>
  );
}
