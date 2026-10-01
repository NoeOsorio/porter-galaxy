import type { LabelCandidate } from "../components/Labels";

/** Radius of the node that stands in for a collapsed namespace. */
export const DOT_RADIUS = 6;
export const DOT_COLOR = "#94a3b8";

export interface FocusView {
  /** Group key of the focused namespace (see `groupOf` in each view). */
  group: string;
  /** Nodes of other namespaces that are not drawn or pickable. */
  hidden: Set<string>;
  /** The one node kept per collapsed namespace, drawn as a dot: node id → group key. */
  dots: Map<string, string>;
  /** Node ids of the focused namespace, for framing. */
  members: string[];
}

/**
 * Hides every namespace except `group`, keeping the largest node of each other
 * namespace as its dot. Nodes whose `groupOf` is null (Internet, load
 * balancers, machines) always stay. The layout is untouched, so positions do
 * not move when focus changes. Returns null when `group` has no nodes, e.g.
 * after its namespace was deleted.
 */
export function focusView<N extends { id: string; size: number }>(
  nodes: N[],
  groupOf: (node: N) => string | null,
  group: string | null,
): FocusView | null {
  if (!group) return null;
  const hidden = new Set<string>();
  const largest = new Map<string, N>();
  const members: string[] = [];
  for (const n of nodes) {
    const g = groupOf(n);
    if (g === null) continue;
    if (g === group) {
      members.push(n.id);
      continue;
    }
    hidden.add(n.id);
    const best = largest.get(g);
    if (!best || n.size > best.size) largest.set(g, n);
  }
  if (members.length === 0) return null;
  const dots = new Map<string, string>();
  for (const [g, n] of largest) {
    hidden.delete(n.id);
    dots.set(n.id, g);
  }
  return { group, hidden, dots, members };
}

/** Drops labels of hidden nodes and anchors each collapsed namespace's label to its dot. */
export function focusLabels(candidates: LabelCandidate[], view: FocusView | null): LabelCandidate[] {
  if (!view) return candidates;
  const dotOf = new Map([...view.dots].map(([id, g]) => [g, id]));
  const out: LabelCandidate[] = [];
  for (const c of candidates) {
    if (c.style === "group" && c.group !== undefined && c.group !== view.group) {
      const dot = dotOf.get(c.group);
      if (dot) out.push({ ...c, keys: [dot], radius: DOT_RADIUS });
      continue;
    }
    if (c.keys.length === 1 && (view.hidden.has(c.keys[0]!) || view.dots.has(c.keys[0]!))) continue;
    out.push(c);
  }
  return out;
}
