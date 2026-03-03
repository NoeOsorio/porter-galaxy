import { useRef, useMemo, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type {
  K8sMoleculeNode,
  K8sMoleculeClusterNode,
  K8sMoleculeDeploymentNode,
} from "../../types/k8sMolecule";

type DrillLevel = "cluster" | "node" | "deployment" | "pod";

interface K8sMoleculeClusterEntity {
  id: string;
  kind: "Cluster";
  name: string;
  x: number;
  y: number;
  color: string;
  glow: string;
  size: number;
  nodes: K8sMoleculeClusterNode[];
}

interface ClusterData {
  cluster: K8sMoleculeClusterEntity;
  nodes: K8sMoleculeClusterNode[];
  deployments: K8sMoleculeDeploymentNode[];
  pods: any[];
}

function getFocusCenter(
  clusterData: ClusterData,
  focusPath: string[]
): THREE.Vector3 {
  if (focusPath.length === 0) return new THREE.Vector3(0, 0, 0);
  
  if (focusPath.length === 1) {
    const node = clusterData.nodes.find((n) => n.id === focusPath[0]);
    if (node) return new THREE.Vector3(node.x, node.y, 0);
  }
  
  if (focusPath.length === 2) {
    const dep = clusterData.deployments.find((d) => d.id === focusPath[1]);
    if (dep) return new THREE.Vector3(dep.x, dep.y, 0);
  }
  
  return new THREE.Vector3(0, 0, 0);
}

function getCurrentEntities(
  clusterData: ClusterData,
  level: DrillLevel,
  focusPath: string[]
): K8sMoleculeNode[] {
  if (level === "cluster" || level === "node") {
    return clusterData.nodes;
  }
  
  if (level === "deployment" && focusPath.length >= 1) {
    const node = clusterData.nodes.find((n) => n.id === focusPath[0]);
    if (node) return node.deployments;
    return [];
  }
  
  if (level === "pod" && focusPath.length >= 2) {
    const dep = clusterData.deployments.find((d) => d.id === focusPath[1]);
    if (dep) return dep.pods;
    return [];
  }
  
  return [];
}

function hasChildren(e: K8sMoleculeNode): boolean {
  if (e.kind === "Node") {
    return (e as K8sMoleculeClusterNode).deployments.length > 0;
  }
  if (e.kind === "Deployment") {
    return (e as K8sMoleculeDeploymentNode).pods.length > 0;
  }
  return false;
}

function groupByColor(
  entities: K8sMoleculeNode[]
): [string, K8sMoleculeNode[]][] {
  const map = new Map<string, K8sMoleculeNode[]>();
  for (const e of entities) {
    const list = map.get(e.color) ?? [];
    list.push(e);
    map.set(e.color, list);
  }
  return Array.from(map.entries());
}

interface ClusterSceneProps {
  clusterData: ClusterData;
  level: DrillLevel;
  focusPath: string[];
  onDrillDown: (entity: K8sMoleculeNode) => void;
  onHover: (entity: K8sMoleculeNode | null) => void;
  onClick: (entity: K8sMoleculeNode) => void;
  onCameraDistanceChange: (distance: number) => void;
  controlsRef: React.RefObject<{ target: THREE.Vector3 } | null>;
}

export default function ClusterScene({
  clusterData,
  level,
  focusPath,
  onDrillDown,
  onHover,
  onClick,
  onCameraDistanceChange,
  controlsRef,
}: ClusterSceneProps) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const { camera } = useThree();

  const focusPathRef = useRef(focusPath);
  focusPathRef.current = focusPath;

  const entities = useMemo(
    () => getCurrentEntities(clusterData, level, focusPath),
    [clusterData, level, focusPath]
  );

  const colorGroups = useMemo(() => groupByColor(entities), [entities]);

  useEffect(() => {
    meshRefs.current = new Array(colorGroups.length).fill(null);
  }, [colorGroups.length]);

  const targetCenter = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const center = getFocusCenter(clusterData, focusPathRef.current);
    targetCenter.copy(center);

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetCenter, 0.06);
    }

    const currentDist = camera.position.distanceTo(targetCenter);
    onCameraDistanceChange(currentDist);

    for (let i = 0; i < colorGroups.length; i++) {
      const mesh = meshRefs.current[i];
      const list = colorGroups[i]![1];
      if (!mesh) continue;
      for (let j = 0; j < list.length; j++) {
        const e = list[j]!;
        const scale = e.size || 1;
        matrix.compose(
          new THREE.Vector3(e.x, e.y, 0),
          new THREE.Quaternion(),
          new THREE.Vector3(scale, scale, scale)
        );
        mesh.setMatrixAt(j, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const handlePointerOut = useCallback(() => onHover(null), [onHover]);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 24, 24), []);

  const materials = useMemo(
    () =>
      colorGroups.map(([color]) =>
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          toneMapped: false,
          depthWrite: true,
        })
      ),
    [colorGroups]
  );

  if (entities.length === 0) return null;

  return (
    <group>
      {colorGroups.map(([color, list], i) => (
        <instancedMesh
          key={`${level}-${color}-${i}`}
          ref={(r) => {
            meshRefs.current[i] = r;
          }}
          args={[sphereGeo, materials[i]!, list.length]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(list[e.instanceId ?? 0] ?? null);
          }}
          onPointerOut={handlePointerOut}
          onClick={(e) => {
            e.stopPropagation();
            const entity = list[e.instanceId ?? 0];
            if (entity) onClick(entity);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const entity = list[e.instanceId ?? 0];
            if (entity && hasChildren(entity)) onDrillDown(entity);
          }}
        />
      ))}
    </group>
  );
}
