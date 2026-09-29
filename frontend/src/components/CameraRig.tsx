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
  /** Default viewing angles used on first frame and on reset in 3D. */
  azimuth: number;
  polar: number;
  mode: "3d" | "2d";
  /** Plane the 2D mode looks at: the view's front (x/y) or top (x/z). */
  plane2d: "front" | "top";
}

// A polar angle of exactly 0 makes camera-controls' up vector degenerate.
const TOP_POLAR = 0.0001;

// Room for the glow of the outermost nodes.
const GLOW_PADDING = 1.5;

export default function CameraRig({ ref, store, nodes, edges, azimuth, polar, mode, plane2d }: Props) {
  const [viewAzimuth, viewPolar] = mode === "2d" ? [0, plane2d === "top" ? TOP_POLAR : Math.PI / 2] : [azimuth, polar];
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
      // Layouts are much flatter in one axis than the others, so the largest
      // half-extent fits them far better than the box's half-diagonal.
      const extent = box.getSize(new THREE.Vector3());
      const radius = Math.max(extent.x, extent.y, extent.z) / 2;
      return new THREE.Sphere(box.getCenter(new THREE.Vector3()), Math.max(radius + maxSize * GLOW_PADDING, 60));
    },
    [byId, store],
  );

  const frame = useCallback(
    (ids?: Iterable<string>, animate = true) => {
      const cc = controls.current;
      const sphere = sphereFor(ids ?? byId.keys());
      if (!cc || !sphere) return;
      if (!ids) void cc.rotateTo(viewAzimuth, viewPolar, animate);
      void cc.fitToSphere(sphere, animate);
    },
    [sphereFor, byId, viewAzimuth, viewPolar],
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

  const latestFrame = useRef(frame);
  useEffect(() => {
    latestFrame.current = frame;
  }, [frame]);

  // 2D locks both angles to the plane and turns left-drag into panning. Only a
  // mode change reframes; snapshots must not move the camera.
  useEffect(() => {
    const cc = controls.current;
    if (!cc) return;
    const { ACTION } = cc.constructor as unknown as { ACTION: Record<"ROTATE" | "TRUCK" | "TOUCH_ROTATE" | "TOUCH_TRUCK", number> };
    const flat = mode === "2d";
    cc.mouseButtons.left = (flat ? ACTION.TRUCK : ACTION.ROTATE) as typeof cc.mouseButtons.left;
    cc.touches.one = (flat ? ACTION.TOUCH_TRUCK : ACTION.TOUCH_ROTATE) as typeof cc.touches.one;
    cc.minAzimuthAngle = flat ? viewAzimuth : -Infinity;
    cc.maxAzimuthAngle = flat ? viewAzimuth : Infinity;
    cc.minPolarAngle = flat ? viewPolar : 0;
    cc.maxPolarAngle = flat ? viewPolar : Math.PI;
    if (store.keys.length > 0) latestFrame.current();
  }, [mode, viewAzimuth, viewPolar, store]);

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
