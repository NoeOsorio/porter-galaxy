# Data Model: Explore and Share

## Focus (view state)

| Field | Meaning |
| --- | --- |
| namespace | Focused namespace name, or none |

Nodes whose namespace differs are hidden; each other namespace shows as one labeled dot.
Cluster-scoped nodes (Internet, load balancers, machines) stay visible.

## Object details (from `GET /api/v1/objects`)

See [contracts/object-details.md](contracts/object-details.md). Only the fields listed there exist;
there is no free-form or raw section.

## URL state (fragment)

| Key | Example | Meaning |
| --- | --- | --- |
| `v` | `clusters` | View: `topology` or `clusters` |
| `d` | `2d` | Dimension |
| `ns` | `default` | Focused namespace |
| `sel` | `pod/default/web-7d9-abc` | Selected object key |
| `cam` | `120,80,600,0,0,0` | Camera position then target, integers |

## Replay history (browser memory)

| Field | Meaning |
| --- | --- |
| base | Snapshot (and its version) the history starts from |
| entries | `{at, patch}` in arrival order, at most 30 minutes old |
| checkpoints | Full state every 60 entries, with the entry index |

A new snapshot (reconnect or resync) replaces the history.
