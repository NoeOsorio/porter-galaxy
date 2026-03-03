import { motion } from "framer-motion";
import type { Node, ClusterColor } from "../types/graph";

interface NodeDetailProps {
  node: Node;
  clusterColors: ClusterColor[];
}

export default function NodeDetail({ node, clusterColors }: NodeDetailProps) {
  const color = clusterColors[node.cluster];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      className="absolute top-5 right-6 pointer-events-none"
    >
      <div className="bg-[rgba(10,10,30,0.85)] border border-white/[0.08] rounded-lg py-3.5 px-[18px] text-white/70 text-[11px] leading-[1.8] backdrop-blur-xl min-w-[160px] font-['JetBrains_Mono','SF_Mono',monospace]">
        <div
          className="font-medium text-[13px] mb-1"
          style={{ color: color.core }}
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
    </motion.div>
  );
}
