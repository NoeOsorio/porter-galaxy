# Contract: `fakestream` load generator

A local dev binary in `backend/cmd/fakestream`. It is not shipped in images or the chart.

```bash
cd backend && go run ./cmd/fakestream \
  -port 4078 \
  -pods 1000 \              # total pods
  -namespaces 20 \
  -deployments-per-ns 5 \
  -nodes 12 \
  -churn 500ms \            # interval between snapshot updates; 0 disables churn
  -churn-size 3             # pods replaced per update
```

Endpoints (same shapes as the real backend, spec 001 contract):

- `GET /api/v1/clusters` — SSE; first event is the full snapshot, then one per churn interval.
  Pods belong to Deployments (`owner.kind = "Deployment"`), are spread across nodes, and every
  Deployment's pods are behind a Service; one Ingress per namespace routes to one Service, so the
  Topology view has Internet → LB → Ingress → Service → Deployment → Pod chains.
- `GET /readyz` — always 200.
- CORS `*` so a Vite dev server on another port can connect.

Churn replaces `-churn-size` random pods per tick with new names in the same Deployment, which
exercises add/remove on every update.
