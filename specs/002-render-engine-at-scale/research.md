# Research: Render Engine at Scale

## R1. Node rendering

- **Decision**: One `THREE.InstancedMesh` of a unit plane per scene for node bodies and one for
  glows. A vertex shader billboards each instance toward the camera (so nodes stay round, as in
  001), and per-instance attributes carry color, radius, opacity, and a blink flag; blinking is
  computed in the shader from a time uniform.
- **Rationale**: 1,000 nodes today mean ~2,000 sprites plus React components; instancing makes
  it 2 draw calls and removes per-node React reconciliation.
- **Alternatives**: `THREE.Points` with a circle texture — one draw call, but point size is capped
  by `gl.ALIASED_POINT_SIZE_RANGE` on some GPUs and picking by raycast threshold is imprecise.
  drei `<Instances>` — still one React element per instance, which is the cost being removed.

## R2. Picking

- **Decision**: Screen-space nearest node. On pointer move (throttled to one check per frame),
  project all positions with the current camera and pick the closest node whose projected radius
  contains the pointer; click and double-click reuse the last hover result. Empty-space clicks keep
  calling the existing `onPointerMissed` path.
- **Rationale**: Raycasting billboards in an instanced mesh needs a custom `raycast`; projecting
  1,000–3,000 points is a few microseconds and matches what the user sees.

## R3. Links

- **Decision**: drei `<Segments>` (one `LineSegments2` draw call, pixel line width, per-segment
  color) for all links, plus a second `<Segments>` with a wider line for the highlighted path or
  family. Segment endpoints are updated in place from the layout store.
- **Rationale**: One cylinder mesh per link today; `Segments` is already in drei.

## R4. Snapshot updates without re-rendering

- **Decision**: Scenes rebuild their instance attributes only when the set of keys changes (add or
  remove), and patch colors/opacity in place when only states change. Positions are never React
  state; `useFrame` copies them from the layout store into instance matrices and segment buffers.
- **Rationale**: Today every snapshot recreates every mesh; with a 500 ms update rate at 1,000
  nodes that is the hitch in US1 scenario 2.

## R5. Layout

- **Decision**: `d3-force-3d` in a module Web Worker (`new Worker(new URL(...), { type: "module" })`,
  bundled by Vite). Forces:
  - `forceLink` along ownership and routing links (short, strong inside a Deployment → Pods
    group);
  - `forceManyBody` (Barnes-Hut, θ = 0.9) for spacing;
  - a namespace anchor force pulling each node toward its namespace anchor, placed on a golden-angle
    spiral by a hash of the namespace name, so namespaces keep their place across reloads;
  - Topology only: `forceY` per tier (Internet, LB, Ingress, Service, Deployment, Pod), preserving
    the top-to-bottom flow;
  - Clusters only: anchors per cluster, then per namespace inside it;
  - `forceCollide` by node radius.

  Warm start: existing nodes keep their positions; new nodes are seeded at their parent's position
  plus a small jitter; after an update the simulation restarts with `alpha = 0.15`, after the first
  snapshot with `alpha = 1`. The worker posts positions as a transferable `Float32Array` every other
  tick until `alpha < alphaMin`.
- **Rationale**: Low restart alpha plus strong anchors is what keeps unrelated nodes still
  (SC-002). Transferable buffers avoid copying 3,000 × 3 floats per message.
- **Alternatives**: `ngraph.forcelayout` (3D-capable, but no per-axis forces for tiers);
  running d3-force-3d on the main thread (violates the "no layout on the main thread" constraint).
- **Types**: the package ships no TypeScript types; a minimal `types/d3-force-3d.d.ts` covers the
  functions used.

## R6. Layout store

- **Decision**: A per-view mutable store: `keys: string[]`, `index: Map<string, number>`,
  `positions: Float32Array` (x, y, z per key), and a `version` counter bumped on each worker message.
  Scenes, picking, labels, and `CameraRig` read from it; nothing re-renders on position changes.

## R7. Labels

- **Decision**: A single DOM overlay (`Labels.tsx`) with a pool of at most 60 absolutely positioned
  elements, repositioned every frame from projected positions. Candidates are ranked: namespace
  groups (label at the group centroid), then Deployments by pod count, then other objects; Pods only
  when the camera is within a distance threshold of them. A greedy pass places labels in rank order
  and skips any whose screen rectangle overlaps one already placed.
- **Rationale**: ≤ 60 DOM nodes is cheap and gives crisp text without SDF generation.
- **Alternatives**: drei `<Text>` (troika) — one mesh and SDF glyph work per label, and its
  collision avoidance would still have to be written.

## R8. 2D mode

- **Decision**: A header toggle locks the camera to the view's primary plane and disables
  rotation: Topology looks at the x/y plane from the front (its tiers read top to bottom); Clusters
  looks down at the x/z plane. Pan and zoom stay; the same layout is used (FR-005).
- **Rationale**: A top-down camera on Topology would stack its tiers on top of each other.

## R9. Load generation

- **Decision**: `backend/cmd/fakestream`, a standalone Go binary that serves `GET /api/v1/clusters`
  as SSE with a synthetic `Snapshot` (flags: pods, namespaces, deployments per namespace, churn
  interval, churn size) using the same `cluster` types, plus `GET /readyz`. Frontend runs with
  `VITE_API_URL` pointed at it. `?stats` in the URL shows drei `<StatsGl>` (fps, frame time).
- **Rationale**: A real 1,000-pod kind cluster needs `maxPods` changes and several workers; the fake
  stream exercises the exact render path, is deterministic, and controls churn rate for US1
  scenario 2. Correctness stays verified on the real cluster.

## R10. WebGL2 check

- **Decision**: Before mounting the Canvas, probe `document.createElement("canvas").getContext("webgl2")`;
  if it is null, show "Galaxy needs WebGL2" with the browser name instead of the Canvas.
