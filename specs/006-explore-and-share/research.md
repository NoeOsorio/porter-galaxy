# Research: Explore and Share

## R1. Focusing a namespace without a relayout

- **Decision**: Focus is view state, not layout input. The layout worker keeps every target. The
  scene sets opacity 0 for nodes outside the focused namespace (picking skips them), and draws one
  dot per other namespace at the centroid of its nodes, labeled with the existing `group` label
  style. The camera frames the focused namespace's nodes with `CameraRig.frame(ids)`. Escape steps
  back: first clears the selection, then the focus.
- **Rationale**: PR #44 made layouts deterministic per namespace, so positions stay meaningful when
  others are hidden. Changing attributes costs nothing per frame and is instantly reversible, while
  a relayout would move every node and break the layout displacement budget.
- **Alternatives**: collapsing other namespaces into a single node sent to the worker (moves the
  focused namespace too); a separate "namespace view" (a third view to maintain).

## R2. Where the panel's fields come from

- **Decision**: `GET /api/v1/objects?key=<object key>` returns allow-listed fields read from the
  informer listers at request time (contracts/object-details.md). Pods: images, ports, requests and
  limits, probes (type, path or port, timing), labels, node, restarts, start time. Workloads:
  replicas, strategy, selector, labels, images. Events are the Warning events the backend already
  keeps (spec 003); Normal events are not watched.
- **Rationale**: Adding these fields to the stream would grow every pod patch for data that only
  a selected object needs. The listers already hold full Pods and workloads, so a request is a map
  lookup and no new RBAC is needed.
- **Alternatives**: extending the snapshot (stream cost for every viewer); a direct API server
  `get` per request (extra latency and load).

## R3. Copy-command buttons

- **Decision**: The panel builds commands locally from the object key: `kubectl describe <kind>
  <name> -n <namespace>`, `kubectl get <kind> <name> -n <namespace> -o yaml`, and for Pods
  `kubectl logs -n <namespace> <name>` (with `--all-containers` when it has more than one
  container). Nodes omit `-n`. The clipboard API is used; on failure the command is selected in a
  text field so it can be copied by hand.
- **Rationale**: Full YAML and logs stay under the operator's own RBAC in their terminal.

## R4. URL state for shared links

- **Decision**: The URL fragment holds `v` (view), `ns` (focused namespace), `sel` (object key),
  `cam` (camera position and target, rounded to integers), and `d` (2d/3d), percent-encoded
  (contracts/url-state.md). It is rewritten with `history.replaceState` on changes, at most every
  500 ms while the camera moves. "Copy link" copies `location.href`.
- **Rationale**: A fragment is never sent to the server, so selections stay out of ingress logs.
  The login renders at the same URL without navigating, so the fragment is still there after
  signing in and is applied once the first snapshot arrives.
- **Edge**: If `sel` no longer exists, the focused namespace (or the whole view) opens with a
  notice. Unknown or malformed fields are ignored.

## R5. Replay in the browser

- **Decision**: `lib/replay.ts` keeps the snapshot plus every patch with its arrival time, and a
  full state checkpoint every 60 patches (states share unchanged lists, so a checkpoint costs only
  what changed). Entries older than 30 minutes are dropped, and a resync from a new snapshot starts
  a new history. Scrubbing to time T applies patches from the nearest earlier checkpoint. While
  scrubbing, the views render the historical state; the stream keeps buffering, and "Live" returns
  to the current state.
- **Rationale**: Bounded memory with no backend change; at most 60 patch applications per scrub
  step.
- **Measurement**: Record tab memory after 30 minutes at 3,000 pods with 500 ms churn in the
  `replay` verify check (fake stream with a shortened retention to keep the run short).
