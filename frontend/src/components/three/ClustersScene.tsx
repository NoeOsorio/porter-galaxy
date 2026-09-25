import { useMemo } from "react";
import * as THREE from "three";
import type { ClusterGalaxyNode, ClusterGalaxyGraph } from "../../types/clusters";
import { GlowDisc, NodeDisc } from "./NodeDisc";

interface ClustersSceneProps {
  graph: ClusterGalaxyGraph;
  onHover: (node: ClusterGalaxyNode | null) => void;
  onClick: (node: ClusterGalaxyNode) => void;
  selectedNode: ClusterGalaxyNode | null;
  onDoubleClick: (node: ClusterGalaxyNode) => void;
  filteredNodes: Set<string>;
  errorPods: ClusterGalaxyNode[];
}

// Ancestors and descendants of the selected node, so the whole chain from
// cluster down to its pods lights up.
function findFamily(targetId: string, graph: ClusterGalaxyGraph) {
  const nodes = new Set<string>([targetId]);
  const edges = new Set<string>();
  const walk = (id: string, up: boolean) => {
    for (const edge of graph.edges) {
      const next = up ? (edge.to === id ? edge.from : null) : edge.from === id ? edge.to : null;
      if (!next || edges.has(`${edge.from}|${edge.to}`)) continue;
      edges.add(`${edge.from}|${edge.to}`);
      nodes.add(next);
      walk(next, up);
    }
  };
  walk(targetId, true);
  walk(targetId, false);
  return { nodes, edges };
}

export default function ClustersScene({
  graph,
  onHover,
  onClick,
  selectedNode,
  onDoubleClick,
  filteredNodes,
  errorPods,
}: ClustersSceneProps) {
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const errorPodIds = useMemo(() => new Set(errorPods.map((pod) => pod.id)), [errorPods]);
  const family = useMemo(
    () => (selectedNode ? findFamily(selectedNode.id, graph) : { nodes: new Set<string>(), edges: new Set<string>() }),
    [selectedNode, graph],
  );

  return (
    <group>
      {graph.nodes.map((node) => {
        const inFamily = family.nodes.has(node.id);
        const isFiltered = filteredNodes.size > 0 && !filteredNodes.has(node.id);
        const opacity = isFiltered ? 0.2 : selectedNode && !inFamily ? 0.3 : 1;
        return (
          <group key={node.id} position={[node.x, node.y, node.z]}>
            <GlowDisc radius={node.size * 1.9} color={inFamily ? "#00d4ff" : node.glow} opacity={(inFamily ? 0.7 : 0.4) * opacity} />
            <NodeDisc
              node={node}
              radius={node.size}
              color={node.color}
              opacity={opacity}
              blink={errorPodIds.has(node.id)}
              onHover={onHover}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
            />
          </group>
        );
      })}

      {graph.edges.map((edge) => {
        const from = nodesById.get(edge.from);
        const to = nodesById.get(edge.to);
        if (!from || !to) return null;

        const inFamily = family.edges.has(`${edge.from}|${edge.to}`);
        const start = new THREE.Vector3(from.x, from.y, from.z);
        const end = new THREE.Vector3(to.x, to.y, to.z);
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        const width = inFamily
          ? edge.type === "cluster-node" ? 2.5 : edge.type === "node-deployment" ? 2.0 : 1.5
          : edge.type === "cluster-node" ? 1.5 : edge.type === "node-deployment" ? 1.0 : 0.6;

        return (
          <mesh key={`${edge.from}|${edge.to}`} position={midpoint} quaternion={quaternion} raycast={() => null}>
            <cylinderGeometry args={[width, width, length, 8]} />
            <meshBasicMaterial
              color={inFamily ? "#00d4ff" : edge.color}
              transparent
              opacity={inFamily ? 0.7 : selectedNode ? 0.1 : 0.25}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
