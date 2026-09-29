/// <reference lib="webworker" />
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  type SimulationNode,
} from "d3-force-3d";
import type { FromWorker, LayoutLink, LayoutMode, LayoutNode, ToWorker } from "./types";

interface SimNode extends SimulationNode, LayoutNode {
  ax: number;
  az: number;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  strength: number;
  distance: number;
}

const ALPHA_MIN = 0.005;
const GLOBAL_DECAY = 0.0228;
// A large change re-relaxes the whole graph from low energy.
const GLOBAL_UPDATE_ALPHA = 0.15;
// A small change only moves what changed: everything else is pinned, and the
// short local run has to finish well within a 500 ms snapshot interval.
const LOCAL_CHANGE_SHARE = 0.2;
const LOCAL_ALPHA = 0.3;
const LOCAL_DECAY = 0.06;
const TICKS_PER_POST = 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TIER_Y: Record<LayoutMode, number[]> = {
  topology: [260, 180, 100, 20, -60, -140, -210],
  clusters: [260, 140, 20, -100, -170],
};

const byKey = new Map<string, SimNode>();
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let mode: LayoutMode = "topology";
let keysDirty = true;
let running = false;
// True while a global relaxation (first layout or large change) is still running.
let globalRun = false;

const simulation = forceSimulation<SimNode>([], 3).alphaMin(ALPHA_MIN).velocityDecay(0.35).stop();

/**
 * Namespace anchors sit on a golden-angle spiral ordered by name, so the same
 * set of namespaces lands in the same places on every load. Clusters get their
 * own ring when there are several.
 */
function assignAnchors(list: SimNode[]) {
  const clusters = [...new Set(list.map((n) => n.cluster))].sort();
  const groupsByCluster = new Map<string, string[]>();
  const sizes = new Map<string, number>();
  for (const n of list) {
    if (n.group === "_") continue;
    const id = `${n.cluster}/${n.group}`;
    sizes.set(id, (sizes.get(id) ?? 0) + 1);
    const groups = groupsByCluster.get(n.cluster) ?? [];
    if (!groups.includes(n.group)) groups.push(n.group);
    groupsByCluster.set(n.cluster, groups);
  }
  const largest = Math.max(1, ...sizes.values());
  const spacing = Math.max(90, 18 * Math.sqrt(largest));
  const clusterRing = clusters.length > 1 ? spacing * 6 : 0;

  const anchor = new Map<string, [number, number]>();
  clusters.forEach((cluster, ci) => {
    const angle = (ci / clusters.length) * Math.PI * 2;
    const cx = Math.cos(angle) * clusterRing;
    const cz = Math.sin(angle) * clusterRing;
    anchor.set(`${cluster}/_`, [cx, cz]);
    (groupsByCluster.get(cluster) ?? []).sort().forEach((group, i) => {
      const r = spacing * Math.sqrt(i + 1);
      anchor.set(`${cluster}/${group}`, [cx + Math.cos(i * GOLDEN_ANGLE) * r, cz + Math.sin(i * GOLDEN_ANGLE) * r]);
    });
  });
  for (const n of list) {
    [n.ax, n.az] = anchor.get(`${n.cluster}/${n.group}`) ?? [0, 0];
  }
}

function jitter(scale: number) {
  return (Math.random() - 0.5) * scale;
}

function unpinAll() {
  for (const n of nodes) n.fx = n.fy = n.fz = null;
}

function update(msg: Extract<ToWorker, { type: "update" }>) {
  mode = msg.mode;
  unpinAll();
  const added = new Set<string>();
  const removed = new Set(byKey.keys());
  const next: SimNode[] = [];
  const seen = new Set<string>();
  for (const incoming of msg.nodes) {
    seen.add(incoming.key);
    const existing = byKey.get(incoming.key);
    if (existing) {
      Object.assign(existing, incoming);
      next.push(existing);
      continue;
    }
    const node = { ...incoming, ax: 0, az: 0 } as SimNode;
    byKey.set(node.key, node);
    added.add(node.key);
    next.push(node);
  }
  for (const key of seen) removed.delete(key);
  for (const key of removed) byKey.delete(key);

  assignAnchors(next);
  const tiers = TIER_Y[mode];
  for (const n of next) {
    if (n.x !== undefined) continue;
    const parent = n.parent ? byKey.get(n.parent) : undefined;
    const seed = parent?.x !== undefined ? parent : null;
    n.x = (seed ? seed.x! : n.ax) + jitter(20);
    n.y = (tiers[n.tier] ?? 0) + jitter(10);
    n.z = (seed ? seed.z! : n.az) + jitter(20);
  }

  keysDirty = keysDirty || next.length !== nodes.length || next.some((n, i) => nodes[i] !== n);
  nodes = next;
  links = msg.links.filter((l) => byKey.has(l.source) && byKey.has(l.target)).map((l: LayoutLink) => ({ ...l }));

  simulation
    .nodes(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.key)
        .distance((l) => l.distance)
        .strength((l) => l.strength),
    )
    .force("charge", forceManyBody<SimNode>().strength(-40).theta(0.9).distanceMax(600))
    .force("collide", forceCollide<SimNode>((n) => n.radius * 1.4).strength(0.7))
    .force("anchorX", forceX<SimNode>((n) => n.ax).strength((n) => (n.group === "_" ? 0.02 : 0.08)))
    .force("anchorZ", forceZ<SimNode>((n) => n.az).strength((n) => (n.group === "_" ? 0.02 : 0.08)))
    .force("tier", forceY<SimNode>((n) => tiers[n.tier] ?? 0).strength(0.6));

  const changed = new Set([...added, ...removed]);
  const local = !msg.first && !globalRun && changed.size <= nodes.length * LOCAL_CHANGE_SHARE;
  if (local) {
    const movable = new Set(added);
    for (const l of msg.links) {
      if (changed.has(l.source)) movable.add(l.target);
      if (changed.has(l.target)) movable.add(l.source);
    }
    for (const n of nodes) {
      if (movable.has(n.key)) continue;
      n.fx = n.x;
      n.fy = n.y;
      n.fz = n.z;
    }
    simulation.alphaDecay(LOCAL_DECAY).alpha(LOCAL_ALPHA);
  } else {
    // Joining a relaxation that is already running must not re-heat it, or
    // steady churn would keep it from ever settling.
    const alpha = msg.first ? 1 : globalRun ? simulation.alpha() : GLOBAL_UPDATE_ALPHA;
    globalRun = true;
    simulation.alphaDecay(GLOBAL_DECAY).alpha(alpha);
  }

  if (!running) {
    running = true;
    setTimeout(run, 0);
  }
}

function post(settled: boolean) {
  const positions = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    positions[i * 3] = n.x ?? 0;
    positions[i * 3 + 1] = n.y ?? 0;
    positions[i * 3 + 2] = n.z ?? 0;
  });
  const message: FromWorker = {
    type: "positions",
    keys: keysDirty ? nodes.map((n) => n.key) : null,
    positions,
    alpha: simulation.alpha(),
    settled,
  };
  keysDirty = false;
  self.postMessage(message, [positions.buffer]);
}

function run() {
  if (!running) return;
  simulation.tick(TICKS_PER_POST);
  const settled = simulation.alpha() < ALPHA_MIN;
  post(settled);
  if (settled) {
    running = false;
    globalRun = false;
    unpinAll();
    return;
  }
  setTimeout(run, 0);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data.type === "stop") {
    running = false;
    return;
  }
  update(e.data);
};
