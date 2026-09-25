CLUSTER      ?= porter
RELEASE      ?= galaxy
NAMESPACE    ?= default
CHART        := ./charts/porter-galaxy

BACKEND_IMG  := porter-galaxy-backend:local
FRONTEND_IMG := porter-galaxy-frontend:local

CHART_REGISTRY ?= oci://ghcr.io/noeosorio/charts
CHART_REF      := $(CHART_REGISTRY)/porter-galaxy

# Helm flags for local dev (uses locally built images)
HELM_LOCAL := \
	--set backend.image.repository=porter-galaxy-backend \
	--set backend.image.tag=local \
	--set backend.image.pullPolicy=Never \
	--set frontend.image.repository=porter-galaxy-frontend \
	--set frontend.image.tag=local \
	--set frontend.image.pullPolicy=Never

# ── High-level dev targets ────────────────────────────────────────────────────

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

# ── Image targets (local dev) ─────────────────────────────────────────────────

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

# ── Helm targets (local dev) ──────────────────────────────────────────────────

.PHONY: install
install:
	@echo "→ Installing Helm release '$(RELEASE)'..."
	helm install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		$(HELM_LOCAL)

.PHONY: upgrade
upgrade:
	@echo "→ Upgrading Helm release '$(RELEASE)'..."
	helm upgrade $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		$(HELM_LOCAL)

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
open: ## Port-forward the frontend to http://localhost:8888
	@echo "→ Port-forwarding to http://localhost:8888 (Ctrl+C to stop)"
	@kubectl port-forward svc/$(RELEASE)-porter-galaxy-frontend 8888:80 --namespace $(NAMESPACE)

.PHONY: logs-backend
logs-backend: ## Stream backend logs
	kubectl logs -f -l app.kubernetes.io/instance=$(RELEASE),app.kubernetes.io/component=backend --namespace $(NAMESPACE)

.PHONY: logs-frontend
logs-frontend: ## Stream frontend (nginx) logs
	kubectl logs -f -l app.kubernetes.io/instance=$(RELEASE),app.kubernetes.io/component=frontend --namespace $(NAMESPACE)

# ── Production targets ────────────────────────────────────────────────────────

# Usage:
#   make install-prod INGRESS_HOST=galaxy.yourdomain.com
#   make install-prod INGRESS_HOST=galaxy.yourdomain.com INGRESS_CLASS=nginx
.PHONY: install-prod
install-prod: ## Install the chart from GHCR (OCI) into the current cluster context
	@if [ -z "$(INGRESS_HOST)" ]; then \
		echo "Error: INGRESS_HOST is required."; \
		echo "Usage: make install-prod INGRESS_HOST=galaxy.yourdomain.com"; \
		exit 1; \
	fi
	helm install $(RELEASE) $(CHART_REF) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set ingress.enabled=true \
		--set ingress.host=$(INGRESS_HOST) \
		$(if $(INGRESS_CLASS),--set ingress.className=$(INGRESS_CLASS),)

# Usage:
#   make upgrade-prod VERSION=1.2.0
#   make upgrade-prod            ← re-applies current chart version
.PHONY: upgrade-prod
upgrade-prod: ## Upgrade the production release to a new chart version
	helm upgrade $(RELEASE) $(CHART_REF) \
		--namespace $(NAMESPACE) \
		--reuse-values \
		$(if $(VERSION),--version $(VERSION),)
	@echo ""
	@echo "Upgrade complete. Check rollout:"
	@echo "  kubectl rollout status deployment -n $(NAMESPACE) -l app.kubernetes.io/instance=$(RELEASE)"

# ── Release workflow ──────────────────────────────────────────────────────────

# Usage: make release VERSION=1.2.0
# This bumps Chart.yaml, commits, tags, and pushes — which triggers the publish CI.
.PHONY: release
release: ## Tag a new release (triggers CI to build images + publish chart)
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required."; \
		echo "Usage: make release VERSION=1.2.0"; \
		exit 1; \
	fi
	@echo "→ Bumping chart version to $(VERSION)..."
	@sed -i '' \
		-e "s/^version:.*/version: $(VERSION)/" \
		-e "s/^appVersion:.*/appVersion: \"$(VERSION)\"/" \
		$(CHART)/Chart.yaml
	@git add $(CHART)/Chart.yaml
	@git commit -m "chore: release v$(VERSION)"
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin HEAD "v$(VERSION)"
	@echo ""
	@echo "Tag v$(VERSION) pushed — CI will build images and publish the chart."
	@echo "Watch: https://github.com/noeosorio/porter-galaxy/actions"

# ── Chart registry (OCI on GHCR) ──────────────────────────────────────────────

.PHONY: chart-package
chart-package: ## Package the chart into a .tgz
	helm package $(CHART)

# Requires a prior `helm registry login ghcr.io` with a token that has write:packages.
.PHONY: chart-push
chart-push: chart-package ## Push the packaged chart to $(CHART_REGISTRY)
	@CHART_TGZ=$$(ls porter-galaxy-*.tgz | sort -V | tail -1); \
	helm push $$CHART_TGZ $(CHART_REGISTRY)

# ── Validation ────────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Lint the Helm chart
	helm lint $(CHART)

.PHONY: template
template: ## Preview all Kubernetes manifests the chart would produce
	helm template $(RELEASE) $(CHART) $(HELM_LOCAL)

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Local dev:"
	@echo "  make up                         Build + load into kind + install"
	@echo "  make dev                         Rebuild + upgrade after code changes"
	@echo "  make open                        Port-forward to http://localhost:8888"
	@echo "  make down                        Remove from cluster"
	@echo ""
	@echo "Production:"
	@echo "  make release VERSION=1.2.0       Tag + push → triggers CI"
	@echo "  make install-prod INGRESS_HOST=… Install from GHCR (OCI) in any cluster"
	@echo "  make upgrade-prod [VERSION=…]    Upgrade prod release"
	@echo ""
	@echo "Chart registry:"
	@echo "  make chart-push                  Package + push chart to GHCR (OCI)"
	@echo ""
	@echo "All targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-26s %s\n", $$1, $$2}'
	@echo ""

.DEFAULT_GOAL := help
