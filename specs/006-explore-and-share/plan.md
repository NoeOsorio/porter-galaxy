# Implementation Plan: Explore and Share

**Branch**: `006-explore-and-share` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-explore-and-share/spec.md`

## Summary

Four thin slices on top of the layouts from PR #44 and the sign-in from spec 005. Focusing a
namespace is a render-level change: the layout keeps every target, nodes outside the focused
namespace are hidden, each of those namespaces is drawn as one dot at its center, and the camera
frames the focused one. The detail panel gets allow-listed fields from a new read-only endpoint that
serves them from the informer caches on demand, so the stream does not grow. Shared links put the
view state in the URL fragment; the login already renders at the same URL, so the state survives
signing in. Replay keeps the stream's snapshot and patches in the browser with periodic checkpoints.

## Technical Context

**Language/Version**: Go 1.22 (backend); TypeScript 5 + React 19 + Three.js (R3F) (frontend)

**Primary Dependencies**: None new. client-go listers already cache full Pods and workloads

**Storage**: N/A. Replay history lives in the browser tab's memory

**Testing**: None by constitution. Gates and `make verify` (new `focus`, `details`, `share`, and
`replay` checks), plus [quickstart.md](quickstart.md) on the reference cluster

**Target Platform**: Desktop browsers with WebGL2; Kubernetes 1.27+

**Project Type**: Web application shipped as a Helm chart

**Performance Goals**: Focus and unfocus keep the spec 002 budget (≥ 30 fps at 3,000 pods, CPU ×4);
details answer in < 200 ms; 30 minutes of replay history stays under 50 MB of tab memory at
3,000 pods with 500 ms churn

**Constraints**: Read-only; no full YAML, `env` values, `command`, `args`, or annotations leave the
backend (spec FR-002); no credentials in URLs; Galaxy stays independent of Porter

**Scale/Scope**: Reference cluster ~100 pods; fake stream up to 3,000 pods

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Thin Vertical Slices | Pass | Focus → 0.17.0, details → 0.18.0, share links → 0.19.0, replay → 0.20.0 |
| II. Verify on a Real Cluster | Pass | No test tasks; verify scenarios plus quickstart on the Porter add-on |
| III. Truthful Data First | Pass | Details read the same caches as the snapshot; replay replays real patches |
| IV. Performance Budget | Pass | Focus changes attributes only (no relayout); details are on demand; replay memory is bounded and measured |
| V. Delete Before Adding | Pass | No new dependencies; inline YAML and backend history were dropped in clarification |
| VI. Read-Only by Default | Pass | The details endpoint uses existing RBAC (get/list/watch) and an allow-list, behind the session middleware |

Post-design re-check: passes. The details endpoint returns a fixed set of fields per kind, so a
Pod's environment, arguments, and annotations cannot reach the browser.

## Project Structure

### Documentation (this feature)

```text
specs/006-explore-and-share/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── object-details.md   # GET /api/v1/objects
│   └── url-state.md        # fragment format for shared links
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── internal/api/handler.go       # route /api/v1/objects behind the session middleware
└── internal/cluster/details.go   # new: allow-listed fields per kind from the listers
frontend/src/
├── Topology.tsx, Clusters.tsx    # focus state, Escape steps (selection → focus → none)
├── components/three/*Scene.tsx   # hide unfocused nodes, draw namespace dots
├── components/DetailPanel.tsx    # fields, events, copy-command buttons
├── lib/urlState.ts               # new: read/write the fragment
├── lib/replay.ts                 # new: history buffer and checkpoints
├── components/Timeline.tsx       # new: scrub bar and "Live" button
└── hooks/useClustersSSE.ts       # feeds the replay buffer
hack/verify/check.mjs             # focus, details, share, replay checks
```

**Structure Decision**: Details are served by the backend on demand because the snapshot already
streams to every viewer and must not carry per-object specs; everything else is frontend-only.

## Complexity Tracking

No violations.
