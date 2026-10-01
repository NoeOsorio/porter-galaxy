# Tasks: Explore and Share

**Input**: Design documents from `/specs/006-explore-and-share/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/object-details.md,
contracts/url-state.md, quickstart.md

**Tests**: None. The constitution replaces test suites with `make verify` and quickstart.md on the
reference cluster.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story the task belongs to (US1, US2, US3a, US3b)

US3 in the spec ships as two slices: US3a share links, US3b replay.

---

## Phase 1: Setup

No setup: every slice builds on existing views, the stream, and the verify lane.

---

## Phase 2: User Story 1 - Focus a namespace (P1) · release 0.17.0

**Goal**: Clicking a namespace keeps it and collapses the others to labeled dots, in both views.

**Independent Test**: quickstart.md §1

- [X] T001 [US1] Make `group` labels clickable in `frontend/src/components/Labels.tsx`: add an `onGroupClick(namespace)` prop; group label elements get `pointer-events: auto` and a pointer cursor while the container stays `pointer-events: none`. Add a `namespace` field to the group candidates built in `frontend/src/lib/transformTopology.ts` and `frontend/src/lib/transformClusters.ts` so the handler needs no string parsing.
- [X] T002 [US1] Focus state in `frontend/src/Topology.tsx` and `frontend/src/Clusters.tsx`: `focus: string | null`; set it from a group label click and from a "Focus namespace" button in `frontend/src/components/DetailPanel.tsx` for any namespaced selection; frame the focused namespace's node ids with `CameraRig.frame`; Escape clears the selection first, then the focus, then reframes the whole graph.
- [X] T003 [US1] Render focus in `frontend/src/components/three/TopologyScene.tsx` and `frontend/src/components/three/ClustersScene.tsx` (research R1): nodes whose namespace is not the focused one get opacity 0 and are skipped by picking (`frontend/src/lib/picking.ts`); edges touching hidden nodes are dropped from the drawn lists; cluster-scoped nodes stay. Each unfocused namespace is drawn as one dot at the centroid of its nodes, sized by its pod count, and keeps its group label.
- [X] T004 [US1] Add a `focus` check to `hack/verify/check.mjs` and `hack/verify.sh` (3,000 pods, 500 ms churn): click a namespace label, assert labels of other namespaces' workloads are hidden and that namespace's are visible, orbit and record fps (≥ 30 at CPU ×4), press Escape twice and assert every namespace is back.
- [X] T005 [US1] README: one line on focusing a namespace and Escape in the views description in `README.md`.
- [ ] T006 [US1] `make verify`, PR, merge, `make release VERSION=0.17.0`, upgrade the add-on, walk quickstart §1.

**Checkpoint**: Focus works in both views and keeps the frame budget.

---

## Phase 3: User Story 2 - Details panel (P2) · release 0.18.0

**Goal**: Allow-listed fields, Warning events, and copyable `kubectl` commands for the selection.

**Independent Test**: quickstart.md §2

- [ ] T007 [US2] Create `backend/internal/cluster/details.go` per contracts/object-details.md: `(*Builder).Details(key)` reads the Pod, workload, or Node from the listers and copies only the listed fields (probe commands for `exec` reduced to their type); unknown kinds return a typed "unsupported" error, missing objects "not found". `MultiBuilder` routes by cluster id when the key carries one.
- [ ] T008 [US2] Route `GET /api/v1/objects?key=` in `backend/internal/api/handler.go` behind the session middleware: 200 JSON, 400 for unsupported kinds, 404 when not cached, with `Cache-Control: no-store`.
- [ ] T009 [P] [US2] Serve details from `backend/cmd/fakestream/main.go` (it reuses the handler; add a small synthetic `Details` for its generated pods and workloads so verify can exercise the panel).
- [ ] T010 [US2] Panel in `frontend/src/components/DetailPanel.tsx` and `frontend/src/lib/objectDetails.ts`: fetch details when the selection changes (abort the previous request; show a loading line; on 404 show "Not in the cluster anymore"); render containers (image, ports, requests and limits, probes), labels, node, start time, and the existing Warning events; add "Copy describe", "Copy YAML command", and for Pods "Copy logs command" (research R3), falling back to a selectable text field when the clipboard is unavailable.
- [ ] T011 [US2] Add a `details` check to `hack/verify/check.mjs`: select a pod, assert the panel shows its image and probe, assert the page text never contains a sentinel env value the fake stream puts in its pod spec, and assert `/api/v1/objects` returns 401 without a session (run with `-password`).
- [ ] T012 [US2] README: describe the panel and why it never shows full YAML, in `README.md`.
- [ ] T013 [US2] `make verify`, PR, merge, `make release VERSION=0.18.0`, upgrade the add-on, walk quickstart §2.

**Checkpoint**: The panel answers "what is this and what is wrong with it" without exposing the spec.

---

## Phase 4: User Story 3a - Share links (P3) · release 0.19.0

**Goal**: A link opens the same view, focus, selection, and camera after signing in.

**Independent Test**: quickstart.md §3

- [ ] T014 [US3a] Create `frontend/src/lib/urlState.ts` per contracts/url-state.md: parse and serialize the fragment (`v`, `d`, `ns`, `sel`, `cam`), ignoring unknown or malformed values; write with `history.replaceState`, throttled to 500 ms.
- [ ] T015 [US3a] Wire it in `frontend/src/App.tsx`, `frontend/src/Topology.tsx`, and `frontend/src/Clusters.tsx`: read `v` and `d` before the first render; apply `ns`, `sel`, and `cam` once the first snapshot arrives (fly to the selection; show "That object no longer exists" and open `ns` when `sel` is missing); keep the fragment updated as the view, focus, selection, and camera change. Expose the camera position and target from `frontend/src/components/CameraRig.tsx` for serialization and restoring.
- [ ] T016 [US3a] "Copy link" button next to "RESET VIEW" in both views, copying `location.href`.
- [ ] T017 [US3a] Add a `share` check to `hack/verify/check.mjs` (fake stream with `-password`): select a pod and focus its namespace, read `location.href`, open it in a fresh browser context, sign in, and assert the same pod is selected and its namespace focused.
- [ ] T018 [US3a] `make verify`, PR, merge, `make release VERSION=0.19.0`, upgrade the add-on, walk quickstart §3.

---

## Phase 5: User Story 3b - Replay (P3) · release 0.20.0

**Goal**: Scrub back through the changes received since the page opened, up to 30 minutes.

**Independent Test**: quickstart.md §4

- [ ] T019 [US3b] Create `frontend/src/lib/replay.ts` per research R5: base snapshot, `{at, patch}` entries, a checkpoint every 60 entries, 30-minute retention (configurable for verify through `?replayMinutes=`), reset on a new snapshot; `stateAt(t)` applies patches from the nearest earlier checkpoint with `applyPatch` from `frontend/src/lib/api.ts`.
- [ ] T020 [US3b] Feed it from `frontend/src/hooks/useClustersSSE.ts` and expose `history` and a `viewAt(t | null)` switch; while a time is set the views render that state and the stream keeps buffering.
- [ ] T021 [US3b] New `frontend/src/components/Timeline.tsx`: a scrub bar from the history start to now with tick marks where changes arrived, the time under the cursor, and a "Live" button; hidden until the history spans at least one minute; mounted from `frontend/src/App.tsx`.
- [ ] T022 [US3b] Add a `replay` check to `hack/verify/check.mjs` (3,000 pods, 500 ms churn, `?replayMinutes=2`): after 2 minutes, scrub to the start and assert a pod added later is absent and one removed later is present; press "Live" and assert the current state; record `performance.memory.usedJSHeapSize` and fail above 50 MB.
- [ ] T023 [US3b] README: replay in the views description, in `README.md`.
- [ ] T024 [US3b] `make verify`, PR, merge, `make release VERSION=0.20.0`, upgrade the add-on, walk quickstart §4 (ask the user before rolling out a workload on the reference cluster).

---

## Phase 6: Polish

- [ ] T025 `specs/README.md` status for 006 and the README Roadmap entry.

---

## Dependencies & Execution Order

- US1 → US2 → US3a → US3b → Polish, one release each.
- US3a depends on US1 (focus is part of the link) and benefits from US2 (the panel opens on `sel`).
- Within US1: T001 → T002 → T003; T004 after T003.
- Within US2: T007 → T008; T009 in parallel with T008; T010 after T008; T011 after T009 and T010.
- Within US3b: T019 → T020 → T021; T022 after T021.

## Implementation Strategy

1. US1 alone (0.17.0) makes large clusters readable with no backend change.
2. US2 adds the panel's data through one read-only endpoint; nothing secret leaves the backend.
3. US3a and US3b are frontend-only: links reuse the login, replay reuses the stream.
