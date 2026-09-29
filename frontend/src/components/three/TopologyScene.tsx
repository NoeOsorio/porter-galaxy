import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { TopologyNode, TopologyGraph, TopologyEdge } from "../../types/topology";
import type { LayoutStore } from "../../lib/layout/layoutStore";
import { readPosition } from "../../lib/layout/layoutStore";
import { usePicking } from "../../lib/picking";
import { writeColor } from "../../lib/colorBuffers";
import { solidDiscTexture } from "../../lib/discTextures";
import NodeInstances, { type NodeAttributes } from "./NodeInstances";
import EdgeSegments, { type EdgeList } from "./EdgeSegments";

interface TopologySceneProps {
  graph: TopologyGraph;
  store: LayoutStore;
  onHover: (node: TopologyNode | null) => void;
  onClick: (node: TopologyNode) => void;
  onDoubleClick: (node: TopologyNode) => void;
  onMiss: () => void;
  selectedNode: TopologyNode | null;
  filteredNodes: Set<string>;
  errorPods: TopologyNode[];
}

const PARTICLES = 5;
const PATH_COLOR = "#00d4ff";

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

export default function TopologyScene({
  graph,
  store,
  onHover,
  onClick,
  onDoubleClick,
  onMiss,
  selectedNode,
  filteredNodes,
  errorPods,
}: TopologySceneProps) {
  const particleRefs = useRef<(THREE.Group | null)[]>([]);
  const progress = useRef(0);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const flowPath = useMemo(() => (selectedNode ? findPathToNode(selectedNode.id, graph) : []), [selectedNode, graph]);

  const attributes = useMemo<NodeAttributes>(() => {
    const n = graph.nodes.length;
    const inPath = new Set(flowPath.flatMap((e) => [e.from, e.to]));
    const failing = new Set(errorPods.map((p) => p.id));
    const attrs: NodeAttributes = {
      keys: graph.nodes.map((node) => node.id),
      colors: new Float32Array(n * 3),
      glowColors: new Float32Array(n * 3),
      radii: new Float32Array(n),
      opacities: new Float32Array(n),
      blink: new Float32Array(n),
      pulse: new Float32Array(n),
    };
    graph.nodes.forEach((node, i) => {
      writeColor(attrs.colors, i, node.color);
      writeColor(attrs.glowColors, i, inPath.has(node.id) ? PATH_COLOR : node.glow);
      attrs.radii[i] = node.size;
      attrs.opacities[i] = filteredNodes.size > 0 && !filteredNodes.has(node.id) ? 0.2 : 1;
      attrs.blink[i] = failing.has(node.id) ? 1 : 0;
      attrs.pulse[i] = node.pulse ? 1 : 0;
    });
    return attrs;
  }, [graph.nodes, flowPath, filteredNodes, errorPods]);

  const baseEdges = useMemo<EdgeList>(() => {
    const colors = new Float32Array(graph.edges.length * 3);
    graph.edges.forEach((e, i) => writeColor(colors, i, e.color, e.active ? 0.6 : 0.25));
    return { from: graph.edges.map((e) => e.from), to: graph.edges.map((e) => e.to), colors };
  }, [graph.edges]);

  const pathEdges = useMemo<EdgeList>(() => {
    const colors = new Float32Array(flowPath.length * 3);
    flowPath.forEach((_, i) => writeColor(colors, i, PATH_COLOR));
    return { from: flowPath.map((e) => e.from), to: flowPath.map((e) => e.to), colors };
  }, [flowPath]);

  usePicking(store, attributes.keys, attributes.radii, {
    onHover: (key) => onHover(key ? (nodesById.get(key) ?? null) : null),
    onClick: (key) => {
      const node = nodesById.get(key);
      if (node) onClick(node);
    },
    onDoubleClick: (key) => {
      const node = nodesById.get(key);
      if (node) onDoubleClick(node);
    },
    onMiss,
  });

  // Particles travel the Internet → selected node path, evenly spaced.
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    if (flowPath.length === 0) return;
    progress.current = (progress.current + delta * 0.8) % flowPath.length;
    particleRefs.current.forEach((group, i) => {
      if (!group) return;
      const p = (progress.current + (i / PARTICLES) * flowPath.length) % flowPath.length;
      const edge = flowPath[Math.floor(p)]!;
      if (!readPosition(store, edge.from, from) || !readPosition(store, edge.to, to)) return;
      group.position.lerpVectors(from, to, p - Math.floor(p));
    });
  });

  return (
    <group>
      <EdgeSegments store={store} edges={baseEdges} width={1.5} />
      <EdgeSegments store={store} edges={pathEdges} width={3} opacity={0.8} />
      <NodeInstances store={store} attributes={attributes} glowScale={1.8} glowOpacity={0.5} />
      {flowPath.length > 0 &&
        Array.from({ length: PARTICLES }, (_, i) => (
          <group key={`particle-${i}`} ref={(g) => { particleRefs.current[i] = g; }}>
            <sprite scale={[10, 10, 1]} raycast={() => null}>
              <spriteMaterial map={solidDiscTexture()} color="#ffffff" transparent toneMapped={false} />
            </sprite>
          </group>
        ))}
    </group>
  );
}
