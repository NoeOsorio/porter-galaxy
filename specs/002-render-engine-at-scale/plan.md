# Implementation Plan: Render Engine at Scale

**Branch**: `002-render-engine-at-scale` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-render-engine-at-scale/spec.md`

## Summary

Replace per-object React meshes with GPU instancing, move layout into a Web Worker running a
warm-started 3D force simulation grouped by namespace, and add readable labels with
level-of-detail plus a locked 2D mode. Nodes become one instanced billboard mesh (plus one for
glows), links one `Segments` draw call, and picking moves to a screen-space nearest-node search.
Positions leave React state and live in a mutable layout store the scenes read every frame, so a
snapshot update never re-renders the scene tree. A small Go tool streams synthetic snapshots so
1,000+ pod clusters can be measured without a real cluster that size.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (frontend); Go 1.22 (fake stream tool)

**Primary Dependencies**: Three.js via @react-three/fiber and @react-three/drei (`Segments`,
`StatsGl`, `CameraControls`, already installed); **new**: `d3-force-3d` (layout in a worker)

**Storage**: N/A

**Testing**: None by constitution (Principle II). Gates: `npm run build && npm run lint`,
`go build ./... && go vet ./...`, `helm lint charts/porter-galaxy`, and [quickstart.md](quickstart.md)
against the fake stream (scale) and the Porter add-on (correctness).

**Target Platform**: Desktop Chrome, Firefox, Safari with WebGL2

**Project Type**: Web application (Go backend + React SPA) shipped as a Helm chart

**Performance Goals**: ≥ 30 fps (target 60) orbiting 1,000 pods / 1,500 links on a laptop GPU;
no frame over 50 ms when a snapshot arrives every 500 ms; layout of 1,000 nodes settles in < 3 s

**Constraints**: Main thread does no layout work; ≤ 4 draw calls for nodes and links combined;
labels ≤ 60 DOM elements

**Scale/Scope**: Reference loads 1,000 and 3,000 pods from the fake stream; the real reference
cluster (~80 pods) for correctness

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Thin Vertical Slices | Pass | US1 → 0.6.0, US2 → 0.7.0, US3 → 0.8.0, each deployable alone |
| II. Verify on a Real Cluster | Pass | No test tasks. The fake stream is a load generator for quickstart measurements, not a test suite; each slice is also walked on the Porter add-on |
| III. Truthful Data First | Pass | No data model change; layout and rendering only |
| IV. Performance Budget | Pass | This spec implements the budget; SC-001 is measured in quickstart §1 |
| V. Delete Before Adding | Pass with one addition | Deletes `NodeDisc.tsx`, per-edge meshes, and ring layouts in both transforms. Adds `d3-force-3d`: the stack has no force simulation, and writing a Barnes-Hut 3D simulation by hand is more code than the dependency (see research R5) |
| VI. Read-Only by Default | Pass | Fake stream is a local dev binary; it is not in the chart or images |

Post-design re-check: still passes; the worker contract and layout store add no backend or RBAC
change.

## Project Structure

### Documentation (this feature)

```text
specs/002-render-engine-at-scale/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── layout-worker.md
│   └── fakestream.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
└── cmd/fakestream/main.go             # new: synthetic SSE snapshots for load
frontend/src/
├── App.tsx                            # 2D toggle, WebGL2 check, ?stats overlay
├── Topology.tsx / Clusters.tsx        # read positions from the layout store
├── components/
│   ├── CameraRig.tsx                  # positions via store; 2D lock mode
│   ├── Labels.tsx                     # new: DOM label overlay with LOD + collision
│   └── three/
│       ├── NodeInstances.tsx          # new: instanced billboards (+ glow layer)
│       ├── EdgeSegments.tsx           # new: drei Segments, base + highlight
│       ├── TopologyScene.tsx          # rewritten on the two above
│       └── ClustersScene.tsx          # rewritten on the two above
├── lib/
│   ├── picking.ts                     # new: screen-space nearest-node picking
│   ├── layout/
│   │   ├── layout.worker.ts           # new: d3-force-3d simulation
│   │   ├── layoutStore.ts             # new: key → index, Float32Array positions
│   │   └── useForceLayout.ts          # new: worker lifecycle per view
│   ├── transformTopology.ts           # drops ring positions; emits layout hints
│   └── transformClusters.ts           # drops ring positions; emits layout hints
└── types/d3-force-3d.d.ts             # new: minimal types for the dependency
```

**Structure Decision**: Keep the web-app layout. Rendering primitives live in
`components/three/`, layout in `lib/layout/`, so the two views share both.

## Delivery Slices

| Slice | Story | Release | Rollout check |
| --- | --- | --- | --- |
| 1 | US1 Large clusters stay smooth | 0.6.0 | Quickstart §1 |
| 2 | US2 Stable, meaningful layout | 0.7.0 | Quickstart §2 |
| 3 | US3 Labels and 2D mode | 0.8.0 | Quickstart §3 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| New dependency `d3-force-3d` | 3D Barnes-Hut force simulation with warm start, running in a worker | Hand-written O(n²) forces miss the 1,000-node budget; a Barnes-Hut octree by hand is several hundred lines to maintain |
