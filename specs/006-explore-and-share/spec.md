# Feature Specification: Explore and Share

**Feature Branch**: `006-explore-and-share`

**Created**: 2026-09-25

**Status**: Backlog

**Input**: User description: "Make it a first-class app to represent your cluster; it has a lot of
hidden potential."

## Clarifications

### Session 2026-10-01

- Q: With PR #44's layered and radial layouts, how should zooming from the cluster down to a pod work? → A: Keep Topology and Clusters; clicking a namespace expands it and collapses the others to labeled dots; Escape steps back one level.
- Q: How much of an object's YAML should the detail panel show? → A: None. Only an allow-list of fields, plus events and copyable `kubectl` commands; full YAML stays in the user's terminal under their own RBAC.
- Q: What happens when someone opens a shared link without being signed in? → A: The login shows, then the linked view opens; a link carries view state only and never grants access.
- Q: How far back does replay go? → A: Browser-only: the changes received since the page opened, up to 30 minutes; no backend history.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Focus a namespace (Priority: P1)

In either view, the operator clicks a namespace: it expands to show its workloads and pods while
every other namespace collapses to a labeled dot. Escape steps back to the whole cluster.

**Why this priority**: The layered (Topology) and radial (Clusters) layouts from PR #44 already
group objects by namespace, but on a large cluster everything is drawn at once.

**Independent Test**: On the reference cluster, go from the full view to a single pod using only
zoom and click.

**Acceptance Scenarios**:

1. **Given** the whole cluster, **When** the operator clicks a namespace, **Then** its workloads
   and pods expand and other namespaces collapse to labeled dots, in both views.
2. **Given** a focused namespace, **When** the operator presses Escape, **Then** every namespace
   expands again and the camera frames the cluster.

### User Story 2 - Everything I need about an object in one panel (Priority: P2)

Selecting an object shows an allow-listed set of fields, its recent events, its owner chain and
dependents, and buttons that copy the `kubectl` commands to go further (`describe`, `get -o yaml`,
`logs`) in the operator's own terminal.

**Why this priority**: The panel answers "what is wrong with this?" without leaving the map. It
never shows full YAML: Galaxy reads with a cluster-wide service account behind one shared login, so
raw YAML would show signed-in users what their own RBAC may not, and credentials hide in `env`
values, `args`, and annotations.

**Independent Test**: Select a Deployment and a Pod, read each section, and paste a copied command
into a terminal.

**Acceptance Scenarios**:

1. **Given** a selected Pod, **When** the panel opens, **Then** it shows image, ports, requests and
   limits, probes, labels, node, restarts, events, and its owner chain.
2. **Given** a selected Pod, **When** the operator clicks "Copy logs command", **Then** the
   clipboard holds `kubectl logs -n <namespace> <pod>`.

### User Story 3 - Share and replay (Priority: P3)

The operator copies a link that opens Galaxy at the same view, focused namespace, selection, and
camera. The link carries only that state; whoever opens it signs in first. The operator can also
replay the changes received since the page opened, up to the last 30 minutes.

**Independent Test**: Share a link in a new window; scrub the timeline after a rollout.

**Acceptance Scenarios**:

1. **Given** a copied link, **When** a signed-in user opens it, **Then** the same object is
   selected and framed.
2. **Given** a copied link, **When** someone who is not signed in opens it, **Then** they see the
   login, and after signing in the linked view opens.
3. **Given** the page has been open during a rollout 10 minutes ago, **When** the operator scrubs
   the timeline, **Then** old Pods fade out and new ones appear in order.

### Edge Cases

- A shared link to an object that no longer exists opens the parent level with a notice.
- Replay cannot reach before the page opened or before the last resync from a fresh snapshot; the
  timeline starts there.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Both views support focusing one namespace (others collapse to labeled dots) and
  stepping back with Escape; Topology and Clusters stay separate views.
- **FR-002**: The detail panel shows only allow-listed fields (image, ports, requests and limits,
  probes, labels, node, restarts) and events; it never shows full YAML, `env` values, `command`,
  `args`, or annotations, and offers copyable `kubectl describe`, `get -o yaml`, and `logs` commands.
- **FR-003**: URL state encodes view, focused namespace, selection, and camera, never credentials
  or tokens; the login keeps that state and restores it after signing in.
- **FR-004**: The browser keeps the stream's snapshot and patches from the last 30 minutes for
  replay; the backend keeps no history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any Pod is reachable from the full view in 4 interactions or fewer.
- **SC-002**: A shared link restores the same selection and framing 100% of the time for objects
  that still exist.

## Assumptions

- Depends on 002 (labels), 003 (events), 005 (sign-in), and the layered and radial layouts from
  PR #44 (namespace blocks and arcs to focus).
- Galaxy stays read-only and independent of Porter: no links into the Porter dashboard, no actions
  that change the cluster.
