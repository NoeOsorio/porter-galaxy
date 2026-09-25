<!--
Sync Impact Report
- Version change: template → 1.0.0
- Principles added: I. Thin Vertical Slices, II. Verify on a Real Cluster, III. Truthful Data First,
  IV. Performance Budget, V. Delete Before Adding, VI. Read-Only by Default
- Sections added: Constraints, Development Workflow, Governance
- Templates: plan-template.md ✅ (Constitution Check reads these principles) · spec-template.md ✅ no change
  · tasks-template.md ✅ no change (test tasks stay optional; this constitution never requests them)
- Deferred TODOs: none
-->

# Porter Galaxy Constitution

## Core Principles

### I. Thin Vertical Slices

Every spec MUST be deliverable as one or more slices that each ship on their own: merged to `main`,
released with `make release`, and visible in the deployed app. A user story that cannot be shown to
someone after it merges is too big and MUST be split. Specs are planned just in time: only the next
spec gets a `plan.md` and `tasks.md`; later specs stay as `spec.md` until they are next.

### II. Verify on a Real Cluster (no unit tests)

The project does not write unit, contract, or integration test suites. Verification is:
`npm run build` and `npm run lint` in `frontend/`, `go build ./...` and `go vet ./...` in `backend/`,
`helm lint charts/porter-galaxy`, and walking the spec's `quickstart.md` against the app running in a
real cluster (a Porter Helm add-on or `make up` on kind). Tasks MUST NOT include test-writing work.
A slice is done when its quickstart steps pass on a deployed build.

### III. Truthful Data First

What Galaxy draws MUST match the cluster. A missing, duplicated, or mislabeled object is a bug that
outranks any visual feature. Every object is identified by cluster, namespace, kind, and name.
Colors and states come from Kubernetes status fields, never from string guesses or color comparisons.

### IV. Performance Budget

The app MUST stay interactive (target 60 fps, never below 30 fps) on a 1,000-pod cluster on a
laptop-class GPU, and show a first frame within 2 s of the page loading on a warm cache. A change that
adds per-object meshes, lights, or per-frame O(n²) work MUST justify it in the plan's Complexity
Tracking table.

### V. Delete Before Adding

Unused views, helpers, and dependencies are removed rather than kept "for later". A new runtime
dependency MUST name the problem it solves that the current stack (React, Three.js/R3F, drei,
client-go) cannot. Prefer one clear code path per behavior.

### VI. Read-Only by Default

The backend only ever reads cluster state (get/list/watch). Any exposure of cluster topology beyond
`ClusterIP` MUST be a deliberate chart value, and the docs MUST state who can see it.

## Constraints

- Stack: Go backend with client-go informers; React 19 + TypeScript + Three.js (R3F) frontend;
  distribution as a Helm chart and images on GHCR (OCI).
- Galaxy is independent of Porter's product workflow: it is tracked in this repo's `specs/`, not in
  Porter's Linear teams or cycles.
- Chart values that change behavior MUST be documented in the README Configuration table.

## Development Workflow

1. Pick the next spec in `specs/README.md`; if it has no `plan.md`, run plan and tasks for it first.
2. One branch per slice (`NNN-short-name` or `NNN-short-name-usX`), one PR per slice.
3. Before opening the PR: run the checks in Principle II and walk the quickstart for that slice.
4. After merge: `make release VERSION=x.y.z`, upgrade the Porter add-on's Chart Version, and re-walk
   the quickstart on the deployed app.

## Governance

This constitution overrides conflicting guidance in specs and plans. Amendments are made by editing
this file in a PR that states the reason and bumps the version (MAJOR: a principle removed or
redefined; MINOR: a principle or section added; PATCH: wording). Every plan's Constitution Check MUST
list each principle with pass or a justified exception.

**Version**: 1.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
