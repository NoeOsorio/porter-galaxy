import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ComponentRef, type Ref } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { readPosition, type LayoutStore } from "../lib/layout/layoutStore";

export interface RigNode {
  id: string;
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
  store: LayoutStore;
  nodes: RigNode[];
  edges: RigEdge[];
  /** Default viewing angles used on first frame and on reset. */
  azimuth: number;
  polar: number;
}

// The bounding sphere of a flat layout already leaves side room; only add
// enough for the glow of the outermost nodes.
const GLOW_PADDING = 1.5;

export default function CameraRig({ ref, store, nodes, edges, azimuth, polar }: Props) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const framing = useRef<{ first: boolean; settled: boolean; limitsVersion: number }>({ first: false, settled: false, limitsVersion: -1 });

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
      const p = new THREE.Vector3();
      let maxSize = 0;
      for (const id of ids) {
        const n = byId.get(id);
        if (!n || !readPosition(store, id, p)) continue;
        box.expandByPoint(p);
        maxSize = Math.max(maxSize, n.size);
      }
      if (box.isEmpty()) return null;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      sphere.radius = Math.max(sphere.radius + maxSize * GLOW_PADDING, 60);
      return sphere;
    },
    [byId, store],
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

  // Positions arrive from the layout worker after mount: frame instantly on the
  // first positions, then once more (animated) when the layout first settles.
  // Later updates never move the camera. A view switch remounts the rig.
  useFrame(() => {
    const f = framing.current;
    if (store.keys.length === 0 || store.version === f.limitsVersion) return;
    if (!f.first) {
      f.first = true;
      frame(undefined, false);
    }
    if (!store.settled) return;
    f.limitsVersion = store.version;
    if (!f.settled) {
      f.settled = true;
      frame();
    }
    // Zoom limits follow the settled graph so the wheel always has room both ways.
    const cc = controls.current;
    const sphere = sphereFor(byId.keys());
    if (cc && sphere) {
      cc.minDistance = 20;
      cc.maxDistance = sphere.radius * 6;
    }
  });

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
