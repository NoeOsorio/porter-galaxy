# Implementation Plan: Access Control

**Branch**: `005-access-control` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-access-control/spec.md`

## Summary

Put a built-in password login in front of the API, the way charts like Grafana do, then make the
default install safe and make HTTPS one value away. The backend owns auth: a login endpoint checks
the password from a mounted Secret and sets a signed, stateless session cookie; a middleware
rejects `/api/*` without it. The SPA shows a login form when the session check returns 401. The
chart generates the password when none is given and keeps it across upgrades. Defaults then drop
wildcard CORS, run both containers non-root with read-only filesystems, and set resources. A
`clusterIssuer` value adds the cert-manager annotation and TLS block for the configured host.

## Technical Context

**Language/Version**: Go 1.22 (backend); TypeScript 5 + React 19 (frontend); Helm 3 templates

**Primary Dependencies**: Go standard library only (`crypto/hmac`, `crypto/subtle`); no new frontend
dependencies; `nginxinc/nginx-unprivileged` replaces `nginx` as the frontend base image

**Storage**: Password in a Kubernetes Secret mounted as a file; sessions are stateless cookies

**Testing**: None by constitution. Gates and `make verify` (new `auth` scenario against fakestream
with a password), plus [quickstart.md](quickstart.md) on the reference cluster

**Target Platform**: Kubernetes 1.27+ with ingress-nginx; cert-manager for the optional HTTPS slice

**Project Type**: Web application shipped as a Helm chart

**Performance Goals**: No change to the render or stream budgets (SC-003); session checks are one
HMAC per request

**Constraints**: One shared account; no identity provider; `/healthz` and `/readyz` stay open;
nothing about the password or cookie is logged

**Scale/Scope**: A handful of concurrent viewers per install

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Thin Vertical Slices | Pass | US1 → 0.13.0, US2 → 0.15.0, US3 → 0.16.0 (0.14.x shipped the layout work); each is visible on the add-on |
| II. Verify on a Real Cluster | Pass | No test tasks; `auth` verify scenario plus quickstart on the Porter add-on |
| III. Truthful Data First | Pass | No change to what is drawn |
| IV. Performance Budget | Pass | One HMAC per request; the stream is authorized once per connection |
| V. Delete Before Adding | Pass | No new modules; the wildcard CORS header and the cross-origin dev setup are removed |
| VI. Read-Only by Default | Pass | RBAC unchanged; the default install stays `ClusterIP` with no Ingress, and the README states who can see the topology for each exposure |

Post-design re-check: passes. The backend reads its own password Secret through a volume, not the
Kubernetes API, so RBAC does not grow.

## Project Structure

### Documentation (this feature)

```text
specs/005-access-control/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── auth.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── cmd/server/main.go          # load auth config, wrap routes
├── cmd/fakestream/main.go      # -password flag for the verify auth scenario
└── internal/
    ├── api/handler.go          # drop wildcard CORS; auth routes; middleware on /api/*
    └── auth/auth.go            # new: password file, session cookie, rate limit
frontend/
├── src/App.tsx                 # session check before opening the stream
├── src/components/Login.tsx    # new: login form
├── src/hooks/useClustersSSE.ts # on stream error, re-check the session
├── nginx.conf.template         # listen 8080
├── Dockerfile                  # nginx-unprivileged
└── vite.config.ts              # preview proxy for /api
charts/porter-galaxy/
├── values.yaml                 # auth.*, resources, securityContext, ingress.tls.clusterIssuer
└── templates/
    ├── auth-secret.yaml        # new: generated or provided password
    ├── backend-deployment.yaml # password volume, security context
    ├── frontend-deployment.yaml# port 8080, emptyDirs, security context
    ├── ingress.yaml            # clusterIssuer annotation and TLS block
    └── NOTES.txt               # how to read the password
hack/verify.sh, hack/verify/check.mjs  # same-origin preview; auth scenario
```

**Structure Decision**: Auth lives in the backend so every path to the data (Ingress,
port-forward, in-cluster callers) is covered by one check, and the frontend's nginx stays a static
file server plus proxy.

## Complexity Tracking

No violations.
