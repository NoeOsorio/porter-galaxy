# Tasks: Access Control

**Input**: Design documents from `/specs/005-access-control/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth.md, quickstart.md

**Tests**: None. The constitution replaces test suites with `make verify` and quickstart.md on the
reference cluster.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story the task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Make the verify lane same-origin, like production, so session cookies work there.

- [ ] T001 Serve the verify build with `vite preview` proxying `/api` to the fake stream (research R6): add `preview.proxy["/api"]` targeting `process.env.GALAXY_API ?? "http://localhost:4000"` in `frontend/vite.config.ts`; in `hack/verify.sh` build without `VITE_API_URL` and start preview with `GALAXY_API=http://localhost:$FAKE_PORT`. Every existing scenario must still pass.

**Checkpoint**: `make verify` passes with the app and API on one origin.

---

## Phase 2: User Story 1 - Sign in with a password (P1) · release 0.13.0

**Goal**: The API needs a session; the app shows a login form; the chart provides the password.

**Independent Test**: quickstart.md §1

- [ ] T002 [US1] Create `backend/internal/auth/auth.go` per contracts/auth.md and research R2–R5: credentials read from `<dir>/username` and `<dir>/password` (re-read when the files' modification time changes) or given directly; stateless `galaxy_session` cookie (expiry + HMAC under a key derived from the password, 24 h, HttpOnly, SameSite=Strict, Secure when `X-Forwarded-Proto` is `https` or the request is TLS); constant-time compare; 1 s delay per failure; per-IP limiter (10 failures / 10 min → 429 with `Retry-After`); handlers for `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`; `Middleware(next)` returning 401 JSON without a session. Never log credentials or cookies.
- [ ] T003 [US1] Route through auth in `backend/internal/api/handler.go`: `NewHandler` takes an `*auth.Auth` (nil = auth off, and `/api/auth/session` returns 200); register the three auth routes; wrap every other `/api/*` route with the middleware; `/healthz` and `/readyz` stay open.
- [ ] T004 [US1] Load auth in `backend/cmd/server/main.go`: when `AUTH_ENABLED=true`, read credentials from `AUTH_DIR` (default `/etc/galaxy/auth`) and exit with a clear error if the files are missing or the password is empty.
- [ ] T005 [P] [US1] Add a `-password` flag to `backend/cmd/fakestream/main.go` that turns auth on with username `admin` and that password.
- [ ] T006 [US1] Chart: `auth.enabled` (true), `auth.username` (admin), `auth.password` (""), `auth.existingSecret` ("") in `charts/porter-galaxy/values.yaml`; new `charts/porter-galaxy/templates/auth-secret.yaml` (skipped with `existingSecret`; reuses the live Secret's password via `lookup`, else `randAlphaNum 24`); mount the Secret read-only at `/etc/galaxy/auth` and set `AUTH_ENABLED` in `charts/porter-galaxy/templates/backend-deployment.yaml`; print the command to read the password in `charts/porter-galaxy/templates/NOTES.txt`.
- [ ] T007 [US1] Frontend: new `frontend/src/components/Login.tsx` (username, password, error text, disabled while submitting); in `frontend/src/App.tsx` call `GET /api/auth/session` on load and show Login until it returns 200, open the stream only after, and add a "Sign out" control; in `frontend/src/hooks/useClustersSSE.ts`, on stream error call the session endpoint and switch to Login on 401 instead of retrying.
- [ ] T008 [US1] Add an `auth` scenario to `hack/verify/check.mjs` and `hack/verify.sh` (fake stream started with `-password`): the login form shows and no graph loads; `/api/v1/clusters` returns 401; a wrong password shows an error; the right one loads the Topology view; "Sign out" returns to the form.
- [ ] T009 [US1] README: "Signing in" (default user, reading the generated password, setting your own or an existing Secret) and a note in "Deploy on Porter" on where to find the password, in `README.md`; add the `auth.*` values to the Configuration table.
- [ ] T010 [US1] `make verify`, PR, merge, `make release VERSION=0.13.0`, upgrade the add-on, walk quickstart §1.

**Checkpoint**: The deployed app asks for a password; the stream is refused without a session.

---

## Phase 3: User Story 2 - Safe by default (P2) · release 0.14.0

**Goal**: Default manifests pass the restricted Pod Security Standard; no wildcard CORS.

**Independent Test**: quickstart.md §2

- [ ] T011 [US2] Remove `Access-Control-Allow-Origin` from `backend/internal/api/handler.go` (the SSE handler and any other response).
- [ ] T012 [P] [US2] Backend image and pod: `USER 65532:65532` in `backend/Dockerfile`; pod `runAsNonRoot` and `seccompProfile: RuntimeDefault`, container `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `readOnlyRootFilesystem: true`, and default resources (50m/128Mi requests, 256Mi limit) in `charts/porter-galaxy/templates/backend-deployment.yaml` and `charts/porter-galaxy/values.yaml`.
- [ ] T013 [P] [US2] Frontend image and pod: base `nginxinc/nginx-unprivileged:1.27-alpine` and the template moved out of `conf.d` in `frontend/Dockerfile`; `listen 8080` in `frontend/nginx.conf.template`; container port 8080, emptyDirs for `/tmp` and `/etc/nginx/conf.d`, the same security context, and default resources (10m/32Mi requests, 64Mi limit) in `charts/porter-galaxy/templates/frontend-deployment.yaml` and `charts/porter-galaxy/values.yaml`; keep the Service port at 80 targeting the named port.
- [ ] T014 [US2] README: an "Exposure" table (port-forward / Ingress over HTTP / Ingress over HTTPS: who can see the topology, what crosses the network in clear), and the new resource and security defaults in the Configuration table, in `README.md`.
- [ ] T015 [US2] `make verify`, `helm lint`, PR, merge, `make release VERSION=0.14.0`, upgrade the add-on, walk quickstart §2.

**Checkpoint**: Both pods run as non-root with read-only filesystems; the add-on keeps working.

---

## Phase 4: User Story 3 - HTTPS with my own domain (P3) · release 0.15.0

**Goal**: One value turns on a cert-manager certificate for `ingress.host`.

**Independent Test**: quickstart.md §3 (needs a domain the operator controls)

- [ ] T016 [US3] `ingress.tls.clusterIssuer` in `charts/porter-galaxy/values.yaml` and `charts/porter-galaxy/templates/ingress.yaml`: adds `cert-manager.io/cluster-issuer` and a TLS block for `ingress.host` with secret `<fullname>-tls`; `fail` with a clear message when set without `ingress.host`; keep accepting the previous list form of `ingress.tls` so existing installs render unchanged. Show `https://` in `charts/porter-galaxy/templates/NOTES.txt` when TLS is on.
- [ ] T017 [US3] README "HTTPS with your own domain" (FR-009): the DNS record to create, the two values, how to check the certificate (`kubectl get certificate`), and the warning that without HTTPS the password and cookie cross the network unencrypted, in `README.md`.
- [ ] T018 [US3] `make verify`, PR, merge, `make release VERSION=0.15.0`, upgrade the add-on; walk quickstart §3 if a domain is available, otherwise record that it was checked with `helm template` only.

---

## Phase 5: Polish

- [ ] T019 `specs/README.md` status for 005 and the README Roadmap entry.

---

## Dependencies & Execution Order

- T001 → US1 → US2 → US3 → Polish.
- Within US1: T002 → T003 → T004; T005 after T002; T006 and T007 in parallel with T003–T005; T008 after T005 and T007.
- US2's T012 and T013 touch different files and can run in parallel.

## Implementation Strategy

1. T001 alone keeps the verify lane working once cookies are involved.
2. Ship US1 (0.13.0) first: it closes the open-access problem on its own.
3. US2 hardens the default install; US3 is optional HTTPS for operators with a domain.
