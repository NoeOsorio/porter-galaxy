# Implementation Plan: Workload Coverage and Health

**Branch**: `003-workload-coverage-and-health` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-workload-coverage-and-health/spec.md`

## Summary

Model every common workload kind, show health signals, and stream changes as compressed patches.
The backend stops copying objects into a hand-written store: the builder reads the informers'
own listers and one generic handler signals changes, which is what makes adding eight kinds
cheap. Deployments become one case of a general **workload** (Deployment, StatefulSet,
DaemonSet, Job, CronJob) resolved through owner references. Pods gain restarts, last
termination reason, and recent Warning events; metrics come from the metrics API when present.
The stream sends one full snapshot per connection and then object-level patches, gzip-encoded by
the backend.

## Technical Context

**Language/Version**: Go 1.22 (backend); TypeScript 5 + React 19 (frontend)

**Primary Dependencies**: client-go informers and REST client (no new Go modules; the metrics
API is read with the REST client); existing frontend stack

**Storage**: N/A (informer caches plus a bounded in-memory event index)

**Testing**: None by constitution. Gates and `make verify`, plus [quickstart.md](quickstart.md)
on the real cluster (which has StatefulSets, DaemonSets, and metrics-server).

**Target Platform**: Kubernetes 1.27+; desktop browsers with WebGL2

**Project Type**: Web application shipped as a Helm chart

**Performance Goals**: Steady-state stream bytes ≥ 80% lower than full snapshots (SC-003);
a crash-looping Pod shows as unhealthy within 5 s (SC-002)

**Constraints**: Read-only RBAC and no access to Secret or ConfigMap contents (references are
read from Pod specs); event memory bounded; metrics polled, never watched

**Scale/Scope**: Reference cluster ~70 Pods across ~12 namespaces; fake stream up to 3,000 Pods

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Thin Vertical Slices | Pass | US1 → 0.9.0, stream patches → 0.10.0, US2 → 0.11.0, US3 → 0.12.0 |
| II. Verify on a Real Cluster | Pass | No test tasks; quickstart on the Porter add-on plus `make verify` |
| III. Truthful Data First | Pass | SC-001 (every Pod has a visible owner) is the first slice |
| IV. Performance Budget | Pass | Patches reduce stream work; `make verify` perf scenario guards the render budget |
| V. Delete Before Adding | Pass | The per-kind store and handlers are deleted in favor of listers + one handler; no new dependencies |
| VI. Read-Only by Default | Pass | New RBAC is get/list/watch only; Secrets and ConfigMaps are never read (names come from Pod specs); metrics are read-only |

Post-design re-check: passes. The contract change (workloads replace deployments; patch events)
ships backend and frontend in the same chart release, as in spec 001.

## Project Structure

### Documentation (this feature)

```text
specs/003-workload-coverage-and-health/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── stream.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── cmd/server/main.go               # wires listers, events factory, metrics poller
├── cmd/fakestream/main.go           # emits workloads, health, and patches
└── internal/
    ├── informers/manager.go         # informers for all kinds, one change handler, listers
    ├── informers/events.go          # new: Warning events index (bounded)
    ├── metrics/poller.go            # new: metrics.k8s.io poller via REST client
    ├── store/                       # deleted
    ├── cluster/builder.go           # workloads, owners, health, refs, HPAs, policies
    ├── cluster/types.go             # snapshot contract
    └── api/                         # patch encoding, gzip, resync on drop
charts/porter-galaxy/templates/clusterrole.yaml
frontend/src/
├── types/api.ts
├── hooks/useClustersSSE.ts          # applies patches
├── lib/transformTopology.ts         # workload nodes of every kind
├── lib/transformClusters.ts
├── components/three/*Scene.tsx      # pulse for recent restarts, usage encoding
├── components/DetailPanel.tsx       # new: shared detail panel (health, events, refs)
└── Topology.tsx / Clusters.tsx
```

**Structure Decision**: Keep the layout; add `internal/metrics` and a shared `DetailPanel`
because both views grow the same health and event sections.

## Delivery Slices

| Slice | Content | Release | Rollout check |
| --- | --- | --- | --- |
| 1 | US1 every workload kind (+ lister refactor) | 0.9.0 | Quickstart §1 |
| 2 | Stream patches + gzip (FR-004) | 0.10.0 | Quickstart §2 |
| 3 | US2 health signals and events | 0.11.0 | Quickstart §3 |
| 4 | US3 metrics-driven size and brightness | 0.12.0 | Quickstart §4 |

## Complexity Tracking

No violations.
