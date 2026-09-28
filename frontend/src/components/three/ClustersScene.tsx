import { useMemo } from "react";
import type { ClusterGalaxyNode, ClusterGalaxyGraph } from "../../types/clusters";
import type { LayoutStore } from "../../lib/layout/layoutStore";
import { usePicking } from "../../lib/picking";
import { writeColor } from "../../lib/colorBuffers";
import NodeInstances, { type NodeAttributes } from "./NodeInstances";
import EdgeSegments, { type EdgeList } from "./EdgeSegments";

interface ClustersSceneProps {
  graph: ClusterGalaxyGraph;
  store: LayoutStore;
  onHover: (node: ClusterGalaxyNode | null) => void;
  onClick: (node: ClusterGalaxyNode) => void;
  onDoubleClick: (node: ClusterGalaxyNode) => void;
  onMiss: () => void;
  selectedNode: ClusterGalaxyNode | null;
  filteredNodes: Set<string>;
  errorPods: ClusterGalaxyNode[];
}

const FAMILY_COLOR = "#00d4ff";

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
  store,
  onHover,
  onClick,
  onDoubleClick,
  onMiss,
  selectedNode,
  filteredNodes,
  errorPods,
}: ClustersSceneProps) {
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const family = useMemo(() => (selectedNode ? findFamily(selectedNode.id, graph) : null), [selectedNode, graph]);

  const attributes = useMemo<NodeAttributes>(() => {
    const n = graph.nodes.length;
    const failing = new Set(errorPods.map((p) => p.id));
    const attrs: NodeAttributes = {
      keys: graph.nodes.map((node) => node.id),
      colors: new Float32Array(n * 3),
      glowColors: new Float32Array(n * 3),
      radii: new Float32Array(n),
      opacities: new Float32Array(n),
      blink: new Float32Array(n),
    };
    graph.nodes.forEach((node, i) => {
      const inFamily = family?.nodes.has(node.id) ?? false;
      writeColor(attrs.colors, i, node.color);
      writeColor(attrs.glowColors, i, inFamily ? FAMILY_COLOR : node.glow);
      attrs.radii[i] = node.size;
      attrs.opacities[i] = filteredNodes.size > 0 && !filteredNodes.has(node.id) ? 0.2 : family && !inFamily ? 0.3 : 1;
      attrs.blink[i] = failing.has(node.id) ? 1 : 0;
    });
    return attrs;
  }, [graph.nodes, family, filteredNodes, errorPods]);

  const baseEdges = useMemo<EdgeList>(() => {
    const colors = new Float32Array(graph.edges.length * 3);
    graph.edges.forEach((e, i) => writeColor(colors, i, e.color, family ? 0.12 : 0.3));
    return { from: graph.edges.map((e) => e.from), to: graph.edges.map((e) => e.to), colors };
  }, [graph.edges, family]);

  const familyEdges = useMemo<EdgeList>(() => {
    const list = family ? graph.edges.filter((e) => family.edges.has(`${e.from}|${e.to}`)) : [];
    const colors = new Float32Array(list.length * 3);
    list.forEach((_, i) => writeColor(colors, i, FAMILY_COLOR));
    return { from: list.map((e) => e.from), to: list.map((e) => e.to), colors };
  }, [graph.edges, family]);

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

  return (
    <group>
      <EdgeSegments store={store} edges={baseEdges} width={1.2} />
      <EdgeSegments store={store} edges={familyEdges} width={2.5} opacity={0.8} />
      <NodeInstances store={store} attributes={attributes} glowScale={1.9} glowOpacity={0.55} />
    </group>
  );
}
