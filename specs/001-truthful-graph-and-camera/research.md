# Research: Truthful Graph and Usable Camera

## R1. Object identity

- **Decision**: Every object gets a `key` of the form `<kind>/<namespace>/<name>` (cluster-scoped
  kinds use `_` as namespace, e.g. `node/_/ip-10-78-1-1`). The frontend prefixes the cluster ID when
  it merges clusters.
- **Rationale**: Pod IDs are bare names today (`builder.go:146`), so equal names in two namespaces
  collide. Links already use `ingress/<ns>/<name>` for ingresses, so the scheme extends what exists.
- **Alternatives**: Kubernetes UIDs. Rejected because they are unreadable in URLs and search, and
  they change when an object is recreated, which would break selection across restarts.

## R2. Pod ownership

- **Decision**: Watch ReplicaSets and resolve Pod → ReplicaSet → Deployment through
  `metadata.ownerReferences`. Register a `SetTransform` on the ReplicaSet informer that keeps only
  name, namespace, and owner references. Pods owned by StatefulSets, DaemonSets, or Jobs keep their
  owner kind and name in `owner` (drawn in spec 003); Pods with no owner are `standalone`.
- **Rationale**: Label-selector matching picks the first matching Deployment
  (`builder.go:115-143`), which is wrong when selectors overlap. Owner references are what the
  controllers themselves use.
- **Alternatives**: Stripping the pod-template hash from the ReplicaSet name. Rejected because it
  breaks for Deployments whose names contain the same pattern and gives no answer for other owners.

## R3. Object state

- **Decision**: One state enum shared by backend and frontend: `running`, `pending`, `completed`,
  `failed`, `unknown`, plus `scaled-to-zero` for Deployments. Pods map from `status.phase` and
  container waiting reasons (`CrashLoopBackOff`, `ImagePullBackOff` → `failed`). Deployments map
  from ready vs desired replicas.
- **Rationale**: The frontend guesses from exact strings (`transformTopology.ts:280-285`) and
  detects errors by comparing colors (`Topology.tsx:76`).

## R4. Load balancer labels

- **Decision**: Label = `namespace/name` of the LoadBalancer Service or the Ingress controller
  Service; the external hostname or IP goes into `details.address`.
- **Rationale**: `transformTopology.ts:124` slices the ELB hostname and produced "1.amazon".

## R5. One canvas, one stream

- **Decision**: `App.tsx` owns a single `<Canvas>` and a single `useClustersSSE` call; views become
  scene components that receive the snapshot as props. Connection state (`connecting`, `live`,
  `reconnecting`, `offline`) comes from `EventSource` events.
- **Rationale**: Each view mounts its own Canvas and stream today, which loses the WebGL context
  on every switch and opens duplicate streams (`useClustersSSE.ts:37`).

## R6. Bundle and compression

- **Decision**: Delete the unused views (`GalaxyGraph`, `K8sGalaxy`, `ClusterExplorer`,
  `K8sMolecule`) and everything only they import; remove the React Query provider if nothing else
  uses it. Enable `gzip on` in nginx for JS, CSS, JSON, and SVG; do not compress
  `text/event-stream`.
- **Rationale**: The deployed bundle is 1.37 MB with identical encoded and decoded size, meaning
  nginx sends it uncompressed.
- **Alternatives**: Brotli. Rejected for now because the stock nginx image needs an extra module.

## R7. Camera

- **Decision**: Use drei's `CameraControls` (wraps `camera-controls`, already in the drei package)
  in a shared `CameraRig` component. Framing uses `fitToBox` on the bounding box of visible nodes
  with padding; fly-to uses `setLookAt(..., true)`, which cancels any running transition. Zoom uses
  dolly with `minDistance`/`maxDistance` derived from the graph's bounding radius. `R` resets.
- **Rationale**: The current code runs manual `requestAnimationFrame` lerps that never cancel
  (`Topology.tsx:91-151`), and fixed distance limits (200–900, 100–1500) make wheel zoom feel dead.
- **Alternatives**: Keep `OrbitControls` and fix the lerps. Rejected because interruptible,
  eased transitions and box fitting would be rebuilt by hand.
- **Check on install**: Confirm the installed drei version exports `CameraControls`; if not, add
  `camera-controls` directly (justify under Principle V in the PR).

## R8. Ellipse distortion

- **Decision**: Recompute the camera's aspect on resize through R3F's default handling and draw
  node glows as camera-facing sprites instead of scaled spheres.
- **Rationale**: Nodes near the edges of the Clusters view render as ellipses; the cause must be
  confirmed while implementing (wide FOV perspective stretch vs a stale aspect).

## R9. Readiness

- **Decision**: Add `GET /readyz`, which returns 503 until `WaitForCacheSync` succeeds for every
  cluster, and point the chart's `readinessProbe` to it. `/healthz` stays as the liveness probe.
- **Rationale**: Readiness hits a static `/healthz` today, so the Service sends traffic before the
  cache has data and the first snapshot can be empty.
