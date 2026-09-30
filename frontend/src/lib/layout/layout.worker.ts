/// <reference lib="webworker" />
import type { FromWorker, LayoutLink, LayoutMode, LayoutNode, ToWorker } from "./types";

interface PlacedNode extends LayoutNode {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  /** Order of first appearance. */
  seq: number;
  /** A pod's place among its siblings, kept while it lives so churn only fills gaps. */
  slot?: number;
}

const TIER_Y: Record<LayoutMode, number[]> = {
  topology: [260, 180, 100, 20, -60, -140, -210],
  clusters: [260, 140, 20, -100, -170],
};

// Slots leave room for a node at full load (1.6x radius) plus its glow.
const SLOT_FACTOR = 3.2;
// Workloads and services also need room for their label.
const MIN_SLOT = 64;
const GAP = 16;
const GROUP_GAP = 90;
const ROW_GAP = 140;
// Width over height of the wrapped topology, rounded so small changes in
// namespace widths do not reflow every row.
const ROW_ASPECT = 1.6;
const ROW_QUANTUM = 400;
// Keeps a small cluster's arc gentle, and the ring wide enough that its near
// and far sides do not overlap from the default camera.
const MIN_RING_RADIUS = 700;
// How far toward the ring's axis load balancers and Internet sit.
const HUB_PULL = 0.5;
const MIN_TIER_GAP = 60;
const REF_DROP = 70;
const REF_RING = 22;
const RING_GAP = 60;
const CLUSTER_GAP = 200;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// Vogel spiral scale per slot; points end up about one slot apart.
const SPIRAL_SPACING = 0.6;

const EASE = 0.14;
const FRAME_MS = 16;
const SNAP = 0.05;

const byKey = new Map<string, PlacedNode>();
let nodes: PlacedNode[] = [];
let nextSeq = 0;
let keysDirty = true;
let running = false;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function slot(n: LayoutNode) {
  return n.role ? n.radius * SLOT_FACTOR : Math.max(MIN_SLOT, n.radius * SLOT_FACTOR);
}

function gridCols(count: number) {
  return count <= 4 ? count : Math.ceil(Math.sqrt(count * 2));
}

/** Pods keep their slot; new pods take the lowest free one, and pods past a shrunken end move into gaps. */
function assignSlots(pods: PlacedNode[]) {
  const out: (PlacedNode | undefined)[] = new Array(pods.length);
  const rest: PlacedNode[] = [];
  for (const p of [...pods].sort((a, b) => a.seq - b.seq)) {
    if (p.slot !== undefined && p.slot < pods.length && !out[p.slot]) out[p.slot] = p;
    else rest.push(p);
  }
  let free = 0;
  for (const p of rest) {
    while (out[free]) free++;
    out[free] = p;
    p.slot = free;
  }
  return out as PlacedNode[];
}

function childIndex(list: PlacedNode[]) {
  const kids = new Map<string, PlacedNode[]>();
  for (const n of list) {
    const parent = n.parent ? byKey.get(n.parent) : undefined;
    if (parent && parent.group === n.group) push(kids, parent.key, n);
  }
  const pods = new Map([...kids].map(([key, list]) => [key, assignSlots(list.filter((k) => k.role === "pod"))]));
  return {
    tree: (n: PlacedNode) => (kids.get(n.key) ?? []).filter((k) => !k.role),
    pods: (n: PlacedNode) => pods.get(n.key) ?? [],
    refs: (n: PlacedNode) => (kids.get(n.key) ?? []).filter((k) => k.role === "ref"),
    isSubroot: (n: PlacedNode) => {
      const parent = n.parent ? byKey.get(n.parent) : undefined;
      return n.group !== "_" && n.role !== "ref" && (!parent || parent.group !== n.group);
    },
  };
}

function groupsOf(list: PlacedNode[], include: (n: PlacedNode) => boolean) {
  const groups = new Map<string, PlacedNode[]>();
  for (const n of list) if (include(n)) push(groups, n.group, n);
  return [...groups.keys()].sort().map((g) => groups.get(g)!);
}

function neighborIndex(links: LayoutLink[]) {
  const map = new Map<string, PlacedNode[]>();
  for (const l of links) {
    const a = byKey.get(l.source);
    const b = byKey.get(l.target);
    if (!a || !b) continue;
    push(map, a.key, b);
    push(map, b.key, a);
  }
  return map;
}

/**
 * Topology reads top to bottom: each namespace is a block of tidy trees and
 * pods pack in a grid under their parent. Flat, namespaces wrap into rows
 * under Internet; otherwise one strip bends into a ring around it.
 */
function layoutLayered(list: PlacedNode[], links: LayoutLink[], flat: boolean) {
  const tierY = TIER_Y.topology;
  const kids = childIndex(list);
  const rowY = (n: PlacedNode, parentY: number) => Math.min(tierY[n.tier] ?? parentY - MIN_TIER_GAP, parentY - MIN_TIER_GAP);
  // How far each pod sits above the bottom row of its grid; refs go below it.
  const gridDepth = new Map<string, number>();
  let block: PlacedNode[] = [];

  const contentWidths = new Map<PlacedNode, number>();
  const contentWidth = (n: PlacedNode): number => {
    const cached = contentWidths.get(n);
    if (cached !== undefined) return cached;
    const tree = kids.tree(n);
    const pods = kids.pods(n);
    let w = tree.reduce((sum, k) => sum + width(k), 0) + GAP * Math.max(0, tree.length - 1);
    if (pods.length > 0) w += (tree.length > 0 ? GAP : 0) + gridCols(pods.length) * slot(pods[0]!);
    contentWidths.set(n, w);
    return w;
  };
  const width = (n: PlacedNode) => Math.max(slot(n), contentWidth(n));

  const place = (n: PlacedNode, left: number, y: number) => {
    n.tx = left + width(n) / 2;
    n.ty = y;
    n.tz = 0;
    block.push(n);
    let cursor = left + (width(n) - contentWidth(n)) / 2;
    for (const k of kids.tree(n)) {
      place(k, cursor, rowY(k, y));
      cursor += width(k) + GAP;
    }
    const pods = kids.pods(n);
    if (pods.length === 0) return;
    const cols = gridCols(pods.length);
    const s = slot(pods[0]!);
    const top = rowY(pods[0]!, y);
    const bottom = top - (Math.ceil(pods.length / cols) - 1) * s;
    pods.forEach((p, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, pods.length - row * cols);
      p.tx = cursor + ((cols - inRow) / 2 + (i % cols) + 0.5) * s;
      p.ty = top - row * s;
      p.tz = 0;
      gridDepth.set(p.key, p.ty - bottom);
      block.push(p);
    });
  };

  const blocks = groupsOf(list, kids.isSubroot).map((roots) => {
    block = [];
    let x = 0;
    for (const r of roots) {
      place(r, x, tierY[r.tier] ?? 0);
      x += width(r) + GAP;
    }
    const ys = block.map((n) => n.ty);
    return { nodes: block, width: x - GAP, height: Math.max(...ys) - Math.min(...ys) };
  });

  // Flat namespaces wrap into rows so a large cluster keeps a screen-like
  // shape instead of one strip too wide to read at any zoom.
  const rowHeight = Math.max(0, ...blocks.map((b) => b.height)) + ROW_GAP;
  const totalWidth = blocks.reduce((sum, b) => sum + b.width + GROUP_GAP, 0);
  const rowWidth = flat
    ? Math.max(...blocks.map((b) => b.width), Math.ceil(Math.sqrt(ROW_ASPECT * totalWidth * rowHeight) / ROW_QUANTUM) * ROW_QUANTUM)
    : Infinity;
  const rows: (typeof blocks)[] = [];
  let used = 0;
  for (const b of blocks) {
    if (rows.length === 0 || used + b.width > rowWidth) {
      rows.push([]);
      used = 0;
    }
    rows.at(-1)!.push(b);
    used += b.width + GROUP_GAP;
  }
  rows.forEach((row, ri) => {
    let x = flat ? (rowWidth - (row.reduce((sum, b) => sum + b.width + GROUP_GAP, 0) - GROUP_GAP)) / 2 : 0;
    for (const b of row) {
      for (const n of b.nodes) {
        n.tx += x;
        n.ty -= ri * rowHeight;
      }
      x += b.width + GROUP_GAP;
    }
  });

  for (const pod of list) {
    const refs = kids.refs(pod);
    refs.forEach((r, i) => {
      r.tx = pod.tx + (i - (refs.length - 1) / 2) * slot(r);
      r.ty = pod.ty - (gridDepth.get(pod.key) ?? 0) - REF_DROP;
      r.tz = pod.tz;
    });
  }

  if (!flat) bendIntoRing(list.filter((n) => n.group !== "_"));

  // Deepest shared tier first, so Internet centers over load balancers that
  // are already centered over the namespaces they route to. On the ring they
  // are pulled toward its axis instead, so Internet ends up as the hub.
  const neighbors = neighborIndex(links);
  const placed = new Set(list.filter((n) => n.group !== "_"));
  const shared = list.filter((n) => n.group === "_");
  const tiers = [...new Set(shared.map((n) => n.tier))].sort((a, b) => b - a);
  for (const tier of tiers) {
    const row = shared.filter((n) => n.tier === tier);
    for (const n of row) {
      const below = (neighbors.get(n.key) ?? []).filter((m) => placed.has(m) && m.tier > n.tier);
      const mean = (pick: (m: PlacedNode) => number) => below.reduce((sum, m) => sum + pick(m), 0) / below.length;
      if (flat) {
        n.tx = below.length > 0 ? mean((m) => m.tx) : rowWidth / 2;
        n.tz = 0;
      } else {
        n.tx = below.length > 0 ? mean((m) => m.tx) * HUB_PULL : 0;
        n.tz = below.length > 0 ? mean((m) => m.tz) * HUB_PULL : 0;
      }
      n.ty = tierY[tier] ?? 0;
    }
    if (flat) spreadRow(row);
    else separate(row);
    for (const n of row) placed.add(n);
  }
}

/** Bends the strip around the vertical axis; a small cluster stays a gentle arc facing +z. */
function bendIntoRing(list: PlacedNode[]) {
  if (list.length === 0) return;
  const xs = list.map((n) => n.tx);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const radius = Math.max(MIN_RING_RADIUS, (max - min + GROUP_GAP) / (2 * Math.PI));
  const mid = (min + max) / 2;
  for (const n of list) {
    const theta = (n.tx - mid) / radius;
    n.tx = Math.sin(theta) * radius;
    n.tz = Math.cos(theta) * radius;
  }
}

/** Pushes apart nodes of one tier that landed on top of each other in x/z. */
function separate(row: PlacedNode[]) {
  row.sort((a, b) => a.key.localeCompare(b.key));
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i]!;
        const b = row[j]!;
        const min = (slot(a) + slot(b)) / 2;
        let dx = b.tx - a.tx;
        let dz = b.tz - a.tz;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-6) [dx, dz, d] = [1, 0, 1];
        const push = (min - d) / 2 / d;
        a.tx -= dx * push;
        a.tz -= dz * push;
        b.tx += dx * push;
        b.tz += dz * push;
      }
    }
  }
}

/** Pushes overlapping nodes of one row apart, keeping the row's center. */
function spreadRow(row: PlacedNode[]) {
  if (row.length < 2) return;
  const before = row.reduce((sum, n) => sum + n.tx, 0);
  row.sort((a, b) => a.tx - b.tx || a.key.localeCompare(b.key));
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1]!;
    const min = prev.tx + (slot(prev) + slot(row[i]!)) / 2 + GAP;
    if (row[i]!.tx < min) row[i]!.tx = min;
  }
  const shift = (before - row.reduce((sum, n) => sum + n.tx, 0)) / row.length;
  for (const n of row) n.tx += shift;
}

function circularMean(angles: number[]) {
  return Math.atan2(
    angles.reduce((s, a) => s + Math.sin(a), 0),
    angles.reduce((s, a) => s + Math.cos(a), 0),
  );
}

/**
 * Clusters read from above: the cluster in the middle, its machines on an
 * inner ring, and namespaces as arcs of an outer ring (a spiral once one turn
 * is full) with each workload's pods clustered under it.
 */
function layoutRadial(list: PlacedNode[], links: LayoutLink[]) {
  const tierY = TIER_Y.clusters;
  const kids = childIndex(list);
  const neighbors = neighborIndex(links);
  const byCluster = new Map<string, PlacedNode[]>();
  for (const n of list) push(byCluster, n.cluster, n);
  const clusters = [...byCluster.keys()].sort();
  const extents: number[] = [];

  const put = (n: PlacedNode, angle: number, r: number) => {
    n.tx = Math.cos(angle) * r;
    n.tz = Math.sin(angle) * r;
    n.ty = tierY[n.tier] ?? 0;
  };
  // A CronJob's Jobs sort right after it.
  const rootOf = (n: PlacedNode) => {
    const parent = n.parent ? byKey.get(n.parent) : undefined;
    return parent && parent.group === n.group && !parent.role ? parent.key : n.key;
  };
  const footprint = (n: PlacedNode) => {
    const pods = kids.pods(n);
    if (pods.length === 0) return slot(n) / 2;
    const s = slot(pods[0]!);
    return Math.max(slot(n) / 2, s * SPIRAL_SPACING * Math.sqrt(pods.length) + s / 2);
  };

  for (const cluster of clusters) {
    const members = byCluster.get(cluster)!;
    const machines = members.filter((n) => n.group === "_" && n.parent);
    for (const n of members) if (n.group === "_" && !n.parent) put(n, 0, 0);

    const innerRing = Math.max(90, (machines.length * Math.max(0, ...machines.map(slot))) / (2 * Math.PI));
    const groups = groupsOf(members, (n) => n.group !== "_" && (!n.role || kids.isSubroot(n))).map((items) =>
      items.sort((a, b) => rootOf(a).localeCompare(rootOf(b)) || a.key.localeCompare(b.key)),
    );
    const fp = new Map(groups.flat().map((n) => [n, footprint(n)]));
    const maxFp = Math.max(0, ...fp.values());
    const outerRing = innerRing + RING_GAP + maxFp;
    const arc = groups.reduce((sum, items) => sum + items.reduce((s, n) => s + 2 * fp.get(n)! + GAP, 0) + GROUP_GAP, 0);

    if (arc <= 2 * Math.PI * outerRing) {
      const stretch = (2 * Math.PI * outerRing) / Math.max(arc, 1);
      let s = 0;
      for (const items of groups) {
        for (const n of items) {
          put(n, ((s + fp.get(n)!) * stretch) / outerRing, outerRing);
          s += 2 * fp.get(n)! + GAP;
        }
        s += GROUP_GAP;
      }
    } else {
      const pitch = 2 * maxFp + GAP;
      const radiusAt = (theta: number) => outerRing + (pitch * theta) / (2 * Math.PI);
      let theta = 0;
      let prev = 0;
      for (const [gi, items] of groups.entries()) {
        if (gi > 0) theta += GROUP_GAP / radiusAt(theta);
        for (const n of items) {
          if (prev > 0) theta += (prev + GAP + fp.get(n)!) / radiusAt(theta);
          put(n, theta, radiusAt(theta));
          prev = fp.get(n)!;
        }
      }
    }

    for (const n of groups.flat()) {
      kids.pods(n).forEach((p, i) => {
        const r = slot(p) * SPIRAL_SPACING * Math.sqrt(i + 0.5);
        p.tx = n.tx + Math.cos(i * GOLDEN_ANGLE) * r;
        p.tz = n.tz + Math.sin(i * GOLDEN_ANGLE) * r;
        p.ty = tierY[p.tier] ?? 0;
      });
    }

    // Machines keep even spacing but turn toward the workloads they run,
    // which keeps placement edges short and mostly uncrossed.
    const order = machines
      .map((m) => {
        const hosted = (neighbors.get(m.key) ?? []).filter((n) => n.group !== "_");
        return { m, angle: hosted.length > 0 ? circularMean(hosted.map((n) => Math.atan2(n.tz, n.tx))) : Infinity };
      })
      .sort((a, b) => a.angle - b.angle);
    const step = (2 * Math.PI) / Math.max(1, machines.length);
    const known = order.flatMap((o, i) => (Number.isFinite(o.angle) ? [o.angle - i * step] : []));
    const offset = known.length > 0 ? circularMean(known) : 0;
    order.forEach(({ m }, i) => put(m, offset + i * step, innerRing));

    for (const pod of members) {
      const refs = kids.refs(pod);
      refs.forEach((r, i) => {
        const angle = (i / refs.length) * 2 * Math.PI;
        r.tx = pod.tx + Math.cos(angle) * REF_RING;
        r.tz = pod.tz + Math.sin(angle) * REF_RING;
        r.ty = tierY[r.tier] ?? pod.ty - REF_DROP;
      });
    }

    extents.push(Math.max(0, ...members.map((n) => Math.hypot(n.tx, n.tz) + slot(n))));
  }

  if (clusters.length < 2) return;
  const ring = (2 * Math.max(...extents) + CLUSTER_GAP) / (2 * Math.sin(Math.PI / clusters.length));
  clusters.forEach((cluster, ci) => {
    const angle = (ci / clusters.length) * 2 * Math.PI;
    for (const n of byCluster.get(cluster)!) {
      n.tx += Math.cos(angle) * ring;
      n.tz += Math.sin(angle) * ring;
    }
  });
}

function update(msg: Extract<ToWorker, { type: "update" }>) {
  const next: PlacedNode[] = [];
  const added = new Set<PlacedNode>();
  const seen = new Set<string>();
  for (const incoming of msg.nodes) {
    seen.add(incoming.key);
    const existing = byKey.get(incoming.key);
    if (existing) {
      Object.assign(existing, incoming);
      next.push(existing);
      continue;
    }
    const node: PlacedNode = { ...incoming, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, seq: nextSeq++ };
    byKey.set(node.key, node);
    added.add(node);
    next.push(node);
  }
  for (const key of [...byKey.keys()]) if (!seen.has(key)) byKey.delete(key);

  const links = msg.links.filter((l) => byKey.has(l.source) && byKey.has(l.target));
  if (msg.mode === "topology") layoutLayered(next, links, msg.dimension === "2d");
  else layoutRadial(next, links);

  // New nodes grow out of their parent's current position; on a view's first
  // snapshot there is nothing to grow from, so everything starts in place.
  for (const n of added) {
    const parent = n.parent ? byKey.get(n.parent) : undefined;
    const from = !msg.first && parent && !added.has(parent) ? parent : n;
    n.x = from === n ? n.tx : from.x;
    n.y = from === n ? n.ty : from.y;
    n.z = from === n ? n.tz : from.z;
  }

  keysDirty = keysDirty || next.length !== nodes.length || next.some((n, i) => nodes[i] !== n);
  nodes = next;

  if (!running) {
    running = true;
    setTimeout(run, 0);
  }
}

function post(settled: boolean) {
  const positions = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    positions[i * 3] = n.x;
    positions[i * 3 + 1] = n.y;
    positions[i * 3 + 2] = n.z;
  });
  const message: FromWorker = { type: "positions", keys: keysDirty ? nodes.map((n) => n.key) : null, positions, settled };
  keysDirty = false;
  self.postMessage(message, [positions.buffer]);
}

function approach(current: number, target: number) {
  const d = target - current;
  return Math.abs(d) < SNAP ? target : current + d * EASE;
}

function run() {
  if (!running) return;
  let moving = false;
  for (const n of nodes) {
    n.x = approach(n.x, n.tx);
    n.y = approach(n.y, n.ty);
    n.z = approach(n.z, n.tz);
    moving ||= n.x !== n.tx || n.y !== n.ty || n.z !== n.tz;
  }
  post(!moving);
  if (!moving) {
    running = false;
    return;
  }
  setTimeout(run, FRAME_MS);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data.type === "stop") {
    running = false;
    return;
  }
  update(e.data);
};
