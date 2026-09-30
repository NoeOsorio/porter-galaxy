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
      first: boolean;             // true on the first snapshot of a view: nodes start at their targets
    }
  | { type: "stop" };
```

- `update` replaces the node and link sets and recomputes a deterministic target for every node:
  topology is a layered tree per namespace (pods in a grid under their parent, Internet and load
  balancers centered over what they route to); clusters is radial (machines on an inner ring,
  namespaces as arcs of an outer ring or spiral, pods clustered under their workload).
  `role: "pod"` nodes pack around their parent; `role: "ref"` nodes hang off a pod.
- Nodes ease toward their targets. New nodes start at `parent`'s current position (at their target
  on the first update); removed nodes are dropped. Pods keep their slot in order of first
  appearance, so churn only moves what changed and what sits after it.
- `stop` halts ticking (view unmounted).

## Worker → main

```ts
type FromWorker = {
  type: "positions";
  keys: string[] | null;          // present only when the key order changed since the last message
  positions: Float32Array;        // transferable; x, y, z per key in order
  settled: boolean;               // every node has reached its target
};
```

- Sent about every 16 ms while nodes move, and once more when they settle.
- The main thread must treat `positions` as owned (it is transferred, not copied).
