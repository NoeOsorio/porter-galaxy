# Feature Specification: Render Engine at Scale

**Feature Branch**: `002-render-engine-at-scale`

**Created**: 2026-09-25

**Status**: Backlog (plan when 001 ships)

**Input**: User description: "Improve the UI and camera movement; make it a first-class app to
represent your cluster."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Large clusters stay smooth (Priority: P1)

An operator with a 1,000-pod cluster orbits, zooms, and hovers without stutter.

**Why this priority**: Every node is 2–3 high-poly meshes plus a light today, and every edge is a
mesh, so frame time grows with object count and Galaxy cannot be used on real production clusters.

**Independent Test**: Run on kind with a generated workload of 1,000 pods and measure frame rate
while orbiting.

**Acceptance Scenarios**:

1. **Given** 1,000 pods and 1,500 links, **When** the operator orbits for 10 s, **Then** the frame
   rate stays at or above 30 fps on a laptop GPU (target 60).
2. **Given** a snapshot update every 500 ms, **When** the operator orbits, **Then** no update
   causes a visible hitch.

### User Story 2 - The layout is stable and meaningful (Priority: P2)

Related objects cluster together, and adding or removing a pod does not rearrange the rest.

**Why this priority**: Positions come from fixed rings by list index today, so any change shifts
every node in the tier and the operator loses their place.

**Independent Test**: Scale a Deployment from 3 to 6 replicas while watching another namespace.

**Acceptance Scenarios**:

1. **Given** a settled layout, **When** a pod is added, **Then** only the new pod and its
   immediate neighbors move, and other nodes move less than 5% of the view width.
2. **Given** objects from one namespace, **When** the layout settles, **Then** they sit closer to
   each other than to objects of other namespaces.

### User Story 3 - I can read the graph without hovering (Priority: P3)

Names appear on nodes when there is room, and more detail appears as the operator zooms in.

**Why this priority**: There are no labels in the scene; the operator must hover every sphere to
learn what it is.

**Independent Test**: Zoom from the full view into one namespace and read labels at each level.

**Acceptance Scenarios**:

1. **Given** the full view, **When** the graph renders, **Then** Namespaces and Deployments with
   the most pods are labeled, and labels never overlap.
2. **Given** the operator zooms into a namespace, **When** the distance shrinks, **Then** Pod names
   appear.

### Edge Cases

- A snapshot arrives while the layout is still settling: the layout continues from current
  positions.
- A browser without WebGL2: the app shows a clear message instead of a blank page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Draw all nodes of one kind in a single draw call, and all links in a single draw call.
- **FR-002**: Compute layout off the main thread, starting from the previous positions.
- **FR-003**: Group layout by namespace (and by cluster when several are present).
- **FR-004**: Show labels with level-of-detail rules and collision avoidance.
- **FR-005**: Offer a 2D (top-down) mode that uses the same layout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ≥ 30 fps (target 60) while orbiting a 1,000-pod cluster on a laptop GPU.
- **SC-002**: Adding one pod moves unrelated nodes by < 5% of the view width.
- **SC-003**: At the default zoom, at least the 20 largest workloads are labeled without overlap.

## Assumptions

- 001 has shipped (ObjectKeys, one Canvas, CameraRig).
- A kind cluster with a synthetic workload is the performance reference.
