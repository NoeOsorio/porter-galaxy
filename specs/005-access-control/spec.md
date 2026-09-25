# Feature Specification: Access Control

**Feature Branch**: `005-access-control`

**Created**: 2026-09-25

**Status**: Backlog

**Input**: Derived from the analysis: the app exposes the whole cluster topology to anyone who can
reach its URL.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Only my team can open Galaxy (Priority: P1)

The operator exposes Galaxy through an ingress and only people who sign in with the team's identity
provider can see it.

**Why this priority**: There is no authentication and the API sends `Access-Control-Allow-Origin: *`,
so a public ingress (like the current dev install) shows the cluster to anyone.

**Independent Test**: Enable auth on the Porter add-on and open the URL in a private window.

**Acceptance Scenarios**:

1. **Given** auth is enabled, **When** an anonymous visitor opens the URL, **Then** they are sent to
   sign in and see no cluster data.
2. **Given** a signed-in user outside the allowed email domain, **When** they open the URL, **Then**
   access is denied.

### User Story 2 - Safe by default (Priority: P2)

A default install is reachable only inside the cluster, runs with resource limits, a restricted
security context, and same-origin API access.

**Independent Test**: `helm template` with default values and inspect the manifests.

**Acceptance Scenarios**:

1. **Given** default values, **When** installed, **Then** no Ingress or LoadBalancer is created,
   both containers run as non-root with read-only root filesystems, and requests and limits are set.

### Edge Cases

- The SSE stream must stay authenticated across reconnects without prompting again.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chart MUST offer an OIDC sign-in option in front of the frontend and API.
- **FR-002**: The API MUST drop the wildcard CORS header.
- **FR-003**: The chart MUST set requests, limits, and a restricted security context by default.
- **FR-004**: The README MUST state who can see the topology for each exposure option.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An anonymous request to any path returns no cluster data when auth is on.
- **SC-002**: Default manifests pass the Kubernetes "restricted" Pod Security Standard.

## Assumptions

- Porter SSO integration is a later option; generic OIDC comes first.
