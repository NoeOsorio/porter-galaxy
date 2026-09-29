# Research: Access Control

## R1. Where auth runs

- **Decision**: In the Go backend, as middleware on `/api/*` plus `/api/auth/*` endpoints. The
  frontend serves static files without auth; the bundle holds no cluster data.
- **Rationale**: One check covers the Ingress, a port-forward to either Service, and in-cluster
  callers. nginx `auth_basic` would leave the backend Service open and gives no sign-out.
- **Alternatives**: ingress-nginx basic auth (browser pop-up, only protects the Ingress path);
  oauth2-proxy or Porter Forward Authentication (needs an IdP, a domain, and HTTPS; kept as a later
  option in the spec's assumptions).

## R2. Sessions

- **Decision**: Stateless cookie `galaxy_session` = `<expiry-unix>.<hex HMAC-SHA256(key, expiry)>`,
  where `key = HMAC-SHA256(password, "galaxy-session-v1")`. Expiry 24 h. `HttpOnly`,
  `SameSite=Strict`, `Path=/`, `Secure` when the request arrived over HTTPS
  (`X-Forwarded-Proto: https` from ingress-nginx, or TLS on the backend).
- **Rationale**: No session store, so the backend stays single-replica-agnostic. Deriving the key
  from the password makes rotation end every session (FR-003) with no extra state.
- **Alternatives**: random key in memory (a restart signs everyone out); a stored session table
  (state for no gain with one shared account).

## R3. Password source and rotation

- **Decision**: The chart mounts the Secret at `/etc/galaxy/auth` (keys `username`, `password`).
  The backend re-reads the files when their modification time changes. The kubelet refreshes
  mounted Secrets within about a minute, so a new password applies without a restart.
- **Generated password**: `templates/auth-secret.yaml` uses `lookup` to reuse the existing Secret's
  password on upgrade and `randAlphaNum 24` on first install; `auth.existingSecret` skips the
  template entirely. `helm template` (no cluster) always renders a new random value, which only
  matters for dry runs.
- **Rationale**: Same behavior as the Grafana chart's `adminPassword` / `existingSecret`.

## R4. Brute-force protection

- **Decision**: Compare with `crypto/subtle.ConstantTimeCompare`. Every failed attempt waits 1 s
  before answering. Per client IP (first `X-Forwarded-For` entry, else the remote address), more
  than 10 failures in 10 minutes returns 429 until the window passes. The limiter map is pruned
  on each attempt.
- **Rationale**: Bounds guessing to ~1,440 attempts per IP per day without accounts or storage.

## R5. Stream and expiry

- **Decision**: The SSE handler is behind the same middleware, so the session is checked when the
  stream opens. On `EventSource` error the client calls `GET /api/auth/session`; a 401 switches the
  app to the login form instead of retrying.
- **Rationale**: `EventSource` hides the HTTP status of a failed reconnect, so the session endpoint
  is the only way to tell "expired" from "backend down".

## R6. Same-origin everywhere (drop wildcard CORS)

- **Decision**: Remove `Access-Control-Allow-Origin: *`. Production is already same-origin (nginx
  proxies `/api`). `make verify` stops building with `VITE_API_URL` and instead serves the build
  with `vite preview` proxying `/api` to fakestream, as `vite dev` already does.
- **Rationale**: A session cookie with `SameSite=Strict` is not sent cross-origin, so a
  cross-origin dev setup would break once auth is on.

## R7. Restricted security context

- **Decision**: Backend: add `USER 65532:65532` to the scratch image; pod `runAsNonRoot`,
  `seccompProfile: RuntimeDefault`; container `allowPrivilegeEscalation: false`,
  `capabilities.drop: [ALL]`, `readOnlyRootFilesystem: true`. Frontend: base image
  `nginxinc/nginx-unprivileged:1.27-alpine` (UID 101, listens on 8080); emptyDirs for `/tmp` and
  for the rendered config directory; the template moves out of `conf.d` so the emptyDir does not
  hide it. Default resources: backend 50m/128Mi requests, 256Mi limit; frontend 10m/32Mi requests,
  64Mi limit.
- **Rationale**: Meets the "restricted" Pod Security Standard (SC-002) with the existing stack.

## R8. HTTPS value

- **Decision**: `ingress.tls.clusterIssuer: <name>` adds `cert-manager.io/cluster-issuer` and a TLS
  block for `ingress.host` with secret `<fullname>-tls`. The existing free-form `ingress.tls` list
  stays for other setups. The chart refuses to render if `clusterIssuer` is set without a host.
- **Rationale**: Let's Encrypt cannot issue for a load balancer hostname the operator does not own,
  so a host is required.
