# Feature Specification: Multi-Cluster Hub

**Feature Branch**: `004-multi-cluster-hub`

**Created**: 2026-09-25

**Status**: Backlog

**Input**: User description: "It used to be a backend + frontend app that showed many clusters.
Since it became a Helm chart installed in one cluster, multi-cluster lost its point."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See all my Porter clusters again (Priority: P1)

An operator installs Galaxy once, gives it a Porter project token, and sees every cluster in the
project as its own system in the galaxy.

**Why this priority**: The backend can already read clusters from the Porter API (`REGISTRY_*`
env vars), but the chart cannot configure it and the scratch image has no CA certificates.

**Independent Test**: Install the chart with registry mode on `porter-gloom-dev` and see every
cluster of project 1.

**Acceptance Scenarios**:

1. **Given** a Secret with a Porter token and a project ID, **When** the chart is installed with
   registry mode on, **Then** every cluster in the project appears within 60 s.
2. **Given** a cluster is added to the project, **When** 5 minutes pass, **Then** it appears
   without restarting Galaxy.
3. **Given** one cluster is unreachable, **When** the others load, **Then** it shows as offline and
   the rest work.

### User Story 2 - Clusters outside Porter join through an agent (Priority: P2)

An operator installs Galaxy in `agent` mode in any cluster; it connects out to a hub and appears
there, with no inbound access to the cluster.

**Why this priority**: The in-cluster chart only sees its own cluster; the agent model keeps the
single-cluster install and adds aggregation.

**Independent Test**: Install a hub on one kind cluster and agents on two others.

**Acceptance Scenarios**:

1. **Given** a hub URL and a join token, **When** an agent starts, **Then** its cluster appears in
   the hub within 30 s.
2. **Given** the agent loses connectivity, **When** it reconnects, **Then** the hub resumes updates
   without duplicating objects.

### User Story 3 - Move between clusters (Priority: P3)

The operator sees all clusters at once, flies into one, and filters by cluster.

**Independent Test**: With 3 clusters, fly into each and back.

**Acceptance Scenarios**:

1. **Given** several clusters, **When** the operator picks one from a list, **Then** the camera
   flies to it and other clusters dim.

### Edge Cases

- Two clusters with the same name in different projects must not merge.
- A revoked token stops that cluster's updates and shows why.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chart MUST support `mode: standalone | agent | hub` and a registry mode fed from a
  Secret.
- **FR-002**: The image MUST include CA certificates; skipping TLS verification stays opt-in.
- **FR-003**: Agents MUST connect out to the hub and authenticate with a per-cluster token.
- **FR-004**: The cluster list from the registry MUST refresh periodically.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All clusters of Porter project 1 appear from a single install.
- **SC-002**: An agent-connected cluster appears in the hub within 30 s of the agent starting.

## Assumptions

- The hub's own access control comes from spec 005.
