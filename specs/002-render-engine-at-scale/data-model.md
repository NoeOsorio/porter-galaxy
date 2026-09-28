# Data Model: Render Engine at Scale

No change to the snapshot contract. These are frontend-only structures.

## LayoutNode (input to the worker)

| Field | Meaning |
| --- | --- |
| `key` | Object key from spec 001 (`<clusterId>::<kind/ns/name>` in Clusters) |
| `group` | Namespace (or `_` for cluster-scoped objects); drives the namespace anchor |
| `cluster` | Cluster ID; drives the cluster anchor in the Clusters view |
| `tier` | Topology only: 0 Internet … 5 Pod; drives the per-tier `forceY` |
| `radius` | Collision radius (node size) |
| `parent` | Key used to seed a new node's position (owner Deployment, Node, or Service) |

## LayoutLink

`{ source: key, target: key, strength: number }`. Ownership links (Deployment → Pod) are strong
and short; routing and placement links are weaker and longer.

## LayoutStore (per view, main thread)

| Field | Meaning |
| --- | --- |
| `keys: string[]` | Keys in worker order |
| `index: Map<string, number>` | Key → slot |
| `positions: Float32Array` | `x, y, z` per slot, replaced by each worker message |
| `version: number` | Incremented per message; readers compare to skip unchanged frames |
| `settled: boolean` | True once the worker reports `alpha < alphaMin` |

## Render attributes (per scene, instanced)

| Attribute | Per | Source |
| --- | --- | --- |
| `instanceColor` | node | kind or state color (001 rules) |
| `aRadius` | node | node size |
| `aOpacity` | node | 1, 0.3 (dimmed by selection), or 0.2 (filtered out) |
| `aBlink` | node | 1 for failed pods |

## Label candidate

`{ key, text, rank, anchor }` — `rank` orders placement (namespace > Deployment by pod count >
others > Pod), `anchor` is a slot index or a namespace centroid.
