import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Graph, Node, ClusterColor } from "../../types/graph";
import { generateGraph, forceStep } from "../../lib/graph";

const MAX_EDGES = 5000;
const CLUSTER_COUNT = 6;

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
  const byClusterRef = useRef<Node[][]>(
    Array.from({ length: CLUSTER_COUNT }, () => [])
  );
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>(
    Array(CLUSTER_COUNT).fill(null)
  );
  const lineRef = useRef<THREE.LineSegments>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    const graph = generateGraph(600, 6);
    graphRef.current = graph;
    const byCluster: Node[][] = Array.from(
      { length: CLUSTER_COUNT },
      () => []
    );
    for (const node of graph.nodes) {
      byCluster[node.cluster].push(node);
    }
    byClusterRef.current = byCluster;
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

    const byCluster = byClusterRef.current;
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      const mesh = meshRefs.current[c];
      const nodes = byCluster[c];
      if (!mesh || nodes.length === 0) continue;
      nodes.forEach((node, i) => {
        matrix.compose(
          new THREE.Vector3(node.x, node.y, node.z),
          new THREE.Quaternion(),
          new THREE.Vector3(node.size, node.size, node.size)
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
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

  const materials = useMemo(
    () =>
      clusterColors.map(
        (cc) =>
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(cc.core),
            toneMapped: false,
            depthWrite: true,
          })
      ),
    [clusterColors]
  );

  const graph = graphRef.current;
  const byCluster = byClusterRef.current;

  if (!graph) return null;

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
      {byCluster.map((nodes, c) => {
        if (nodes.length === 0) return null;
        return (
          <instancedMesh
            key={c}
            ref={(r) => {
              meshRefs.current[c] = r;
            }}
            args={[sphereGeo, materials[c], nodes.length]}
            onPointerOver={(e) => {
              e.stopPropagation();
              const node = nodes[e.instanceId ?? 0];
              onHover(node ?? null);
            }}
            onPointerOut={() => onHover(null)}
          />
        );
      })}
    </group>
  );
}
