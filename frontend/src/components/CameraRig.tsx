import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ComponentRef, type Ref } from "react";
import * as THREE from "three";
import { CameraControls } from "@react-three/drei";

export interface RigNode {
  id: string;
  x: number;
  y: number;
  z: number;
  size: number;
}

export interface RigEdge {
  from: string;
  to: string;
}

export interface CameraRigHandle {
  /** Fit the given nodes (all nodes when omitted) in view, animated. */
  frame(ids?: Iterable<string>): void;
  /** Center a node together with its direct neighbors, animated. */
  flyTo(id: string): void;
}

interface Props {
  ref: Ref<CameraRigHandle>;
  nodes: RigNode[];
  edges: RigEdge[];
  /** Default viewing angles used on first frame and on reset. */
  azimuth: number;
  polar: number;
}

// The bounding sphere of a flat layout already leaves side room; only add
// enough for the glow of the outermost nodes.
const GLOW_PADDING = 1.5;

export default function CameraRig({ ref, nodes, edges, azimuth, polar }: Props) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const framed = useRef(false);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      map.set(e.from, [...(map.get(e.from) ?? []), e.to]);
      map.set(e.to, [...(map.get(e.to) ?? []), e.from]);
    }
    return map;
  }, [edges]);

  const sphereFor = useCallback(
    (ids: Iterable<string>) => {
      const box = new THREE.Box3();
      let maxSize = 0;
      for (const id of ids) {
        const n = byId.get(id);
        if (!n) continue;
        box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
        maxSize = Math.max(maxSize, n.size);
      }
      if (box.isEmpty()) return null;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      sphere.radius = Math.max(sphere.radius + maxSize * GLOW_PADDING, 60);
      return sphere;
    },
    [byId],
  );

  const frame = useCallback(
    (ids?: Iterable<string>, animate = true) => {
      const cc = controls.current;
      const sphere = sphereFor(ids ?? byId.keys());
      if (!cc || !sphere) return;
      if (!ids) void cc.rotateTo(azimuth, polar, animate);
      void cc.fitToSphere(sphere, animate);
    },
    [sphereFor, byId, azimuth, polar],
  );

  useImperativeHandle(
    ref,
    () => ({
      frame: (ids) => frame(ids),
      flyTo: (id) => frame([id, ...(neighbors.get(id) ?? [])]),
    }),
    [frame, neighbors],
  );

  // Frame once when the first graph arrives (and again after a view switch,
  // which remounts the rig); later snapshots must not move the camera.
  useEffect(() => {
    if (framed.current || byId.size === 0) return;
    framed.current = true;
    frame(undefined, false);
  }, [byId, frame]);

  // Zoom limits follow the graph so the wheel always has room in both directions.
  useEffect(() => {
    const cc = controls.current;
    const sphere = sphereFor(byId.keys());
    if (!cc || !sphere) return;
    cc.minDistance = 20;
    cc.maxDistance = sphere.radius * 6;
  }, [byId, sphereFor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") frame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame]);

  return <CameraControls ref={controls} makeDefault dollyToCursor smoothTime={0.35} />;
}
