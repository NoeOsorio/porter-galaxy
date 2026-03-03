import { useRef, useMemo, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type {
  ClusterEntity,
  ClusterHierarchyEntity,
  DrillLevel,
} from "../../types/cluster";

const LEVEL_CAMERA_DIST: Record<DrillLevel, number> = {
  cluster: 250,
  node: 160,
  deployment: 50,
  pod: 18,
};

function findEntity(
  cluster: ClusterEntity,
  id: string
): ClusterHierarchyEntity | null {
  if (cluster.id === id) return cluster;
  for (const node of cluster.children) {
    if (node.id === id) return node;
    for (const dep of node.children) {
      if (dep.id === id) return dep;
      for (const pod of dep.children) {
        if (pod.id === id) return pod;
      }
    }
  }
  return null;
}

function getFocusCenter(
  cluster: ClusterEntity,
  focusPath: string[]
): THREE.Vector3 {
  if (focusPath.length === 0) return new THREE.Vector3(0, 0, 0);
  const last = focusPath[focusPath.length - 1]!;
  const entity = findEntity(cluster, last);
  if (!entity) return new THREE.Vector3(0, 0, 0);
  return new THREE.Vector3(entity.x, entity.y, entity.z);
}

function getCurrentEntities(
  cluster: ClusterEntity,
  level: DrillLevel,
  focusPath: string[]
): ClusterHierarchyEntity[] {
  if (level === "cluster") return [cluster];
  if (level === "node") return cluster.children;
  if (level === "deployment" && focusPath.length >= 2) {
    const node = findEntity(cluster, focusPath[1]!);
    if (!node || !("children" in node)) return [];
    return (node as { children: ClusterHierarchyEntity[] }).children;
  }
  if (level === "pod" && focusPath.length >= 3) {
    const node = findEntity(cluster, focusPath[1]!);
    if (!node || !("children" in node)) return [];
    const deps = (node as { children: { id: string; children?: ClusterHierarchyEntity[] }[] }).children;
    const dep = deps.find((d) => d.id === focusPath[2]);
    return dep && dep.children ? dep.children : [];
  }
  return [];
}

function getParentSphere(
  cluster: ClusterEntity,
  level: DrillLevel,
  focusPath: string[]
): { x: number; y: number; z: number; radius: number } | null {
  if (level === "cluster") return null;
  if (level === "node") return { x: 0, y: 0, z: 0, radius: cluster.radius };
  if (level === "deployment" && focusPath.length >= 2) {
    const node = findEntity(cluster, focusPath[1]!);
    return node ? { x: node.x, y: node.y, z: node.z, radius: node.radius } : null;
  }
  if (level === "pod" && focusPath.length >= 3) {
    const node = findEntity(cluster, focusPath[1]!);
    if (!node || !("children" in node)) return null;
    const deps = (node as { children: { id: string; x: number; y: number; z: number; radius: number }[] }).children;
    const dep = deps.find((d) => d.id === focusPath[2]);
    return dep ? { x: dep.x, y: dep.y, z: dep.z, radius: dep.radius } : null;
  }
  return null;
}

function hasChildren(e: ClusterHierarchyEntity): boolean {
  return "children" in e && (e as { children: unknown[] }).children.length > 0;
}

function groupByColor(
  entities: ClusterHierarchyEntity[]
): [string, ClusterHierarchyEntity[]][] {
  const map = new Map<string, ClusterHierarchyEntity[]>();
  for (const e of entities) {
    const list = map.get(e.color) ?? [];
    list.push(e);
    map.set(e.color, list);
  }
  return Array.from(map.entries());
}

interface ClusterSceneProps {
  hierarchy: ClusterEntity;
  level: DrillLevel;
  focusPath: string[];
  onDrillDown: (entity: ClusterHierarchyEntity) => void;
  onHover: (entity: ClusterHierarchyEntity | null) => void;
  onClick: (entity: ClusterHierarchyEntity) => void;
  controlsRef: React.RefObject<{ target: THREE.Vector3 } | null>;
}

export default function ClusterScene({
  hierarchy,
  level,
  focusPath,
  onDrillDown,
  onHover,
  onClick,
  controlsRef,
}: ClusterSceneProps) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const { camera } = useThree();

  const levelRef = useRef(level);
  levelRef.current = level;
  const focusPathRef = useRef(focusPath);
  focusPathRef.current = focusPath;

  const entities = useMemo(
    () => getCurrentEntities(hierarchy, level, focusPath),
    [hierarchy, level, focusPath]
  );

  const parentSphere = useMemo(
    () => getParentSphere(hierarchy, level, focusPath),
    [hierarchy, level, focusPath]
  );

  const colorGroups = useMemo(() => groupByColor(entities), [entities]);

  useEffect(() => {
    meshRefs.current = new Array(colorGroups.length).fill(null);
  }, [colorGroups.length]);

  const targetCenter = useMemo(() => new THREE.Vector3(), []);
  const desiredCamPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const center = getFocusCenter(hierarchy, focusPathRef.current);
    targetCenter.copy(center);

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetCenter, 0.06);
    }

    const dist = LEVEL_CAMERA_DIST[levelRef.current];
    const dir = camera.position.clone().sub(targetCenter);
    const currentDist = dir.length();
    if (currentDist > 0.001) {
      dir.normalize();
    } else {
      dir.set(0, 0, 1);
    }
    desiredCamPos.copy(targetCenter).add(dir.multiplyScalar(dist));
    camera.position.lerp(desiredCamPos, 0.04);

    for (let i = 0; i < colorGroups.length; i++) {
      const mesh = meshRefs.current[i];
      const list = colorGroups[i]![1];
      if (!mesh) continue;
      for (let j = 0; j < list.length; j++) {
        const e = list[j]!;
        matrix.compose(
          new THREE.Vector3(e.x, e.y, e.z),
          new THREE.Quaternion(),
          new THREE.Vector3(e.radius, e.radius, e.radius)
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
      {parentSphere && (
        <mesh
          position={[parentSphere.x, parentSphere.y, parentSphere.z]}
          scale={parentSphere.radius}
        >
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial
            wireframe
            color="#ffffff"
            transparent
            opacity={0.06}
            depthWrite={false}
          />
        </mesh>
      )}
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
