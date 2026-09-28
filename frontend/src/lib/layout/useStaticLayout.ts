import { useMemo } from "react";
import { createLayoutStore, writeLayout, type LayoutStore } from "./layoutStore";

interface Positioned {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** Layout store filled from positions the transforms already computed. */
export function useStaticLayout(nodes: readonly Positioned[] | undefined): LayoutStore {
  return useMemo(() => {
    const store = createLayoutStore();
    const list = nodes ?? [];
    const positions = new Float32Array(list.length * 3);
    list.forEach((n, i) => positions.set([n.x, n.y, n.z], i * 3));
    writeLayout(store, list.map((n) => n.id), positions, true);
    return store;
  }, [nodes]);
}
