# Galaxy roadmap (Spec Kit)

Specs are shipped in order, one slice per PR and release (see `.specify/memory/constitution.md`).
Only the next spec has a plan and tasks; the rest are planned when they become next.

| # | Spec | Status | Depends on |
| --- | --- | --- | --- |
| 001 | [Truthful graph and usable camera](001-truthful-graph-and-camera/spec.md) | Done: US1 0.3.0, US2 0.4.0, US3 0.5.0, polish 0.5.1 · [tasks](001-truthful-graph-and-camera/tasks.md) | — |
| 002 | [Render engine at scale](002-render-engine-at-scale/spec.md) | Done: US1 0.6.0, US2 0.7.0, US3 0.8.0, polish · [tasks](002-render-engine-at-scale/tasks.md) | 001 |
| 003 | [Workload coverage and health](003-workload-coverage-and-health/spec.md) | Done (0.9.0–0.12.0) · [tasks](003-workload-coverage-and-health/tasks.md) | 001 |
| 004 | [Multi-cluster hub](004-multi-cluster-hub/spec.md) | Backlog | 001, 005 for public hubs |
| 005 | [Access control](005-access-control/spec.md) | Backlog | — |
| 006 | [Explore and share](006-explore-and-share/spec.md) | Backlog | 002, 003 |

To start the next spec: set `.specify/feature.json` to its directory, then run `/speckit-plan` and
`/speckit-tasks`. To build a slice: `/speckit-implement` on its phase.
