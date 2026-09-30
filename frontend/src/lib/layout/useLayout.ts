import { useEffect, useRef, useState } from "react";
import { createLayoutStore, writeLayout, type LayoutStore } from "./layoutStore";
import type { FromWorker, LayoutLink, LayoutMode, LayoutNode, ToWorker } from "./types";

const REPORT_DISPLACEMENT = new URLSearchParams(window.location.search).has("stats");

interface Baseline {
  positions: Map<string, [number, number, number]>;
  /** Nodes that were added or removed, and their direct neighbors. */
  related: Set<string>;
}

function snapshotPositions(store: LayoutStore) {
  const out = new Map<string, [number, number, number]>();
  store.keys.forEach((k, i) => out.set(k, [store.positions[i * 3]!, store.positions[i * 3 + 1]!, store.positions[i * 3 + 2]!]));
  return out;
}

// SC-002 check: how far did nodes move that the update had nothing to do with,
// as a share of the layout's width.
function reportDisplacement(store: LayoutStore, baseline: Baseline) {
  let minX = Infinity;
  let maxX = -Infinity;
  let worst = 0;
  store.keys.forEach((k, i) => {
    const x = store.positions[i * 3]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    const before = baseline.positions.get(k);
    if (!before || baseline.related.has(k)) return;
    worst = Math.max(worst, Math.hypot(x - before[0], store.positions[i * 3 + 1]! - before[1], store.positions[i * 3 + 2]! - before[2]));
  });
  const width = Math.max(maxX - minX, 1);
  console.info(`[galaxy] max unrelated displacement: ${((worst / width) * 100).toFixed(2)}% of layout width`);
}

/** Runs the layout for one view in a worker and exposes positions through a store. */
export function useLayout(mode: LayoutMode, nodes: LayoutNode[], links: LayoutLink[]): LayoutStore {
  const [store] = useState(createLayoutStore);
  const worker = useRef<Worker | null>(null);
  const sentFirst = useRef(false);
  const lastSignature = useRef("");
  const baseline = useRef<Baseline | null>(null);
  const firstSentAt = useRef<number | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      writeLayout(store, e.data.keys, e.data.positions, e.data.settled);
      if (REPORT_DISPLACEMENT && e.data.settled && firstSentAt.current !== null) {
        console.info(`[galaxy] ${mode} layout settled in ${Math.round(performance.now() - firstSentAt.current)} ms`);
        firstSentAt.current = null;
      }
      if (e.data.settled && baseline.current) {
        reportDisplacement(store, baseline.current);
        baseline.current = null;
      }
    };
    worker.current = w;
    return () => {
      w.postMessage({ type: "stop" } satisfies ToWorker);
      w.terminate();
      worker.current = null;
      sentFirst.current = false;
      lastSignature.current = "";
    };
  }, [store, mode]);

  // Only structural changes recompute the layout; state-only snapshots
  // (colors, readiness) keep the current positions.
  useEffect(() => {
    const w = worker.current;
    if (!w || nodes.length === 0) return;
    const signature = nodes.map((n) => n.key).join("|") + "#" + links.map((l) => `${l.source}>${l.target}`).join("|");
    if (signature === lastSignature.current) return;

    // Under continuous churn the layout may not settle between updates, so the
    // previous update is reported when the next one arrives.
    if (baseline.current) {
      reportDisplacement(store, baseline.current);
      baseline.current = null;
    }
    if (REPORT_DISPLACEMENT && sentFirst.current) {
      const previous = new Set(store.keys);
      const current = new Set(nodes.map((n) => n.key));
      const changed = new Set([...previous].filter((k) => !current.has(k)).concat([...current].filter((k) => !previous.has(k))));
      const related = new Set(changed);
      for (const l of links) {
        if (changed.has(l.source)) related.add(l.target);
        if (changed.has(l.target)) related.add(l.source);
      }
      baseline.current = { positions: snapshotPositions(store), related };
    }

    lastSignature.current = signature;
    if (!sentFirst.current) firstSentAt.current = performance.now();
    w.postMessage({ type: "update", mode, nodes, links, first: !sentFirst.current } satisfies ToWorker);
    sentFirst.current = true;
  }, [mode, nodes, links, store]);

  return store;
}
