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

interface ColorGroup {
  kind: K8sNodeKind;
  color: string;
  nodes: K8sNode[];
  material: THREE.MeshBasicMaterial;
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
  const groupsRef = useRef<ColorGroup[]>([]);
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const lineSolidRef = useRef<THREE.LineSegments>(null);
  const lineDashedRef = useRef<THREE.LineSegments>(null);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
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

    const groups: ColorGroup[] = [];
    for (const kind of KINDS) {
      const nodes = byKind[kind];
      const byColor = new Map<string, K8sNode[]>();
      for (const n of nodes) {
        const c =
          kind === "Pod" && n.kind === "Pod" ? podColor(n as K8sPodNode) : n.color;
        if (!byColor.has(c)) byColor.set(c, []);
        byColor.get(c)!.push(n);
      }
      for (const [color, nodeList] of byColor) {
        const isNamespace = kind === "Namespace";
        groups.push({
          kind,
          color,
          nodes: nodeList,
          material: new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            toneMapped: false,
            transparent: isNamespace,
            opacity: isNamespace ? 0.6 : 1,
          }),
        });
      }
    }
    groupsRef.current = groups;
    meshRefs.current = new Array(groups.length).fill(null);

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

    const groups = groupsRef.current;
    for (let i = 0; i < groups.length; i++) {
      const mesh = meshRefs.current[i];
      const { kind, nodes } = groups[i]!;
      if (!mesh || nodes.length === 0) continue;
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j]!;
        const visible = visibleFilterFn === null || visibleFilterFn(node);
        const scale = visible ? node.size : 0.001;
        matrix.compose(
          new THREE.Vector3(node.x, node.y, node.z),
          kind === "Service"
            ? quat.setFromEuler(new THREE.Euler(0, 0, Math.PI / 4))
            : quat.identity(),
          new THREE.Vector3(scale, scale, scale)
        );
        mesh.setMatrixAt(j, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
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

  const handlePointerOut = useCallback(() => onHover(null), [onHover]);

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

  const graph = graphRef.current;
  const groups = groupsRef.current;

  if (!graph) return null;

  const geometryFor = (kind: K8sNodeKind) =>
    kind === "Service" ? boxGeo : kind === "Ingress" ? torusGeo : sphereGeo;

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

      {groups.map((group, i) => {
        if (group.nodes.length === 0) return null;
        const nodes = group.nodes;
        return (
          <instancedMesh
            key={`${group.kind}-${group.color}-${i}`}
            ref={(r) => {
              meshRefs.current[i] = r;
            }}
            args={[geometryFor(group.kind), group.material, nodes.length]}
            onPointerOver={(e) => {
              e.stopPropagation();
              const node = nodes[e.instanceId ?? 0];
              onHover(node ?? null);
            }}
            onPointerOut={handlePointerOut}
            onClick={(e) => {
              e.stopPropagation();
              const node = nodes[e.instanceId ?? 0];
              onSelect(node ?? null);
            }}
          />
        );
      })}
    </group>
  );
});

export default K8sScene;
