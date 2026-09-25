# Feature Specification: Truthful Graph and Usable Camera

**Feature Branch**: `001-truthful-graph-and-camera`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Take Porter Galaxy to the next level. It has many flaws: the UI, the
camera movement, and it lost multi-cluster. First fix what's broken so the app is trustworthy and
pleasant to explore, iteratively and without unit tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The graph shows what is really in the cluster (Priority: P1)

An operator opens Galaxy on their cluster and sees every workload they run, with correct names,
owners, and health. Nothing is missing, merged, or painted with the wrong state.

**Why this priority**: A visualizer that hides or mislabels objects is worse than `kubectl get`.
Today the Topology view shows 11 objects on a cluster with 21 Deployments and 71 Pods, the load
balancer is labeled "1.amazon", and Completed pods render as errors.

**Independent Test**: Deploy the slice, compare the counts and names in both views against
`kubectl get deploy,pods -A` on the same cluster.

**Acceptance Scenarios**:

1. **Given** a cluster with 21 Deployments, **When** the operator opens the Clusters view, **Then**
   the overview shows 21 deployments and each one appears exactly once.
2. **Given** two Pods named `worker-0` in namespaces `a` and `b`, **When** the graph loads, **Then**
   both appear as separate objects, each showing its namespace.
3. **Given** a Deployment exposed by a Service with a different name, **When** the Topology view
   loads, **Then** the Deployment and its Pods appear, linked to that Service.
4. **Given** a Job pod in `Succeeded` phase, **When** it is drawn, **Then** it uses the "completed"
   state, not the "error" state.
5. **Given** a LoadBalancer Service fronted by an AWS ELB, **When** its node is drawn, **Then** its
   label is the Service's namespace/name, and the ELB hostname is shown in the detail panel.
6. **Given** Pods owned by a ReplicaSet of a Deployment, **When** the graph loads, **Then** the
   Pods link to that Deployment through ownership, even if another Deployment's selector also
   matches their labels.

---

### User Story 2 - The app loads fast and never breaks when switching views (Priority: P2)

The operator opens the URL and sees a loading state immediately, then the graph. Switching between
Topology and Clusters is instant and never blanks or freezes the page.

**Why this priority**: Today the page is black for 5–10 s with no feedback, the JavaScript bundle
is 1.37 MB uncompressed, and switching views logs `WebGLRenderer: Context Lost` and opens a second
live stream.

**Independent Test**: Load the deployed app with a cold cache and switch views ten times; watch the
network panel and console.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the page loads, **Then** a loading indicator is visible within
   300 ms and stays until the first graph renders.
2. **Given** the graph is showing, **When** the operator switches views ten times, **Then** the
   console shows no context-lost errors and the browser keeps exactly one live stream open.
3. **Given** the live stream drops, **When** it reconnects, **Then** a connection indicator shows
   "reconnecting" and then "live", and no error overlay remains on top of a working graph.
4. **Given** the backend is unreachable, **When** reconnect attempts keep failing for 30 s,
   **Then** the indicator shows "offline" with the time of the last update, and the last graph
   stays visible.

---

### User Story 3 - The camera frames and follows what I care about (Priority: P3)

The operator always starts with the whole graph centered in view, can zoom smoothly, and when they
click a node or search for one, the camera flies to it.

**Why this priority**: Today the Clusters view opens off-center and cut off at the screen edge,
"Reset view" does not re-center it, ten scroll steps barely change the zoom, and search only dims
other nodes without moving the camera.

**Independent Test**: On the deployed app, open each view, use reset, click a node, and search for
`grafana`; check framing and motion.

**Acceptance Scenarios**:

1. **Given** either view has loaded, **When** the first graph renders, **Then** every node is
   inside the viewport with a visible margin.
2. **Given** the operator has rotated and zoomed, **When** they press "Reset view" or the `R` key,
   **Then** the camera animates back to the framed view in under 1 s.
3. **Given** a node is clicked, **When** the selection changes, **Then** the camera flies to center
   that node and its neighbors, and a new click interrupts the previous flight smoothly.
4. **Given** a search with exactly one match, **When** the operator presses Enter, **Then** the
   camera flies to that node and selects it; with several matches it frames all of them.
5. **Given** the mouse wheel or trackpad, **When** the operator zooms, **Then** each step changes
   distance noticeably and zoom stops at limits that keep the graph readable.
6. **Given** any aspect ratio, **When** nodes are drawn, **Then** they render as circles, not
   ellipses.

### Edge Cases

- A Pod with no owner (bare Pod) appears on its own, linked to its node, not dropped.
- A Deployment scaled to 0 appears with a "scaled to zero" state and no Pods.
- A Deployment whose Pods sit on several nodes appears once in the Clusters view, with links to each
  node that runs its Pods.
- Objects added or removed while the camera is flying do not stop the flight or reset the framing.
- A search with zero matches shows "No matches" and leaves the camera where it is.
- The selected node is deleted from the cluster: the detail panel shows "deleted" and closes after
  the next update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST identify every object by cluster, namespace, kind, and name, and use
  that identity for nodes, links, selection, and search.
- **FR-002**: The system MUST resolve Pod ownership through owner references (Pod → ReplicaSet →
  Deployment), falling back to "standalone" only when there is no owner.
- **FR-003**: The Topology view MUST show every Deployment that is reachable from an Ingress or a
  Service, regardless of how the Service is named.
- **FR-004**: The Clusters view MUST show each Deployment once per cluster.
- **FR-005**: Object state (running, pending, completed, failed, unknown) MUST be derived from
  Kubernetes status fields and shown with one consistent color per state in both views.
- **FR-006**: Labels MUST be human-readable Kubernetes names; generated suffixes and external
  hostnames go to the detail panel.
- **FR-007**: The app MUST show a loading state and a connection state (live, reconnecting,
  offline) that keeps the last graph visible while disconnected.
- **FR-008**: Switching views MUST NOT recreate the rendering surface or open an additional live
  stream.
- **FR-009**: Static assets MUST be served compressed, and code for views that the app does not
  offer MUST NOT ship.
- **FR-010**: The camera MUST frame the graph on first render and on reset, and fly to a selected
  or searched node with an interruptible animation.
- **FR-011**: The backend MUST report ready only after its cluster cache has synced.

### Key Entities

- **Object**: Anything drawn (Internet, LoadBalancer, Ingress, Service, Deployment, Pod, Node,
  Cluster). Identity = cluster + namespace + kind + name; has a display name, a state, and details.
- **Link**: A directed relationship between two Objects with a type (routes-to, selects, owns,
  scheduled-on) and an active flag.
- **Snapshot**: The full set of Objects and Links for all clusters at one moment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the reference cluster, Deployment and Pod counts in Galaxy equal
  `kubectl get deploy,pods -A` counts (0 missing, 0 duplicated).
- **SC-002**: A loading indicator appears within 300 ms, and the first graph renders within 2 s
  on a warm cache.
- **SC-003**: Compressed JavaScript sent to the browser is at most half of today's 1.37 MB.
- **SC-004**: Ten view switches produce 0 context-lost messages and at most 1 open live stream.
- **SC-005**: A first-time user can find and center a named Deployment (for example `grafana`) in
  under 10 seconds.

## Assumptions

- The reference cluster is `porter-gloom-dev`, where Galaxy runs as a Porter Helm add-on.
- Multi-cluster, new Kubernetes kinds, labels in 3D, and performance at 1,000+ pods are later specs
  (002–006); this spec keeps the single-cluster, in-cluster mode.
- The live update transport stays as it is (full snapshots); only its identity scheme changes.
- Desktop browsers only; touch and mobile are out of scope.
