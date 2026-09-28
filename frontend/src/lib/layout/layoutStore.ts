// Node positions live outside React state: scenes, picking and the camera rig
// read them every frame, so a new layout never re-renders the scene tree.

export interface LayoutStore {
  keys: string[];
  index: Map<string, number>;
  /** x, y, z per key, in `keys` order. */
  positions: Float32Array;
  /** Bumped on every write; readers compare it to skip unchanged frames. */
  version: number;
  settled: boolean;
}

export function createLayoutStore(): LayoutStore {
  return { keys: [], index: new Map(), positions: new Float32Array(0), version: 0, settled: false };
}

export function writeLayout(store: LayoutStore, keys: string[] | null, positions: Float32Array, settled: boolean) {
  if (keys) {
    store.keys = keys;
    store.index = new Map(keys.map((k, i) => [k, i]));
  }
  store.positions = positions;
  store.settled = settled;
  store.version++;
}

/** Writes x, y, z of `key` into `out` and returns true, or returns false if the key is unknown. */
export function readPosition(store: LayoutStore, key: string, out: { x: number; y: number; z: number }): boolean {
  const i = store.index.get(key);
  if (i === undefined) return false;
  out.x = store.positions[i * 3]!;
  out.y = store.positions[i * 3 + 1]!;
  out.z = store.positions[i * 3 + 2]!;
  return true;
}
