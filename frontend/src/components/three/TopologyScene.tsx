import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { TopologyNode, TopologyGraph, TopologyEdge } from "../../types/topology";
import { GlowDisc, NodeDisc } from "./NodeDisc";
import { setCursor, solidDiscTexture } from "../../lib/discTextures";

interface TopologySceneProps {
  graph: TopologyGraph;
  onHover: (node: TopologyNode | null) => void;
  onClick: (node: TopologyNode) => void;
  selectedNode: TopologyNode | null;
  onDoubleClick: (node: TopologyNode) => void;
  filteredNodes: Set<string>;
  onEdgeHover: (edge: { from: string; to: string; type: string } | null) => void;
  errorPods: TopologyNode[];
}

const PARTICLES = 5;

function findPathToNode(targetNodeId: string, graph: TopologyGraph): TopologyEdge[] {
  const path: TopologyEdge[] = [];
  const visited = new Set<string>();

  function dfs(currentId: string): boolean {
    if (currentId === targetNodeId) return true;
    visited.add(currentId);
    for (const edge of graph.edges) {
      if (edge.from !== currentId || visited.has(edge.to)) continue;
      path.push(edge);
      if (dfs(edge.to)) return true;
      path.pop();
    }
    return false;
  }

  const internetNode = graph.nodes.find((n) => n.type === "internet");
  if (internetNode) dfs(internetNode.id);
  return path;
}

function edgeTransform(from: TopologyNode, to: TopologyNode) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return { length, midpoint, quaternion };
}

export default function TopologyScene({
  graph,
  onHover,
  onClick,
  selectedNode,
  onDoubleClick,
  filteredNodes,
  onEdgeHover,
  errorPods,
}: TopologySceneProps) {
  const particleRefs = useRef<(THREE.Group | null)[]>([]);
  const progress = useRef(0);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const errorPodIds = useMemo(() => new Set(errorPods.map((pod) => pod.id)), [errorPods]);
  const flowPath = useMemo(
    () => (selectedNode ? findPathToNode(selectedNode.id, graph) : []),
    [selectedNode, graph],
  );
  const nodesInPath = useMemo(() => {
    const ids = new Set<string>();
    flowPath.forEach((edge) => {
      ids.add(edge.from);
      ids.add(edge.to);
    });
    return ids;
  }, [flowPath]);
  const edgesInPath = useMemo(() => new Set(flowPath.map((e) => `${e.from}|${e.to}`)), [flowPath]);

  // Particles travel the Internet → selected node path, evenly spaced.
  useFrame((_, delta) => {
    if (flowPath.length === 0) return;
    progress.current = (progress.current + delta * 0.8) % flowPath.length;
    particleRefs.current.forEach((group, i) => {
      if (!group) return;
      const p = (progress.current + (i / PARTICLES) * flowPath.length) % flowPath.length;
      const edge = flowPath[Math.floor(p)]!;
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) return;
      const t = p - Math.floor(p);
      group.position.set(
        THREE.MathUtils.lerp(from.x, to.x, t),
        THREE.MathUtils.lerp(from.y, to.y, t),
        THREE.MathUtils.lerp(from.z, to.z, t),
      );
    });
  });

  return (
    <group>
      {graph.nodes.map((node) => {
        const isInPath = nodesInPath.has(node.id);
        const isFiltered = filteredNodes.size > 0 && !filteredNodes.has(node.id);
        const opacity = isFiltered ? 0.2 : 1;
        return (
          <group key={node.id} position={[node.x, node.y, node.z]}>
            <GlowDisc radius={node.size * 1.8} color={isInPath ? "#00d4ff" : node.glow} opacity={(isInPath ? 0.6 : 0.35) * opacity} />
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

        const isInPath = edgesInPath.has(`${edge.from}|${edge.to}`);
        const { length, midpoint, quaternion } = edgeTransform(from, to);
        const baseWidth = isInPath
          ? edge.type === "internet" ? 2.5 : edge.type === "lb" ? 2.0 : edge.type === "ingress" ? 1.5 : 1.2
          : edge.type === "internet" ? 1.5 : edge.type === "lb" ? 1.2 : edge.type === "ingress" ? 1.0 : 0.6;

        return (
          <mesh
            key={`${edge.from}|${edge.to}`}
            position={midpoint}
            quaternion={quaternion}
            onPointerOver={(e) => {
              e.stopPropagation();
              onEdgeHover({ from: edge.from, to: edge.to, type: edge.type });
              setCursor("pointer");
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              onEdgeHover(null);
              setCursor("default");
            }}
          >
            <cylinderGeometry args={[baseWidth * 0.3, baseWidth, length, 8]} />
            <meshBasicMaterial
              color={isInPath ? "#00d4ff" : edge.color}
              transparent
              opacity={isInPath ? 0.7 : edge.active ? 0.5 : 0.2}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {flowPath.length > 0 &&
        Array.from({ length: PARTICLES }, (_, i) => (
          <group key={`particle-${i}`} ref={(g) => { particleRefs.current[i] = g; }}>
            <GlowDisc radius={14} color="#00d4ff" opacity={0.8} />
            <sprite scale={[10, 10, 1]} raycast={() => null}>
              <spriteMaterial map={solidDiscTexture()} color="#ffffff" transparent toneMapped={false} />
            </sprite>
          </group>
        ))}
    </group>
  );
}
