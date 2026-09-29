---
description: "Task list for 003 Workload Coverage and Health"
---

# Tasks: Workload Coverage and Health

**Input**: Design documents from `/specs/003-workload-coverage-and-health/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/stream.md, quickstart.md

**Tests**: None (constitution Principle II). Verification is `make verify` plus
[quickstart.md](quickstart.md) on the Porter add-on.

**Organization**: One phase per slice; each phase is one PR and one release.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, or STREAM for the patch slice

---

## Phase 1: Foundational

**Purpose**: Read from informer listers so adding kinds is cheap

- [X] T001 Replace per-kind handlers in `backend/internal/informers/manager.go` with one change handler that only calls `notify`, and expose the factory's listers (nodes, pods, services, ingresses, endpointslices, deployments, replicasets) through a `Listers` struct
- [X] T002 Switch `backend/internal/cluster/builder.go` to read through `Listers`, wire it in `backend/cmd/server/main.go`, and delete `backend/internal/store/`
- [X] T003 Run `make verify` and walk spec 001 quickstart §1 counts against the real cluster to confirm no behavior change (verified by diffing the lister-based snapshot against the deployed 0.8.0 on the same cluster: every list identical; `make verify` runs with the US1 slice)

**Checkpoint**: Same snapshot as 0.8.0, ~400 fewer lines of backend code

---

## Phase 2: User Story 1 - Every workload kind is on the map (P1) 🎯 MVP · release 0.9.0

**Goal**: Every Pod shows its real owner; StatefulSets, DaemonSets, Jobs, CronJobs appear.

**Independent Test**: quickstart.md §1

- [X] T004 [US1] Add informers and listers for StatefulSets, DaemonSets, Jobs (trimmed to owner references), CronJobs, PVCs, HPAs (`autoscaling/v2`), NetworkPolicies, and Namespaces in `backend/internal/informers/manager.go`
- [X] T005 [P] [US1] Add get/list/watch for those kinds to `charts/porter-galaxy/templates/clusterrole.yaml` (no Secrets, no ConfigMaps)
- [X] T006 [US1] Replace `deployments` with `workloads` and add `pvcs`, `hpas`, `networkPolicies`, `namespaces`, and Pod `refs` to `backend/internal/cluster/types.go` per data-model.md
- [X] T007 [US1] Build workloads for all kinds with per-kind state (research R2), resolve Pod → Job → CronJob ownership, emit refs from Pod specs, HPA targets, and the Pods each NetworkPolicy selects, in `backend/internal/cluster/builder.go`
- [X] T008 [P] [US1] Emit a mix of workload kinds (StatefulSets, DaemonSets, a CronJob with Jobs) in `backend/cmd/fakestream/main.go`
- [X] T009 [US1] Mirror the contract in `frontend/src/types/api.ts`; rename the `deployment` node type to `workload` with `kind`, icon and color per kind in `frontend/src/types/*.ts`, `frontend/src/lib/objectKey.ts`
- [X] T010 [US1] Topology: Service → Workload → Pod for any kind in `frontend/src/lib/transformTopology.ts`; Clusters: CronJob → Job → Pod and every workload kind in `frontend/src/lib/transformClusters.ts`; label candidates rank workloads of every kind
- [X] T011 [US1] Extract the detail panel into `frontend/src/components/DetailPanel.tsx`, used by both views, showing kind, owner chain, HPA, policies, and references
- [X] T012 [US1] Draw a selected object's references (PVC, ConfigMap, Secret nodes and links) only while it is selected, in both scenes
- [X] T013 [US1] Update legends and type filters in `frontend/src/Topology.tsx` and `frontend/src/Clusters.tsx` for workload kinds
- [X] T014 [US1] `make verify`, PR, merge, `make release VERSION=0.9.0`, upgrade the add-on, walk quickstart §1 (0.9.0 on the reference cluster: 42 DaemonSet, 28 Deployment, 3 StatefulSet pods, all under their workload; a Porter cron job app showed CronJob → 2 Jobs → Pods)

---

## Phase 3: Stream patches (FR-004) · release 0.10.0

**Goal**: One snapshot per connection, then object-level patches, gzip-encoded.

**Independent Test**: quickstart.md §2

- [X] T015 [STREAM] Compute patches between consecutive snapshots by object key in `backend/internal/api/patch.go` (new) per contracts/stream.md
- [X] T016 [STREAM] Hub keeps the last broadcast snapshot and version; subscribe and send that snapshot under one lock; on a dropped frame, send the client a full snapshot next, in `backend/internal/api/hub.go` and `handler.go`
- [X] T017 [STREAM] Gzip the stream with a flush after every event when the client accepts gzip, in `backend/internal/api/handler.go`
- [X] T018 [P] [STREAM] Make `backend/cmd/fakestream` stream snapshot + patches through the same encoder
- [X] T019 [STREAM] Apply `snapshot` and `patch` events in `frontend/src/hooks/useClustersSSE.ts`, reconnecting on a base mismatch; with `?stats`, log bytes received per minute
- [X] T020 [STREAM] Add a `stream` scenario to `hack/verify/check.mjs` (patch applies, reconnect resyncs) and record bytes/minute for full vs patch in the PR
- [X] T021 [STREAM] `make verify`, PR, merge, `make release VERSION=0.10.0`, upgrade, walk quickstart §2 (0.10.0 on the reference cluster, 180 s each: 0.9.0 sent 503,740 bytes for 14 changes; 0.10.0 sent 70,505 decoded, −86%, and 6,441 on the wire with gzip, −98.7%, for 54 changes; after a backend restart the client resynced to matching counts)

---

## Phase 4: User Story 2 - I see what is unhealthy at a glance (P2) · release 0.11.0

**Goal**: Restarts, last termination, and Warning events visible; restarting Pods pulse.

**Independent Test**: quickstart.md §3

- [X] T022 [US2] Add a Warning-events informer (separate factory, field selector `type=Warning`) and a bounded index (≤ 10 per object, ≤ 1 h) in `backend/internal/informers/events.go`
- [X] T023 [US2] Emit `restarts`, `lastTermination`, `recentRestart`, and `warnings` on Pods, workloads, and nodes in `backend/internal/cluster/builder.go`; add `events` get/list/watch to the ClusterRole
- [X] T024 [P] [US2] Emit crash-looping Pods with warnings from `backend/cmd/fakestream`
- [X] T025 [US2] Add an `aPulse` attribute to `frontend/src/components/three/NodeInstances.tsx` and set it for `recentRestart` in both scenes
- [X] T026 [US2] Show restarts, last termination, and the latest warnings (age, reason, count) in `frontend/src/components/DetailPanel.tsx`
- [ ] T027 [US2] `make verify`, PR, merge, `make release VERSION=0.11.0`, upgrade, walk quickstart §3

---

## Phase 5: User Story 3 - Size and brightness show load (P3) · release 0.12.0

**Goal**: Usage relative to requests drives size and glow when metrics are available.

**Independent Test**: quickstart.md §4

- [ ] T028 [US3] Poll pod and node metrics every 15 s via the REST client, detect absence via discovery, in `backend/internal/metrics/poller.go`; add `metrics.k8s.io` get/list to the ClusterRole
- [ ] T029 [US3] Emit `requests`, `usage`, and `metricsAvailable` in `backend/internal/cluster/builder.go`; notify on each poll that changes usage
- [ ] T030 [P] [US3] Emit synthetic usage from `backend/cmd/fakestream`
- [ ] T031 [US3] Scale radius (≤ 1.6×) and glow (≤ 2×) by usage / request in both scenes; show usage in `DetailPanel`
- [ ] T032 [US3] Legend hint when `metricsAvailable` is false, in both views
- [ ] T033 [US3] `make verify`, PR, merge, `make release VERSION=0.12.0`, upgrade, walk quickstart §4

---

## Phase 6: Polish

- [ ] T034 [P] README (Why, Architecture, Configuration, Roadmap) and `specs/README.md` status for 003
- [ ] T035 Update spec 001's snapshot contract doc to point to `contracts/stream.md`

---

## Dependencies & Execution Order

- Phase 1 → US1 → Stream → US2 → US3 → Polish.
- US1 changes the contract shape; the stream slice then only changes transport.
- US2 and US3 add fields that ride on patches, so they come after the stream slice.
- Within US1: T004 → T006 → T007; T005 and T008 in parallel; frontend T009–T013 after T006.

## Implementation Strategy

1. Phase 1 alone is a pure refactor (no release); it makes every later task smaller.
2. Ship US1 (0.9.0) first: it closes SC-001 and is the most visible change.
3. Patches before health and metrics, because those add frequently changing fields.
