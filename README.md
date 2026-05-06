<div align="center">

# Porter Galaxy

**Visualize your Kubernetes cluster as a living galaxy.**

A force-directed graph view of every Pod, Service, Deployment, and the relationships between them — rendered with Three.js, served by a Go backend that reads the live cluster state via `client-go`.

[![Release](https://img.shields.io/github/v/tag/NoeOsorio/porter-galaxy?label=release&sort=semver)](https://github.com/NoeOsorio/porter-galaxy/releases)
[![CI](https://github.com/NoeOsorio/porter-galaxy/actions/workflows/publish.yml/badge.svg)](https://github.com/NoeOsorio/porter-galaxy/actions/workflows/publish.yml)
[![Helm](https://img.shields.io/badge/helm-chart-0F1689?logo=helm&logoColor=white)](https://charts.noeosorio.com)
[![Backend image](https://img.shields.io/badge/ghcr.io-porter--galaxy--backend-2188ff?logo=docker&logoColor=white)](https://github.com/NoeOsorio/porter-galaxy/pkgs/container/porter-galaxy-backend)
[![Frontend image](https://img.shields.io/badge/ghcr.io-porter--galaxy--frontend-2188ff?logo=docker&logoColor=white)](https://github.com/NoeOsorio/porter-galaxy/pkgs/container/porter-galaxy-frontend)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

<p align="center">
  <img src="docs/screenshots/topology.png" alt="Topology view — force-directed graph of cluster objects" width="49%" />
  <img src="docs/screenshots/clusters.png" alt="Clusters view — hierarchical layout of namespaces and workloads" width="49%" />
</p>

---

## Why

`kubectl get` tells you *what* is in the cluster. Porter Galaxy shows you *how it all connects* — which Pods belong to which ReplicaSet, which Service selects which Deployment, where the dense regions are, and where the lonely dangling object lives. It runs in-cluster, refreshes in near real time, and renders the whole thing on a single canvas you can fly around.

Two views, one model:

- **Topology** — every workload and its dependencies, force-laid-out so neighborhoods emerge naturally.
- **Clusters** — hierarchical view (Namespace → Workload → Pod) for when you want structure instead of physics.

---

## Install

### One-liner with Helm

```bash
helm repo add porter-galaxy https://charts.noeosorio.com
helm repo update
helm install galaxy porter-galaxy/porter-galaxy \
  --namespace porter-galaxy --create-namespace
```

Then port-forward and open it:

```bash
kubectl port-forward svc/galaxy-porter-galaxy-frontend 8080:80 -n porter-galaxy
open http://localhost:8080
```

### Expose it with an Ingress

```bash
helm upgrade galaxy porter-galaxy/porter-galaxy \
  --namespace porter-galaxy --reuse-values \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.host=galaxy.example.com
```

### Private GHCR images

If your fork uses private container images, create a pull secret and pass it to the chart:

```bash
kubectl create secret docker-registry ghcr-creds \
  --docker-server=ghcr.io --docker-username=YOUR_USER \
  --docker-password=YOUR_PAT --namespace porter-galaxy

helm upgrade galaxy porter-galaxy/porter-galaxy \
  --namespace porter-galaxy --reuse-values \
  --set 'imagePullSecrets[0].name=ghcr-creds'
```

Full deploy walkthrough: **[DEPLOY_MANUAL.md](DEPLOY_MANUAL.md)**.

---

## Local development

```bash
# 1. Frontend (Vite dev server, hot reload)
cd frontend && npm install && npm run dev

# 2. Backend (against your current kubeconfig context)
cd backend && go run ./cmd/server
```

Or boot everything inside a local **kind** cluster with one command:

```bash
make up        # build images, load into kind, helm install the chart
make open      # port-forward the frontend to http://localhost:8888
make logs-backend
```

`make help` lists every target.

---

## Architecture

```
                        ┌─────────────────────────────┐
                        │  React 19 + Three.js (Vite) │
                        │  Force-directed canvas      │
                        └──────────────┬──────────────┘
                                       │ /api/*  (nginx proxy)
                        ┌──────────────▼──────────────┐
                        │  Go backend (client-go)     │
                        │  Watches Pods/Svcs/Deploys  │
                        │  Builds nodes + edges       │
                        └──────────────┬──────────────┘
                                       │ Kubernetes API
                                       ▼
                              your live cluster
```

| Layer        | Tech                                                        |
| ------------ | ----------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite, Tailwind v4, Three.js (R3F)     |
| Backend      | Go 1.22, `k8s.io/client-go` informers                       |
| Distribution | Multi-stage Docker images on GHCR, Helm chart on Chart Museum |
| RBAC         | ClusterRole + ClusterRoleBinding (read-only across the cluster) |

The backend uses informers to keep an in-memory graph in sync with cluster state, so the frontend gets fast, consistent reads without hitting the API server on every paint.

---

## Repository layout

```
porter-galaxy/
├── backend/                 # Go API server
│   ├── cmd/server/          # Entry point
│   └── internal/
│       ├── api/             # HTTP handlers
│       ├── cluster/         # Cluster client wiring
│       ├── informers/       # client-go informer setup
│       ├── registry/        # Object registry → graph
│       └── store/           # In-memory graph store
├── frontend/                # React + Three.js app
│   ├── src/
│   │   ├── GalaxyGraph.tsx  # Canvas + state
│   │   ├── Topology.tsx     # Force-directed view
│   │   ├── Clusters.tsx     # Hierarchical view
│   │   ├── components/      # HUD, legend, node detail
│   │   └── lib/             # Pure graph + render helpers
│   └── nginx.conf.template  # Serves static + proxies /api
├── charts/porter-galaxy/    # Helm chart (deployments, svcs, ingress, RBAC)
├── .github/workflows/       # publish.yml — tag-driven release
├── Makefile                 # dev + release commands
└── DEPLOY_MANUAL.md         # Full deploy / Chart Museum guide
```

---

## Configuration

The chart's most useful values:

| Value                          | Default                                  | What it does                                |
| ------------------------------ | ---------------------------------------- | ------------------------------------------- |
| `backend.image.repository`     | `ghcr.io/noeosorio/porter-galaxy-backend`  | Backend image                               |
| `frontend.image.repository`    | `ghcr.io/noeosorio/porter-galaxy-frontend` | Frontend image                              |
| `*.image.tag`                  | `Chart.AppVersion`                       | Override per-release if needed              |
| `imagePullSecrets`             | `[]`                                     | Secrets for private registries              |
| `service.type`                 | `ClusterIP`                              | Set to `LoadBalancer` for a public IP       |
| `ingress.enabled`              | `false`                                  | Toggle Ingress object                       |
| `ingress.className`            | `""`                                     | e.g. `nginx`, `alb`                         |
| `ingress.host`                 | `""`                                     | Public DNS name                             |
| `ingress.tls`                  | `[]`                                     | Standard `tls:` block (cert-manager works)  |
| `serviceAccount.create`        | `true`                                   | Backend RBAC needs a ServiceAccount         |

Full default values: [`charts/porter-galaxy/values.yaml`](charts/porter-galaxy/values.yaml).

---

## Releasing

> **Releases are tag-driven.** Pushing to `main` does not publish anything — the `Publish` workflow only fires on tags matching `v*.*.*`.

```bash
make release VERSION=1.1.0
# equivalent to: git tag v1.1.0 && git push origin v1.1.0
```

CI then:

1. Builds and pushes `ghcr.io/<owner>/porter-galaxy-{backend,frontend}:1.1.0`, `:1.1`, `:latest`.
2. Rewrites `Chart.yaml` to pin `appVersion: v1.1.0`.
3. Packages and pushes the chart to Chart Museum.

Full flow including Chart Museum bootstrap: **[DEPLOY_MANUAL.md](DEPLOY_MANUAL.md)**.

---

## Roadmap

- [x] Force-directed canvas with Three.js
- [x] Topology + Clusters views
- [x] Helm chart + tag-driven CI
- [x] In-cluster RBAC for read-only graph access
- [ ] Live updates over WebSocket (currently polled)
- [ ] Search / filter / namespace scoping in the UI
- [ ] Node-detail side panel for any object kind
- [ ] Export current view as PNG / share URL
- [ ] Optional Go → WASM force simulation for large clusters

---

## Contributing

PRs welcome. Conventional Commits encouraged but not enforced.

```bash
git checkout -b feat/your-thing
# hack hack hack
git commit -m "feat: your thing"
git push origin feat/your-thing
gh pr create
```

If you're touching the chart, run `helm lint charts/porter-galaxy && make template` before pushing.

---

## License

[MIT](LICENSE) © Noé Osorio
