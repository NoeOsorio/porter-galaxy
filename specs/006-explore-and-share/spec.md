# Feature Specification: Explore and Share

**Feature Branch**: `006-explore-and-share`

**Created**: 2026-09-25

**Status**: Backlog

**Input**: User description: "Make it a first-class app to represent your cluster; it has a lot of
hidden potential."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zoom from galaxy to pod (Priority: P1)

The operator starts at the galaxy (clusters), zooms into a cluster (namespaces as star systems),
then a namespace (workloads), then a workload (pods), and the view changes what it shows at each
level.

**Why this priority**: Topology and Clusters are two unrelated views today; semantic zoom makes one
continuous map.

**Independent Test**: On the reference cluster, go from the full view to a single pod using only
zoom and click.

**Acceptance Scenarios**:

1. **Given** the cluster level, **When** the operator zooms into a namespace, **Then** its
   workloads expand and other namespaces collapse to labeled dots.
2. **Given** a Pod is selected, **When** the operator presses Escape, **Then** the view steps back
   one level.

### User Story 2 - Everything I need about an object in one panel (Priority: P2)

Selecting an object shows its YAML (secrets redacted), recent events, owners, dependents, and a
link to its logs or its app in Porter.

**Independent Test**: Select a Deployment and a Pod and read each tab.

**Acceptance Scenarios**:

1. **Given** a selected Pod, **When** the panel opens, **Then** it shows YAML, events, owner chain,
   and the node it runs on.

### User Story 3 - Share and replay (Priority: P3)

The operator copies a link that opens Galaxy at the same cluster, selection, and camera, and can
replay the last 30 minutes of changes.

**Independent Test**: Share a link in a new window; scrub the timeline after a rollout.

**Acceptance Scenarios**:

1. **Given** a copied link, **When** it is opened, **Then** the same object is selected and framed.
2. **Given** a rollout 10 minutes ago, **When** the operator scrubs the timeline, **Then** old Pods
   fade out and new ones appear in order.

### Edge Cases

- A shared link to an object that no longer exists opens the parent level with a notice.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: One view with semantic zoom levels: galaxy, cluster, namespace, workload, pod.
- **FR-002**: The detail panel reads object YAML and events on demand, redacting Secret data.
- **FR-003**: URL state encodes cluster, selection, zoom level, and camera.
- **FR-004**: The backend keeps a 30-minute ring buffer of changes for replay.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any Pod is reachable from the full view in 4 interactions or fewer.
- **SC-002**: A shared link restores the same selection and framing 100% of the time for objects
  that still exist.

## Assumptions

- Depends on 002 (layout and labels) and 003 (events).
