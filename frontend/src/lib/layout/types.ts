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
  /** Tree parent; a new node grows out of its position. */
  parent?: string;
  /** Pods pack around their parent; refs hang off a pod and take no layout space. */
  role?: "pod" | "ref";
}

export interface LayoutLink {
  source: string;
  target: string;
}

export type ToWorker =
  | { type: "update"; mode: LayoutMode; nodes: LayoutNode[]; links: LayoutLink[]; first: boolean }
  | { type: "stop" };

export interface FromWorker {
  type: "positions";
  keys: string[] | null;
  positions: Float32Array;
  settled: boolean;
}
