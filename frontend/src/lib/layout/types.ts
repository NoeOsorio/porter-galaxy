// Message shapes for the layout worker; see
// specs/002-render-engine-at-scale/contracts/layout-worker.md.

export type LayoutMode = "topology" | "clusters";

export interface LayoutNode {
  key: string;
  /** Namespace, or "_" for cluster-scoped objects; drives the namespace anchor. */
  group: string;
  cluster: string;
  /** Vertical band, 0 = top. */
  tier: number;
  radius: number;
  /** Where a new node is seeded when it first appears. */
  parent?: string;
}

export interface LayoutLink {
  source: string;
  target: string;
  strength: number;
  distance: number;
}

export type ToWorker =
  | { type: "update"; mode: LayoutMode; nodes: LayoutNode[]; links: LayoutLink[]; first: boolean }
  | { type: "stop" };

export interface FromWorker {
  type: "positions";
  keys: string[] | null;
  positions: Float32Array;
  alpha: number;
  settled: boolean;
}
