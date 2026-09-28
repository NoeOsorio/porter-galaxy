---
description: "Task list for 002 Render Engine at Scale"
---

# Tasks: Render Engine at Scale

**Input**: Design documents from `/specs/002-render-engine-at-scale/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: None. Per the constitution (Principle II), verification is the build gates plus
[quickstart.md](quickstart.md) against the fake stream and the deployed add-on.

**Organization**: One phase per user story; each phase is one PR and one release.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Tools to measure scale before changing the renderer

- [ ] T001 [P] Add `backend/cmd/fakestream/main.go` per contracts/fakestream.md (flags, SSE snapshot built from `internal/cluster` types, churn, CORS, `/readyz`)
- [ ] T002 [P] Show drei `<StatsGl>` inside the Canvas when the URL has `?stats`, in `frontend/src/App.tsx`
- [ ] T003 Record a baseline: 0.5.x at 1,000 pods via quickstart "Load setup", lowest fps per view, in `specs/002-render-engine-at-scale/quickstart.md` under §1 as "Baseline"

---

## Phase 2: Foundational

**Purpose**: Positions outside React state, shared by every story

- [ ] T004 Add `frontend/src/lib/layout/layoutStore.ts` per data-model.md (keys, index, `Float32Array` positions, version, settled; `positionOf(key)`)
- [ ] T005 Seed the store from the current transforms' ring positions (temporary layout until US2) with a `useStaticLayout(graph)` hook in `frontend/src/lib/layout/useStaticLayout.ts`
- [ ] T006 Make `frontend/src/components/CameraRig.tsx` read positions through a `positionOf(key)` prop instead of `node.x/y/z`, and pass the store accessor from `Topology.tsx` and `Clusters.tsx`

**Checkpoint**: App behaves exactly like 0.5.x, but positions come from the store

---

## Phase 3: User Story 1 - Large clusters stay smooth (P1) 🎯 MVP · release 0.6.0

**Goal**: ≥ 30 fps at 1,000 pods; no hitch on snapshot updates.

**Independent Test**: quickstart.md §1

- [ ] T007 [P] [US1] Create `frontend/src/components/three/NodeInstances.tsx`: instanced billboard plane (body + glow layers) with per-instance `instanceColor`, `aRadius`, `aOpacity`, `aBlink` and a time uniform, reading positions from the store in `useFrame` (research R1)
- [ ] T008 [P] [US1] Create `frontend/src/lib/picking.ts`: project store positions with the camera and return the nearest node under the pointer within its projected radius (research R2)
- [ ] T009 [P] [US1] Create `frontend/src/components/three/EdgeSegments.tsx` on drei `<Segments>`: base links plus a wider highlight set, endpoints updated from the store in `useFrame` (research R3)
- [ ] T010 [US1] Wire pointer move / click / double-click on the canvas to `picking.ts` and feed the existing `onHover` / `onClick` / `onDoubleClick` callbacks, in a `usePicking` hook in `frontend/src/lib/picking.ts`
- [ ] T011 [US1] Rewrite `frontend/src/components/three/TopologyScene.tsx` on `NodeInstances` + `EdgeSegments` + `usePicking`; keep flow particles (5 sprites) reading positions from the store; rebuild attributes only when keys change, patch colors/opacity in place otherwise (research R4)
- [ ] T012 [US1] Rewrite `frontend/src/components/three/ClustersScene.tsx` the same way, keeping family highlighting through `aOpacity` and the highlight `Segments`
- [ ] T013 [US1] Delete `frontend/src/components/three/NodeDisc.tsx` and any now-unused helpers in `frontend/src/lib/discTextures.ts`
- [ ] T014 [US1] Walk quickstart §1 steps 1–4 against the fake stream and record fps values in the PR description
- [ ] T015 [US1] Run the gates, open PR `002-render-engine-at-scale-us1`, merge, `make release VERSION=0.6.0`, upgrade the Porter add-on, and walk quickstart §1 step 5

**Checkpoint**: SC-001 met at 1,000 pods

---

## Phase 4: User Story 2 - The layout is stable and meaningful (P2) · release 0.7.0

**Goal**: Namespaces group together; adding a pod does not move unrelated nodes.

**Independent Test**: quickstart.md §2

- [ ] T016 [US2] `npm install d3-force-3d` in `frontend/` and add minimal types in `frontend/src/types/d3-force-3d.d.ts` for the functions used
- [ ] T017 [US2] Implement `frontend/src/lib/layout/layout.worker.ts` per contracts/layout-worker.md: link, many-body, namespace anchor (golden-angle spiral by namespace hash), Topology tier `forceY`, Clusters cluster anchors, collide; warm start and seeding from `parent` (research R5)
- [ ] T018 [US2] Implement `frontend/src/lib/layout/useForceLayout.ts`: one worker per mounted view, posts `update` on key/link changes, applies `positions` messages to the store, `stop` on unmount
- [ ] T019 [US2] Replace ring positions in `frontend/src/lib/transformTopology.ts` and `frontend/src/lib/transformClusters.ts` with layout hints (`group`, `cluster`, `tier`, `radius`, `parent`) and link strengths per data-model.md
- [ ] T020 [US2] Switch `Topology.tsx` and `Clusters.tsx` from `useStaticLayout` to `useForceLayout`; delete `frontend/src/lib/layout/useStaticLayout.ts`
- [ ] T021 [US2] Make `CameraRig` frame after the first `settled` (not on first positions) so the initial framing matches the settled layout, in `frontend/src/components/CameraRig.tsx`
- [ ] T022 [US2] With `?stats`, log `max unrelated displacement` (largest move of a node not added and not a direct neighbor of an added/removed node, as % of view width) after each update settles, in `frontend/src/lib/layout/useForceLayout.ts`
- [ ] T023 [US2] Walk quickstart §2 steps 1–4 against the fake stream; record settle time and displacement in the PR
- [ ] T024 [US2] Run the gates, open PR `002-render-engine-at-scale-us2`, merge, `make release VERSION=0.7.0`, upgrade the add-on, and walk quickstart §2 step 5

**Checkpoint**: SC-002 met; namespaces keep their places across reloads

---

## Phase 5: User Story 3 - I can read the graph without hovering (P3) · release 0.8.0

**Goal**: Labels with level of detail and no overlaps; a locked 2D mode.

**Independent Test**: quickstart.md §3

- [ ] T025 [US3] Create `frontend/src/components/Labels.tsx`: pool of ≤ 60 DOM labels, per-frame projection from the store, ranked candidates (namespace centroids, Deployments by pod count, others, Pods within a distance threshold), greedy screen-space collision (research R7)
- [ ] T026 [US3] Provide label candidates from `Topology.tsx` and `Clusters.tsx` (namespace groups computed from layout hints) and mount `Labels` in each view's overlay
- [ ] T027 [US3] Add a 2D toggle next to the view switch in `frontend/src/App.tsx` and a `mode: "3d" | "2d"` prop on `CameraRig` that locks rotation and aligns to the view's plane (Topology front, Clusters top) (research R8)
- [ ] T028 [US3] Show "Galaxy needs WebGL2" instead of the Canvas when WebGL2 is unavailable, in `frontend/src/App.tsx` (research R10)
- [ ] T029 [US3] Walk quickstart §3 steps 1–4 against the fake stream
- [ ] T030 [US3] Run the gates, open PR `002-render-engine-at-scale-us3`, merge, `make release VERSION=0.8.0`, upgrade the add-on, and check labels on the real cluster

**Checkpoint**: SC-003 met

---

## Phase 6: Polish

- [ ] T031 [P] Update README (Why, Architecture, Roadmap) and `specs/README.md` status for 002
- [ ] T032 Document `fakestream` and `?stats` in the README's Local development section

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T006) → US1 → US2 → US3 → Polish.
- US1 renders from the store with static ring positions, so it ships before the force layout.
- US2 depends on US1's store-driven rendering: the worker only updates the store.
- US3 depends on US2 for namespace groups and settled positions to label.
- Within US1: T007, T008, T009 in parallel; T010 needs T008; T011 and T012 need T007, T009, T010.

## Parallel Opportunities

- T001 and T002.
- T007, T008, T009.
- T025 and T027/T028 touch different files.

## Implementation Strategy

1. Measure first (T001–T003) so every slice reports numbers against the same baseline.
2. US1 alone (0.6.0) removes the per-object cost, the biggest win at scale.
3. US2 (0.7.0) makes the layout meaningful and stable; US3 (0.8.0) makes it readable.
