# Implementation Plan: Truthful Graph and Usable Camera

**Branch**: `001-truthful-graph-and-camera` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-truthful-graph-and-camera/spec.md`

## Summary

Make what Galaxy draws match the cluster, make the app shell stable and fast to load, and give the
camera framing and fly-to. The backend gains ReplicaSet ownership, namespaced object keys, and a
readiness endpoint gated on cache sync. The frontend moves to one shared `<Canvas>` and one live
stream, drops the four unused views, keys every object by the new identity, and replaces the
hand-rolled `requestAnimationFrame` camera code with drei's `CameraControls`. nginx starts
compressing static assets. Each user story ships as its own PR and release.

## Technical Context

**Language/Version**: Go 1.22 (backend); TypeScript 5 + React 19 (frontend)

**Primary Dependencies**: client-go informers; Three.js via @react-three/fiber and @react-three/drei
(already installed); Vite; nginx

**Storage**: N/A (in-memory informer cache)

**Testing**: None by constitution (Principle II). Gates: `go build ./... && go vet ./...`,
`npm run build && npm run lint`, `helm lint charts/porter-galaxy`, and [quickstart.md](quickstart.md)
on the deployed add-on.

**Target Platform**: Linux containers on Kubernetes (amd64); desktop Chrome, Firefox, Safari

**Project Type**: Web application (Go backend + React SPA) shipped as a Helm chart

**Performance Goals**: First graph within 2 s on a warm cache; ≤ 50% of today's 1.37 MB JS

**Constraints**: Read-only RBAC; the live stream keeps sending full snapshots (diffs are spec 003)

**Scale/Scope**: Reference cluster ≈ 6 nodes, 21 Deployments, 71 Pods; correctness must hold at any
size, performance at scale is spec 002

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Thin Vertical Slices | Pass | US1, US2, US3 ship as separate PRs and releases (0.3.0, 0.4.0, 0.5.0) |
| II. Verify on a Real Cluster | Pass | No test tasks; each story has quickstart steps on `porter-gloom-dev` |
| III. Truthful Data First | Pass | US1 is P1 and goes first |
| IV. Performance Budget | Pass | Removes per-view canvases and dead code; no per-object additions |
| V. Delete Before Adding | Pass | Deletes 4 views and their helpers; no new runtime dependency |
| VI. Read-Only by Default | Pass | Adds `replicasets` get/list/watch only |

Post-design re-check: still all pass; the ReplicaSet informer is the only new watch and is trimmed
to owner references (see [research.md](research.md) R2).

## Project Structure

### Documentation (this feature)

```text
specs/001-truthful-graph-and-camera/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── snapshot.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── cmd/server/main.go               # readiness wiring
└── internal/
    ├── api/handler.go               # GET /readyz
    ├── cluster/builder.go           # ownership, keys, states, LB labels
    ├── cluster/types.go             # snapshot contract
    ├── informers/manager.go         # ReplicaSet informer, synced flag
    └── store/store.go               # ReplicaSet lister
frontend/
├── nginx.conf.template              # gzip
└── src/
    ├── App.tsx                      # single Canvas + stream, view switch
    ├── hooks/useClustersSSE.ts      # one stream, connection state
    ├── lib/objectKey.ts             # new: key + state helpers
    ├── lib/transformTopology.ts
    ├── lib/transformClusters.ts
    ├── components/three/TopologyScene.tsx
    ├── components/three/ClustersScene.tsx
    ├── components/CameraRig.tsx     # new: framing + fly-to
    ├── Topology.tsx
    └── Clusters.tsx
charts/porter-galaxy/templates/
├── backend-deployment.yaml          # readinessProbe → /readyz
└── clusterrole.yaml                 # + replicasets
```

**Structure Decision**: Keep the existing web-app layout. Two small new frontend files
(`objectKey.ts`, `CameraRig.tsx`) hold logic that both views share today in duplicated form.

## Delivery Slices

| Slice | Stories | Release | Rollout check |
| --- | --- | --- | --- |
| 1 | US1 Truthful graph | 0.3.0 | Quickstart §1 |
| 2 | US2 Stable shell | 0.4.0 | Quickstart §2 |
| 3 | US3 Camera | 0.5.0 | Quickstart §3 |

## Complexity Tracking

No violations.
