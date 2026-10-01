import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { LayoutStore } from "./layout/layoutStore";

// Instanced billboards have no per-node raycast, so picking projects every
// position to the screen and hit-tests the projected radius instead.

const MIN_HIT_PX = 6;
const DRAG_PX = 5;

const scratch = new THREE.Vector3();

/** Key of the front-most node whose projected disc contains (x, y), in canvas pixels. */
export function pickNode(
  store: LayoutStore,
  keys: readonly string[],
  radii: Float32Array,
  camera: THREE.Camera,
  width: number,
  height: number,
  x: number,
  y: number,
): string | null {
  const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
  const pixelsPerUnitAtOne = height / 2 / Math.tan(fov / 2);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < keys.length; i++) {
    // Radius 0 marks a node hidden by a namespace focus.
    if (radii[i]! <= 0) continue;
    const j = store.index.get(keys[i]!);
    if (j === undefined) continue;
    scratch.set(store.positions[j * 3]!, store.positions[j * 3 + 1]!, store.positions[j * 3 + 2]!);
    const distance = scratch.distanceTo(camera.position);
    scratch.project(camera);
    if (scratch.z < -1 || scratch.z > 1) continue;
    const sx = ((scratch.x + 1) / 2) * width;
    const sy = ((1 - scratch.y) / 2) * height;
    const radiusPx = Math.max((radii[i]! * pixelsPerUnitAtOne) / distance, MIN_HIT_PX);
    if (Math.hypot(sx - x, sy - y) <= radiusPx && distance < bestDistance) {
      best = keys[i]!;
      bestDistance = distance;
    }
  }
  return best;
}

export interface PickingHandlers {
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
  onDoubleClick: (key: string) => void;
  /** A click (not a drag) on empty space. */
  onMiss: () => void;
}

/** Wires canvas pointer events to `pickNode`. Must render inside the Canvas. */
export function usePicking(store: LayoutStore, keys: readonly string[], radii: Float32Array, handlers: PickingHandlers) {
  const { gl, camera, size } = useThree();
  const latest = useRef({ store, keys, radii, handlers });
  const pointer = useRef<{ x: number; y: number; inside: boolean; dirty: boolean; down: [number, number] | null }>({ x: 0, y: 0, inside: false, dirty: false, down: null });
  const lastView = useRef(new THREE.Matrix4());
  const hovered = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { store, keys, radii, handlers };
    pointer.current.dirty = true;
  });

  useEffect(() => {
    const el = gl.domElement;
    const local = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top] as const;
    };
    const pick = (x: number, y: number) => {
      const { store, keys, radii } = latest.current;
      return pickNode(store, keys, radii, camera, el.clientWidth, el.clientHeight, x, y);
    };
    const onMove = (e: PointerEvent) => {
      [pointer.current.x, pointer.current.y] = local(e);
      pointer.current.inside = true;
      pointer.current.dirty = true;
    };
    const onLeave = () => {
      pointer.current.inside = false;
      pointer.current.dirty = false;
      if (hovered.current !== null) {
        hovered.current = null;
        latest.current.handlers.onHover(null);
        document.body.style.cursor = "default";
      }
    };
    const onDown = (e: PointerEvent) => {
      pointer.current.down = [e.clientX, e.clientY];
    };
    const onClick = (e: MouseEvent) => {
      const down = pointer.current.down;
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > DRAG_PX) return;
      const key = pick(...local(e));
      if (key) latest.current.handlers.onClick(key);
      else latest.current.handlers.onMiss();
    };
    const onDoubleClick = (e: MouseEvent) => {
      const key = pick(...local(e));
      if (key) latest.current.handlers.onDoubleClick(key);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
      el.removeEventListener("dblclick", onDoubleClick);
    };
  }, [gl, camera]);

  // Hover is resolved once per frame; a camera move under a still pointer also
  // changes what is under it, so it counts as a pointer move.
  useFrame(() => {
    if (pointer.current.inside && !lastView.current.equals(camera.matrixWorld)) {
      lastView.current.copy(camera.matrixWorld);
      pointer.current.dirty = true;
    }
    if (!pointer.current.dirty) return;
    pointer.current.dirty = false;
    const { store, keys, radii, handlers } = latest.current;
    const key = pickNode(store, keys, radii, camera, size.width, size.height, pointer.current.x, pointer.current.y);
    if (key === hovered.current) return;
    hovered.current = key;
    handlers.onHover(key);
    document.body.style.cursor = key ? "pointer" : "default";
  });
}
