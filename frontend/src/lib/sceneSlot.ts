import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";

// Views live in the DOM tree but draw into the single <Canvas> owned by App.
// Only <SceneSlot> (inside the Canvas) subscribes to the scene, so publishing
// re-renders the 3D tree without re-rendering App or the view that published it.

export interface Slot {
  scene: ReactNode;
  onPointerMissed?: () => void;
  /** True once a frame has been drawn with a scene in the slot. */
  rendered: boolean;
}

let current: Slot = { scene: null, rendered: false };
const listeners = new Set<() => void>();

function publish(next: Slot) {
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeSlot(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSlot() {
  return current;
}

export function markSceneRendered() {
  if (!current.rendered && current.scene) publish({ ...current, rendered: true });
}

/** Render `scene` in the shared Canvas while the calling view is mounted. */
export function useScene(scene: ReactNode, onPointerMissed?: () => void) {
  useLayoutEffect(() => {
    publish({ scene, onPointerMissed, rendered: current.rendered });
  });
  useLayoutEffect(() => () => publish({ scene: null, rendered: current.rendered }), []);
}

/** For DOM components: whether the Canvas has drawn its first scene. */
export function useSceneRendered() {
  return useSyncExternalStore(subscribeSlot, () => current.rendered);
}

export function handlePointerMissed() {
  current.onPointerMissed?.();
}
