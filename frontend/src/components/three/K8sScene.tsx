import {
  useRef,
  useEffect,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type {
  K8sGraph,
  K8sNode,
  K8sEdge,
  K8sNodeKind,
  K8sPodNode,
} from "../../types/k8s";
import { generateK8sCluster, forceStepK8s } from "../../lib/k8sGraph";

const KINDS: K8sNodeKind[] = [
  "Namespace",
  "Deployment",
  "Pod",
  "Service",
  "Ingress",
];

const MAX_EDGES = 500;

function podColor(node: K8sPodNode): string {
  if (node.status === "CrashLoopBackOff") return "#ff3333";
  if (node.status === "Pending") return "#ffd666";
  return node.color;
}

export interface K8sSceneRef {
  getGraph: () => K8sGraph | null;
}

interface K8sSceneProps {
  filter: string;
  onHover: (node: K8sNode | null) => void;
  onSelect: (node: K8sNode | null) => void;
  onReady: (graph: K8sGraph) => void;
  controlsRef: React.RefObject<{ target: THREE.Vector3 } | null>;
}

const K8sScene = forwardRef<K8sSceneRef, K8sSceneProps>(function K8sScene(
  { filter, onHover, onSelect, onReady, controlsRef },
  ref
) {
  const graphRef = useRef<K8sGraph | null>(null);
  const byKindRef = useRef<Record<K8sNodeKind, K8sNode[]>>({
    Namespace: [],
    Deployment: [],
    Pod: [],
    Service: [],
    Ingress: [],
  });

  const meshRefs = useRef<Record<K8sNodeKind, THREE.InstancedMesh | null>>({
    Namespace: null,
    Deployment: null,
    Pod: null,
    Service: null,
    Ingress: null,
  });
  const lineSolidRef = useRef<THREE.LineSegments>(null);
  const lineDashedRef = useRef<THREE.LineSegments>(null);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useImperativeHandle(
    ref,
    () => ({
      getGraph: () => graphRef.current,
    }),
    []
  );

  useEffect(() => {
    const graph = generateK8sCluster();
    graphRef.current = graph;
    const byKind: Record<K8sNodeKind, K8sNode[]> = {
      Namespace: [],
      Deployment: [],
      Pod: [],
      Service: [],
      Ingress: [],
    };
    for (const n of graph.nodes) {
      byKind[n.kind].push(n);
    }
    byKindRef.current = byKind;
    onReady(graph);
    for (let i = 0; i < 150; i++) {
      forceStepK8s(graph.nodes, graph.edges, 0.04 * (1 - i / 150));
    }
  }, [onReady]);

  useFrame(() => {
    const graph = graphRef.current;
    const currentFilter = filterRef.current;
    if (!graph) return;

    const zoomLevel = currentFilter === "all" ? 1 : 2;
    forceStepK8s(graph.nodes, graph.edges, 0.008, {
      focusNamespace: currentFilter !== "all" ? currentFilter : undefined,
      zoomLevel,
    });

    if (controlsRef.current && currentFilter !== "all") {
      const focus = graph.nodes.find(
        (n) => n.kind === "Namespace" && n.name === currentFilter
      );
      if (focus) {
        controlsRef.current.target.lerp(
          new THREE.Vector3(focus.x, focus.y, focus.z),
          0.05
        );
      }
    }

    const visibleFilterFn =
      currentFilter === "all"
        ? null
        : (n: K8sNode) =>
            n.kind === "Namespace" ||
            ("namespace" in n && n.namespace === currentFilter);

    const byKind = byKindRef.current;

    for (const kind of KINDS) {
      const mesh = meshRefs.current[kind];
      const nodes = byKind[kind];
      if (!mesh || nodes.length === 0) continue;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const visible = visibleFilterFn === null || visibleFilterFn(node);
        const scale = visible ? node.size : 0.001;
        matrix.compose(
          new THREE.Vector3(node.x, node.y, node.z),
          kind === "Service"
            ? quat.setFromEuler(new THREE.Euler(0, 0, Math.PI / 4))
            : quat.identity(),
          new THREE.Vector3(scale, scale, scale)
        );
        mesh.setMatrixAt(i, matrix);
        const c =
          kind === "Pod" && node.kind === "Pod"
            ? podColor(node)
            : node.color;
        color.set(c);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const ownershipEdges = graph.edges.filter((e) => e.type === "ownership");
    const otherEdges = graph.edges.filter((e) => e.type !== "ownership");

    const fillLine = (
      line: THREE.LineSegments | null,
      edges: K8sEdge[],
      maxSegs: number
    ) => {
      if (!line) return;
      const posAttr = line.geometry.attributes
        .position as THREE.BufferAttribute;
      let idx = 0;
      for (const edge of edges) {
        if (idx >= maxSegs * 2) break;
        const s = byId.get(edge.source);
        const t = byId.get(edge.target);
        if (!s || !t) continue;
        posAttr.setXYZ(idx, s.x, s.y, s.z);
        idx += 1;
        posAttr.setXYZ(idx, t.x, t.y, t.z);
        idx += 1;
      }
      posAttr.needsUpdate = true;
      line.geometry.setDrawRange(0, idx);
    };

    fillLine(lineSolidRef.current, ownershipEdges, MAX_EDGES);
    fillLine(lineDashedRef.current, otherEdges, MAX_EDGES);
    if (lineDashedRef.current)
      lineDashedRef.current.computeLineDistances();
  });

  const handlePointerOver = useCallback(
    (kind: K8sNodeKind) => (e: { stopPropagation: () => void; instanceId?: number }) => {
      e.stopPropagation();
      const nodes = byKindRef.current[kind];
      if (nodes && e.instanceId !== undefined)
        onHover(nodes[e.instanceId] ?? null);
    },
    [onHover]
  );

  const handlePointerOut = useCallback(() => onHover(null), [onHover]);

  const handleClick = useCallback(
    (kind: K8sNodeKind) => (e: { stopPropagation: () => void; instanceId?: number }) => {
      e.stopPropagation();
      const nodes = byKindRef.current[kind];
      if (nodes && e.instanceId !== undefined) {
        const node = nodes[e.instanceId];
        onSelect(node ?? null);
      }
    },
    [onSelect]
  );

  const solidLineGeometry = useMemo(() => {
    const positions = new Float32Array(MAX_EDGES * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const dashedLineGeometry = useMemo(() => {
    const positions = new Float32Array(MAX_EDGES * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const torusGeo = useMemo(() => new THREE.TorusGeometry(1, 0.3, 8, 16), []);
  const opaqueMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
      }),
    []
  );
  const transparentMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        transparent: true,
        opacity: 0.6,
      }),
    []
  );

  const graph = graphRef.current;
  const byKind = byKindRef.current;
  if (!graph) return null;

  return (
    <group>
      <lineSegments ref={lineSolidRef} geometry={solidLineGeometry}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments ref={lineDashedRef} geometry={dashedLineGeometry}>
        <lineDashedMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          dashSize={1.5}
          gapSize={1}
          depthWrite={false}
        />
      </lineSegments>

      {KINDS.map((kind) => {
        const nodes = byKind[kind];
        const count = nodes.length;
        if (count === 0) return null;

        const geometry =
          kind === "Service"
            ? boxGeo
            : kind === "Ingress"
              ? torusGeo
              : sphereGeo;
        const material =
          kind === "Namespace" ? transparentMat : opaqueMat;

        return (
          <instancedMesh
            key={kind}
            ref={(r) => {
              meshRefs.current[kind] = r;
            }}
            args={[geometry, material, count]}
            onPointerOver={handlePointerOver(kind)}
            onPointerOut={handlePointerOut}
            onClick={handleClick(kind)}
          />
        );
      })}
    </group>
  );
});

export default K8sScene;
