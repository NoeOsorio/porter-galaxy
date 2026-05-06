CLUSTER      ?= porter
RELEASE      ?= galaxy
NAMESPACE    ?= default
CHART        := ./charts/porter-galaxy
CHART_PKG    := porter-galaxy-0.1.0.tgz
CHARTMUSEUM  := http://localhost:8080

BACKEND_IMG  := porter-galaxy-backend:local
FRONTEND_IMG := porter-galaxy-frontend:local

HELM_FLAGS := \
	--set backend.image.repository=porter-galaxy-backend \
	--set backend.image.tag=local \
	--set backend.image.pullPolicy=Never \
	--set frontend.image.repository=porter-galaxy-frontend \
	--set frontend.image.tag=local \
	--set frontend.image.pullPolicy=Never

# ── High-level targets ────────────────────────────────────────────────────────

.PHONY: up
up: build load install ## Build images, load into kind, and install the chart
	@echo ""
	@echo "Done! Run 'make open' to access the UI."

.PHONY: dev
dev: build load upgrade ## Rebuild images and upgrade the running release
	@echo ""
	@echo "Release upgraded."

.PHONY: down
down: uninstall ## Remove the Helm release from the cluster

# ── Image targets ─────────────────────────────────────────────────────────────

.PHONY: build
build: build-backend build-frontend ## Build both Docker images

.PHONY: build-backend
build-backend:
	@echo "→ Building backend image..."
	docker build -t $(BACKEND_IMG) ./backend

.PHONY: build-frontend
build-frontend:
	@echo "→ Building frontend image..."
	docker build -t $(FRONTEND_IMG) ./frontend

.PHONY: load
load: load-backend load-frontend ## Load both images into the kind cluster

.PHONY: load-backend
load-backend:
	@echo "→ Loading backend into kind cluster '$(CLUSTER)'..."
	kind load docker-image $(BACKEND_IMG) --name $(CLUSTER)

.PHONY: load-frontend
load-frontend:
	@echo "→ Loading frontend into kind cluster '$(CLUSTER)'..."
	kind load docker-image $(FRONTEND_IMG) --name $(CLUSTER)

# ── Helm targets ──────────────────────────────────────────────────────────────

.PHONY: install
install:
	@echo "→ Installing Helm release '$(RELEASE)'..."
	helm install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		$(HELM_FLAGS)

.PHONY: upgrade
upgrade:
	@echo "→ Upgrading Helm release '$(RELEASE)'..."
	helm upgrade $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		$(HELM_FLAGS)

.PHONY: uninstall
uninstall:
	@echo "→ Uninstalling release '$(RELEASE)'..."
	helm uninstall $(RELEASE) --namespace $(NAMESPACE)

.PHONY: status
status: ## Show pods, services, and Helm release status
	@helm status $(RELEASE) --namespace $(NAMESPACE)
	@echo ""
	@kubectl get pods,svc --namespace $(NAMESPACE) -l app.kubernetes.io/instance=$(RELEASE)

.PHONY: open
open: ## Port-forward the frontend and open it in the browser
	@echo "→ Port-forwarding to http://localhost:8888 (Ctrl+C to stop)"
	@kubectl port-forward svc/$(RELEASE)-porter-galaxy-frontend 8888:80 --namespace $(NAMESPACE)

.PHONY: logs-backend
logs-backend: ## Stream backend logs
	kubectl logs -f -l app.kubernetes.io/instance=$(RELEASE),app.kubernetes.io/component=backend --namespace $(NAMESPACE)

.PHONY: logs-frontend
logs-frontend: ## Stream frontend (nginx) logs
	kubectl logs -f -l app.kubernetes.io/instance=$(RELEASE),app.kubernetes.io/component=frontend --namespace $(NAMESPACE)

# ── Chart Museum targets ──────────────────────────────────────────────────────

.PHONY: chartmuseum-start
chartmuseum-start: ## Start a local Chart Museum on port 8080
	@echo "→ Starting Chart Museum on $(CHARTMUSEUM)..."
	@mkdir -p chartstorage
	docker run -d --name chartmuseum -p 8080:8080 \
		-e DEBUG=true \
		-e STORAGE=local \
		-e STORAGE_LOCAL_ROOTDIR=/charts \
		-v $(PWD)/chartstorage:/charts \
		ghcr.io/helm/chartmuseum:latest
	@echo "Chart Museum is running at $(CHARTMUSEUM)"

.PHONY: chartmuseum-stop
chartmuseum-stop: ## Stop and remove the Chart Museum container
	docker rm -f chartmuseum

.PHONY: chart-package
chart-package: ## Package the chart into a .tgz
	helm package $(CHART)

.PHONY: chart-push
chart-push: chart-package ## Package and push the chart to local Chart Museum
	@echo "→ Pushing chart to Chart Museum..."
	curl --silent --show-error --data-binary @$(CHART_PKG) $(CHARTMUSEUM)/api/charts
	@echo ""

.PHONY: chart-repo-add
chart-repo-add: ## Register the local Chart Museum as a Helm repo
	helm repo add local-charts $(CHARTMUSEUM)
	helm repo update

# ── Validation ────────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Lint the Helm chart
	helm lint $(CHART)

.PHONY: template
template: ## Preview all Kubernetes manifests the chart would produce
	helm template $(RELEASE) $(CHART) $(HELM_FLAGS)

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Common workflows:"
	@echo "  make up          Build + load + install (first time)"
	@echo "  make dev         Rebuild + upgrade (after code changes)"
	@echo "  make open        Port-forward and open the UI"
	@echo "  make down        Remove everything from the cluster"
	@echo ""
	@echo "All targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'
	@echo ""

.DEFAULT_GOAL := help
