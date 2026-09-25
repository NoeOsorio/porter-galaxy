# Feature Specification: Workload Coverage and Health

**Feature Branch**: `003-workload-coverage-and-health`

**Created**: 2026-09-25

**Status**: Backlog

**Input**: User description: "Make it a first-class app to represent your cluster."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every workload kind is on the map (Priority: P1)

StatefulSets, DaemonSets, Jobs, and CronJobs appear with their Pods, and Namespaces are visible as
groups.

**Why this priority**: Only Deployments, Services, Ingresses, and Pods are modeled; databases,
agents, and batch work are invisible or appear as standalone pods.

**Independent Test**: Install a chart with a StatefulSet and a CronJob and find both in each view.

**Acceptance Scenarios**:

1. **Given** a StatefulSet with 3 replicas, **When** the graph loads, **Then** it appears with 3
   owned Pods.
2. **Given** a CronJob that ran twice, **When** the graph loads, **Then** it appears with its Jobs
   and their completed Pods.

### User Story 2 - I see what is unhealthy at a glance (Priority: P2)

Restarting, crash-looping, or OOM-killed Pods and not-ready nodes stand out, and recent Warning
events are one click away.

**Why this priority**: State today is only phase-based; restarts and events are not captured.

**Independent Test**: Deploy a Pod that crash-loops and one that is OOM-killed.

**Acceptance Scenarios**:

1. **Given** a Pod with restarts in the last 10 minutes, **When** it is drawn, **Then** it pulses and
   its detail panel shows the restart count and last reason.
2. **Given** Warning events for an object, **When** it is selected, **Then** the panel lists the
   latest 10 with age and reason.

### User Story 3 - Size and brightness show load (Priority: P3)

When metrics-server is installed, CPU and memory usage drive node size or brightness.

**Why this priority**: The `metrics` field is an empty placeholder today.

**Independent Test**: Run a CPU-heavy Pod on a cluster with metrics-server.

**Acceptance Scenarios**:

1. **Given** metrics-server is available, **When** a Pod uses 90% of its CPU request, **Then** it is
   drawn visibly larger or brighter than idle Pods.
2. **Given** metrics-server is absent, **When** the app loads, **Then** usage encoding is off and a
   hint explains how to enable it.

### Edge Cases

- PVCs, ConfigMaps, and Secrets mounted by many Pods must not turn the graph into a hairball: they
  are hidden by default and shown on selection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Model StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Namespaces, HPAs, PVCs,
  ConfigMap and Secret references, and NetworkPolicies, each with read-only RBAC.
- **FR-002**: Capture restart counts, last termination reason, and Warning events per object.
- **FR-003**: Read CPU and memory usage from the metrics API when present.
- **FR-004**: Send snapshot changes as diffs after the first full snapshot, compressed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Pods on the reference cluster have a visible owner or are marked standalone.
- **SC-002**: A crash-looping Pod is visible as unhealthy within 5 s of its restart.
- **SC-003**: Steady-state stream traffic on the reference cluster drops by 80% versus full
  snapshots.

## Assumptions

- metrics-server is optional; Prometheus integration is out of scope.
