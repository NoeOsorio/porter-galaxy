# Contract: Layout Worker Messages

The worker owns the simulation; the main thread owns the layout store.

## Main → worker

```ts
type ToWorker =
  | {
      type: "update";
      mode: "topology" | "clusters";
      nodes: LayoutNode[];        // full current set, see data-model.md
      links: LayoutLink[];
      first: boolean;             // true on the first snapshot of a view: alpha = 1
    }
  | { type: "stop" };
```

- `update` replaces the node and link sets. Nodes whose `key` already exists keep their position;
  new nodes are seeded at `parent`'s position plus jitter (or at their group anchor if the parent
  is unknown); removed nodes are dropped. Each `LayoutLink` carries `strength` and `distance`.
- Restart energy: the first update starts at `alpha = 1`. Later updates that change ≤ 20% of the
  nodes pin every node that is not new or a direct neighbor of a change and run a short local
  relaxation (`alpha = 0.3`, faster decay). Larger changes re-relax everything from `alpha = 0.15`.
  An update that arrives during a global relaxation joins it without raising its energy.
- `stop` halts ticking (view unmounted).

## Worker → main

```ts
type FromWorker = {
  type: "positions";
  keys: string[] | null;          // present only when the key order changed since the last message
  positions: Float32Array;        // transferable; x, y, z per key in order
  alpha: number;
  settled: boolean;               // alpha < alphaMin
};
```

- Sent every second tick while the simulation runs, and once more when it settles.
- The main thread must treat `positions` as owned (it is transferred, not copied).
