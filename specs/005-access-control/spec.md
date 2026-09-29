# Feature Specification: Access Control

**Feature Branch**: `005-access-control`

**Created**: 2026-09-25 · **Revised**: 2026-09-29

**Status**: Backlog

**Input**: The app exposes the whole cluster topology to anyone who can reach its URL. Access should
work the way it does in charts like Grafana: a built-in login with a password from a Secret, no
identity provider required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with a password (Priority: P1)

The operator installs the chart and gets a login page. The password comes from the chart values or an
existing Secret; if neither is set, the chart generates one and the install notes say how to read it.
After signing in, both views work as before, including live updates.

**Why this priority**: There is no authentication today and the API sends
`Access-Control-Allow-Origin: *`, so a public ingress shows the cluster to anyone.

**Independent Test**: Install with defaults on the reference cluster, open the URL in a private
window, and sign in with the password read from the Secret.

**Acceptance Scenarios**:

1. **Given** auth is enabled, **When** an anonymous visitor opens the URL or calls the API, **Then**
   they get the login page (API: 401) and no cluster data.
2. **Given** a correct password, **When** the user signs in, **Then** both views load and stay live.
3. **Given** a wrong password, **When** the user retries quickly, **Then** each failure is slowed
   down and the page says the password is wrong.
4. **Given** a signed-in user, **When** they click "Sign out", **Then** the next request needs a
   new sign-in.

### User Story 2 - Safe by default (Priority: P2)

A default install is reachable only inside the cluster, has auth on, runs with resource limits and a
restricted security context, and serves the API only to its own origin.

**Independent Test**: `helm template` with default values and inspect the manifests.

**Acceptance Scenarios**:

1. **Given** default values, **When** installed, **Then** no Ingress or LoadBalancer is created,
   auth is enabled, both containers run as non-root with read-only root filesystems, and requests
   and limits are set.
2. **Given** any install, **When** a page on another origin calls the API, **Then** the browser
   blocks the response (no wildcard CORS).

### User Story 3 - HTTPS with my own domain (Priority: P3)

The operator points a domain at the ingress and sets one value naming a cert-manager issuer; the chart
requests the certificate and serves the app over HTTPS.

**Why this priority**: Over plain HTTP the password and session cookie can be read on the network
path. HTTPS needs a domain the operator owns, so it is recommended, not required.

**Independent Test**: On a cluster with cert-manager and an ACME issuer, set the host and issuer,
create the DNS record, and open `https://<host>`.

**Acceptance Scenarios**:

1. **Given** `ingress.host` and `ingress.tls.clusterIssuer` are set, **When** installed, **Then** the
   Ingress has a TLS section for that host and cert-manager issues its certificate.
2. **Given** HTTPS is on, **When** the user signs in, **Then** the session cookie is marked Secure.

### Edge Cases

- A session expires while a view is open: the live stream's reconnect gets 401 and the app returns to
  the login page instead of retrying forever.
- Changing the password in the Secret signs everyone out.
- `/healthz` and `/readyz` stay unauthenticated so kubelet probes keep working.
- A port-forward to the frontend still requires signing in.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST require a valid session for every `/api/*` route, including the SSE
  stream, when auth is enabled.
- **FR-002**: The chart MUST take the password from values or an existing Secret, and generate a
  random one kept across upgrades when neither is set.
- **FR-003**: Sessions MUST be signed, HttpOnly, SameSite=Strict cookies with an expiry; the signing
  key MUST derive from the password so rotating it ends every session.
- **FR-004**: Failed sign-ins MUST be rate limited.
- **FR-005**: The API MUST drop the wildcard CORS header.
- **FR-006**: The chart MUST set requests, limits, and a restricted security context by default.
- **FR-007**: The chart MUST offer `ingress.tls.clusterIssuer` to request a certificate with
  cert-manager.
- **FR-008**: The README MUST state who can see the topology for each exposure option and how to read
  the generated password.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With auth on, an anonymous request to any `/api/*` path returns 401 and no cluster data.
- **SC-002**: Default manifests pass the Kubernetes "restricted" Pod Security Standard.
- **SC-003**: After signing in, the views keep the performance budget of spec 002 and the stream
  byte rate of spec 003.

## Assumptions

- One shared account (a username and a password) is enough; per-user accounts and roles are out of
  scope.
- Sign-in through an identity provider (for example Porter's Forward Authentication, which needs an
  IdP, a domain, and HTTPS) is a later option layered on the same ingress.
