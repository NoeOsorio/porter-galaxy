import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Graph, Node, ClusterColor } from "../../types/graph";
import { generateGraph, forceStep } from "../../lib/graph";

const MAX_EDGES = 5000;

interface GalaxySceneProps {
  clusterColors: ClusterColor[];
  onHover: (node: Node | null) => void;
  onStats: (stats: { nodes: number; edges: number; clusters: number }) => void;
}

export default function GalaxyScene({
  clusterColors,
  onHover,
  onStats,
}: GalaxySceneProps) {
  const graphRef = useRef<Graph | null>(null);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const graph = generateGraph(600, 6);
    graphRef.current = graph;
    onStats({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      clusters: 6,
    });
    for (let i = 0; i < 100; i++) {
      forceStep(graph.nodes, graph.edges, 0.05 * (1 - i / 100));
    }
  }, [onStats]);

  useFrame(() => {
    const graph = graphRef.current;
    if (!graph) return;

    forceStep(graph.nodes, graph.edges, 0.001);

    const mesh = instancedRef.current;
    if (mesh) {
      graph.nodes.forEach((node, i) => {
        matrix.compose(
          new THREE.Vector3(node.x, node.y, node.z),
          new THREE.Quaternion(),
          new THREE.Vector3(node.size, node.size, node.size)
        );
        mesh.setMatrixAt(i, matrix);
        color.set(clusterColors[node.cluster].core);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    const line = lineRef.current;
    if (line && graph.edges.length > 0) {
      const posAttr = line.geometry.attributes
        .position as THREE.BufferAttribute;
      const nodes = graph.nodes;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      let idx = 0;
      for (const edge of graph.edges) {
        const s = byId.get(edge.source);
        const t = byId.get(edge.target);
        if (!s || !t) continue;
        posAttr.setXYZ(idx, s.x, s.y, s.z);
        idx += 1;
        posAttr.setXYZ(idx, t.x, t.y, t.z);
        idx += 1;
      }
      posAttr.needsUpdate = true;
      line.geometry.setDrawRange(0, Math.min(idx, MAX_EDGES * 2));
    }
  });

  const lineGeometry = useMemo(() => {
    const positions = new Float32Array(MAX_EDGES * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const nodeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        vertexColors: true,
        depthWrite: true,
      }),
    []
  );

  const graph = graphRef.current;
  const nodeCount = graph?.nodes.length ?? 0;

  if (nodeCount === 0) return null;

  return (
    <group>
      <lineSegments ref={lineRef} geometry={lineGeometry}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </lineSegments>
      <instancedMesh
        ref={instancedRef}
        args={[sphereGeo, nodeMaterial, nodeCount]}
        onPointerOver={(e) => {
          e.stopPropagation();
          const g = graphRef.current;
          if (g && e.instanceId !== undefined)
            onHover(g.nodes[e.instanceId] ?? null);
        }}
        onPointerOut={() => onHover(null)}
      />
    </group>
  );
}
