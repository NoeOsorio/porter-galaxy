# Porter Galaxy — Deployment Manual

This guide covers everything needed to go from source code to a publicly installable Helm chart — the same way you'd install Grafana or Prometheus.

---

## How the pieces fit together

```
GitHub Actions
  ├── builds Docker images → ghcr.io/noeosorio/porter-galaxy-{backend,frontend}
  └── packages Helm chart  → oci://ghcr.io/noeosorio/charts/porter-galaxy

Anyone installs with:
  helm install galaxy oci://ghcr.io/noeosorio/charts/porter-galaxy
```

Both the images and the chart live in **GitHub Container Registry (GHCR)**. Helm 3.8+ pulls charts from OCI registries directly, so there is no chart server to run, no domain to set up, and no `helm repo add` step.

---

## Prerequisites

- A Kubernetes cluster (with an Ingress controller if you want a public hostname — Porter clusters have nginx by default)
- `kubectl` configured to point to that cluster
- `helm` v3.8 or newer installed locally

No extra GitHub secrets are needed: CI pushes images and the chart with the built-in `GITHUB_TOKEN`.

---

## Part 1 — Ship your first release

> **TL;DR — pushing code does NOT publish anything.**
> The CI workflow (`.github/workflows/publish.yml`) only runs on **git tags matching `v*.*.*`**. Merging to `main` does nothing on its own. You ship by tagging.

This is the only command you run to publish a new version:

```bash
make release VERSION=1.0.0
```

What it does under the hood:

1. Bumps `version` and `appVersion` in `charts/porter-galaxy/Chart.yaml`
2. Creates a release commit and a `v1.0.0` tag
3. Pushes both to GitHub

GitHub Actions then takes over and:

1. Builds `ghcr.io/noeosorio/porter-galaxy-backend:1.0.0` (plus `:1.0` and `:latest`) and pushes to GHCR
2. Builds `ghcr.io/noeosorio/porter-galaxy-frontend:1.0.0` (same tags) and pushes to GHCR
3. Packages the Helm chart and pushes it to `oci://ghcr.io/noeosorio/charts/porter-galaxy` as version `1.0.0`

You can watch it run at: `https://github.com/noeosorio/porter-galaxy/actions`

---

## Part 2 — Check the packages are public

Packages that the workflow pushes with `GITHUB_TOKEN` inherit the repository's visibility. On a public repo, the chart and both images are public as soon as the first release finishes, and there's nothing to do.

If your repo (or fork) is private, the packages are private too. Anonymous `helm install` then fails with `401`/`403`, and so does Porter's custom Helm chart add-on, which pulls without credentials. To fix it, go to **GitHub → your profile → Packages** and for each of:

- `charts/porter-galaxy`
- `porter-galaxy-backend`
- `porter-galaxy-frontend`

open **Package settings → Change visibility → Public**. Later releases keep the visibility.

Verify from a machine that isn't logged in to GHCR:

```bash
helm show chart oci://ghcr.io/noeosorio/charts/porter-galaxy --version 1.0.0
```

---

## Part 3 — Install the chart in any cluster

Once published, anyone (including you) installs it like this:

```bash
helm install galaxy oci://ghcr.io/noeosorio/charts/porter-galaxy \
  --version 1.0.0 \
  --namespace porter-galaxy \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=galaxy.theirdomain.com
```

Leave out `--version` to get the latest release.

Or using the Makefile:

```bash
make install-prod INGRESS_HOST=galaxy.theirdomain.com NAMESPACE=porter-galaxy
```

**Access without an Ingress (port-forward):**

```bash
kubectl port-forward svc/galaxy-porter-galaxy-frontend 8080:80 -n porter-galaxy
# Open http://localhost:8080
```

### Installing as a Porter add-on

Step-by-step fields and the values to paste are in the README: **[Deploy on Porter](README.md#deploy-on-porter-no-cli-needed)**. Use the chart version without a leading `v`.

Porter downloads the chart from its own backend, not from your cluster, and without credentials — so the package must be public (Part 2).

---

## Part 4 — How to update the chart

> **Releases are tag-driven, not push-driven.**
> Pushing to `main` does **not** rebuild images or publish a new chart version. The `Publish` workflow only fires when you push a `v*.*.*` git tag. Use `make release VERSION=X.Y.Z` (or `git tag vX.Y.Z && git push origin vX.Y.Z` if you want to skip the Makefile). Without a tag, GHCR stays on the previous version forever.

### For a new release (code change or new feature):

```bash
# 1. Make your code changes and merge to main
# 2. When ready to release, cut a tag — this is what triggers CI:
make release VERSION=1.1.0
#   ↳ bumps Chart.yaml, commits, creates tag v1.1.0, pushes tag
#   ↳ GitHub Actions then builds images + publishes the chart

# Equivalent without the Makefile:
git tag v1.1.0
git push origin v1.1.0
```

Then upgrade any running install:

```bash
# Upgrade (picks up new images automatically via appVersion)
helm upgrade galaxy oci://ghcr.io/noeosorio/charts/porter-galaxy \
  --version 1.1.0 --namespace porter-galaxy --reuse-values

# Or with the Makefile:
make upgrade-prod VERSION=1.1.0 NAMESPACE=porter-galaxy
```

### For a config-only change (no code change):

If you just want to change a value (e.g., enable ingress, change resource limits) without cutting a new release:

```bash
helm upgrade galaxy oci://ghcr.io/noeosorio/charts/porter-galaxy \
  --namespace porter-galaxy \
  --reuse-values \
  --set ingress.enabled=true \
  --set ingress.host=galaxy.newdomain.com
```

### How versioning works

```
Chart.yaml
  version: 1.1.0     ← the chart version (the OCI tag in GHCR)
  appVersion: 1.1.0  ← becomes the Docker image tag

Deployment uses:
  image: ghcr.io/noeosorio/porter-galaxy-backend:1.1.0
```

CI sets both from the git tag (`v1.1.0` → `1.1.0`). You never touch image tags manually.

---

## Rollback

If something goes wrong after an upgrade:

```bash
# See revision history
helm history galaxy -n porter-galaxy

# Roll back to the previous version
helm rollback galaxy -n porter-galaxy

# Roll back to a specific revision number
helm rollback galaxy 2 -n porter-galaxy
```

Helm keeps a full history of every install/upgrade so rollback is instant.

---

## Useful day-to-day commands

```bash
# See what's running
make status

# Tail backend logs
make logs-backend

# Tail frontend/nginx logs
make logs-frontend

# Preview what a helm upgrade would change (dry run)
helm diff upgrade galaxy oci://ghcr.io/noeosorio/charts/porter-galaxy --reuse-values
# (requires: helm plugin install https://github.com/databus23/helm-diff)

# Inspect a published chart version
helm show chart oci://ghcr.io/noeosorio/charts/porter-galaxy --version 1.1.0
```

Published chart versions are listed on the package page: `https://github.com/noeosorio/porter-galaxy/pkgs/container/charts%2Fporter-galaxy`.

---

## Troubleshooting

**`helm install` or Porter says the chart is not found / `401` / `403`**
The chart package is still private. Make it public (Part 2). To pull a private chart with Helm, log in first: `echo $GITHUB_PAT | helm registry login ghcr.io -u YOUR_USER --password-stdin`. Porter add-ons can't use credentials.

**Pods stuck in `ImagePullBackOff`**
The image packages are private, or the tag doesn't exist. Check `kubectl describe pod <pod-name> -n porter-galaxy`. Either make the images public or create an `imagePullSecret` (see the README).

**A release tag didn't publish a new chart**
The chart push in CI may have failed. Check GitHub Actions logs. You can also push manually:

```bash
echo $GITHUB_PAT | helm registry login ghcr.io -u YOUR_USER --password-stdin   # PAT with write:packages
make chart-push
```

**Backend pods crash on startup**
The backend needs RBAC access to list Kubernetes resources. The chart creates a `ClusterRole` and `ClusterRoleBinding` automatically — check they exist:

```bash
kubectl get clusterrole,clusterrolebinding | grep porter-galaxy
```
