# Porter Galaxy

A visual cluster explorer that maps relationships between entities as an interactive, navigable graph — inspired by Obsidian's note graph view.

Built as a monorepo with a Go backend and a WebAssembly frontend.

---

## Overview

Porter Galaxy renders clusters of connected nodes in a force-directed graph canvas. Each node represents an entity (e.g. a service, a host, a workload) and edges represent relationships between them. The goal is to provide an intuitive, spatial way to explore complex topologies at a glance.

### Inspiration

Obsidian's graph view makes knowledge relationships instantly visual. Porter Galaxy applies the same principle to infrastructure or domain data: instead of notes linking to notes, you get services linking to services, hosts linking to workloads, or any domain model your backend feeds in.

---

## Architecture

```
porter-galaxy/
├── backend/          # Go REST/WebSocket API server
├── frontend/         # Go WebAssembly application + Tailwind CSS
├── infra/
│   └── nginx/        # Reverse proxy / static file server
├── scripts/          # Build & utility scripts
├── docker-compose.yml
└── docker-compose.dev.yml
```

### Backend (Go)

- Serves graph data via a REST API and optionally over WebSockets for live updates
- Owns the domain model: nodes, edges, clusters, and metadata
- Organized around Clean Architecture layers (`cmd`, `internal`, `pkg`)

### Frontend (Go → WebAssembly)

- Written in Go and compiled to a `.wasm` binary targeting `GOOS=js GOARCH=wasm`
- Renders the graph canvas using the browser's Canvas or WebGL API
- Styled with **Tailwind CSS** for all UI chrome (panels, tooltips, controls)
- Communicates with the backend over HTTP/WebSocket via the standard `syscall/js` bridge

### Infrastructure

- **nginx** serves the static frontend assets and proxies `/api` requests to the backend
- Multi-stage Docker builds keep images lean
- `docker-compose` orchestrates all services for both dev and production

---

## Tech Stack

| Layer      | Technology              |
|------------|-------------------------|
| Backend    | Go 1.22+                |
| Frontend   | Go (WASM) + Tailwind CSS |
| CSS Build  | Node.js / PostCSS       |
| Proxy      | nginx                   |
| Container  | Docker + Compose        |

---

## Project Structure

```
porter-galaxy/
├── README.md
├── .env.example
├── .gitignore
├── Makefile
├── docker-compose.yml          # Production compose
├── docker-compose.dev.yml      # Dev compose (hot-reload friendly)
│
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── go.mod
│   ├── cmd/
│   │   └── server/
│   │       └── main.go         # Entry point — HTTP server bootstrap
│   ├── internal/
│   │   ├── api/                # HTTP handlers & route definitions
│   │   ├── graph/              # Graph domain: nodes, edges, clusters
│   │   └── store/              # Data access layer (in-memory / DB)
│   └── pkg/                    # Exported, reusable packages
│
├── frontend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── go.mod
│   ├── package.json            # Node tooling for Tailwind build
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/
│   │   ├── main.go             # WASM entry point
│   │   └── styles/
│   │       └── main.css        # Tailwind directives
│   └── public/
│       └── index.html          # Shell HTML that boots the WASM module
│
├── infra/
│   └── nginx/
│       ├── Dockerfile
│       └── nginx.conf
│
└── scripts/
    └── build.sh                # One-shot build script (WASM + CSS)
```

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Go 1.22+](https://go.dev/dl/) (for local development)
- [Node.js 20+](https://nodejs.org/) (for Tailwind CSS compilation)

### Run with Docker (recommended)

```bash
# Copy environment config
cp .env.example .env

# Build and start all services
docker compose up --build
```

The app will be available at `http://localhost:8080`.

### Run locally (development)

```bash
# 1. Start the backend
make dev-backend

# 2. Build the WASM binary and CSS, then serve the frontend
make dev-frontend

# 3. (Optional) watch for CSS changes
make watch-css
```

---

## Makefile Targets

| Target            | Description                                      |
|-------------------|--------------------------------------------------|
| `make build`      | Build all Docker images                          |
| `make up`         | Start all services via docker compose            |
| `make down`       | Stop all services                                |
| `make dev-backend`| Run the Go backend with live reload              |
| `make dev-frontend`| Build WASM + CSS and start a local file server  |
| `make build-wasm` | Compile the Go frontend to `main.wasm`           |
| `make build-css`  | Run Tailwind CSS build                           |
| `make watch-css`  | Watch and rebuild CSS on change                  |
| `make clean`      | Remove build artifacts                           |
| `make test`       | Run all tests                                    |

---

## Environment Variables

See `.env.example` for all available configuration options.

| Variable           | Default       | Description                        |
|--------------------|---------------|------------------------------------|
| `BACKEND_PORT`     | `4000`        | Port the Go API server listens on  |
| `NGINX_PORT`       | `8080`        | Externally exposed port via nginx  |
| `LOG_LEVEL`        | `info`        | Backend log verbosity              |

---

## Graph Data Model

> Full spec to be defined during implementation. Initial sketch:

```
Node {
  id:       string       // Unique identifier
  label:    string       // Display name
  kind:     string       // Entity type (e.g. "service", "host")
  metadata: map[string]any
}

Edge {
  source:   string       // Node ID
  target:   string       // Node ID
  weight:   float64      // Optional edge strength
  label:    string
}

Cluster {
  id:       string
  nodes:    []Node
  edges:    []Edge
}
```

---

## Roadmap

- [ ] Backend: graph data model + in-memory store
- [ ] Backend: REST API for CRUD operations on nodes/edges
- [ ] Frontend: WASM canvas renderer with force-directed layout
- [ ] Frontend: Node selection, hover tooltips, pan & zoom
- [ ] Backend: WebSocket endpoint for live graph updates
- [ ] Frontend: Live update subscription
- [ ] UI: Search and filter controls
- [ ] UI: Cluster grouping and color coding
- [ ] Persistence: pluggable store (SQLite, Postgres)
- [ ] Auth: optional JWT-based access control

---

## Contributing

1. Fork and clone the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Open a pull request

---

## License

MIT
