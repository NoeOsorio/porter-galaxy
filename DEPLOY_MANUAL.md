# Porter Galaxy — Deployment Manual

This guide covers everything needed to go from source code to a publicly installable Helm chart — the same way you'd install Grafana or Prometheus.

---

## How the pieces fit together

```
GitHub Actions
  ├── builds Docker images → GHCR (public image registry)
  └── packages Helm chart  → Chart Museum (your cluster)

Anyone installs with:
  helm repo add porter-galaxy https://charts.noeosorio.com
  helm install galaxy porter-galaxy/porter-galaxy
```

**Chart Museum** is a small server that stores and serves Helm charts over HTTP. You run it once in your own Kubernetes cluster. After that, every `make release` pushes a new chart version to it automatically.

---

## Prerequisites

- A Kubernetes cluster with an nginx Ingress controller (Porter clusters have this by default)
- `kubectl` configured to point to that cluster
- `helm` v3 installed locally
- A domain name you control (explained below)
- Your GitHub repo's **Settings → Secrets → Actions** open in a browser tab

---

## Part 1 — Get a domain for Chart Museum

Chart Museum needs to be reachable over HTTPS so anyone can `helm repo add` it. You need a real domain pointing to your cluster's load balancer.

### Step 1a — Find your cluster's external IP

```bash
kubectl get svc -A | grep LoadBalancer
```

Look for the `EXTERNAL-IP` column — it will be an IP address or a hostname (AWS gives a hostname, GCP/Azure/DigitalOcean give an IP). Copy it.

If you see `<pending>`, your cluster doesn't have a cloud load balancer provisioned yet. On Porter this is usually already set up.

### Step 1b — Set up a DNS record

Go to wherever your domain's DNS is managed (Cloudflare, Route 53, GoDaddy, Namecheap, etc.) and create:


| Type | Name     | Value              |
| ---- | -------- | ------------------ |
| `A`  | `charts` | `YOUR_EXTERNAL_IP` |


> If your load balancer gives a **hostname** instead of an IP (common on AWS), create a `CNAME` record instead of an `A` record.

This makes `charts.noeosorio.com` resolve to your cluster. Within a few minutes (up to 24h depending on your registrar), the domain is live.

**Don't have a domain yet?** The cheapest option is to buy one from Namecheap (~$1/year for `.xyz`) or use a free subdomain service like `nip.io` for testing: `charts.YOUR_IP.nip.io` works immediately with no DNS config.

---

## Part 2 — Install Chart Museum in your cluster (one-time setup)

This is a standard `helm install` — same as installing any other tool.

```bash
# Add the Chart Museum Helm repo
porter helm -- repo add chartmuseum https://chartmuseum.github.io/charts
porter helm -- repo update

# Install Chart Museum
# The -- separator tells the Porter CLI to pass everything after it directly to helm
porter helm -- install chartmuseum chartmuseum/chartmuseum \
  --namespace default \
  --set env.open.STORAGE=local \
  --set env.open.DISABLE_API=false \
  --set env.open.ALLOW_OVERWRITE=true \
  --set env.secret.BASIC_AUTH_USER=admin \
  --set env.secret.BASIC_AUTH_PASS=CHANGE_ME \
  --set persistence.enabled=true \
  --set persistence.size=5Gi \
  --set ingress.enabled=true \
  --set 'ingress.hosts[0].name=charts.noeosorio.com' \
  --set 'ingress.hosts[0].path=/'
```

Replace `charts.noeosorio.com` and `CHANGE_ME` with your actual values.

**Verify it's running:**

```bash
kubectl get pods -n chartmuseum
# Should show chartmuseum pod as Running

curl https://charts.noeosorio.com/index.yaml
# Should return an empty chart index (YAML with no entries yet)
```

---

## Part 3 — Add GitHub secrets

These are used by the CI workflow to push images and the chart automatically.

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** and add:


| Secret name        | Value                           |
| ------------------ | ------------------------------- |
| `CHARTMUSEUM_URL`  | `https://charts.noeosorio.com` |
| `CHARTMUSEUM_USER` | `admin` (or what you set above) |
| `CHARTMUSEUM_PASS` | the password you set above      |


`GITHUB_TOKEN` is provided automatically by GitHub — you don't need to add it.

---

## Part 4 — Ship your first release

> **TL;DR — pushing code does NOT publish anything.**
> The CI workflow (`.github/workflows/publish.yml`) only runs on **git tags matching `v*.*.*`**. Merging to `main` does nothing on its own. You ship by tagging.

This is the only command you run to publish a new version:

```bash
make release VERSION=1.0.0
```

What it does under the hood:

1. Bumps `version` and `appVersion` in `charts/porter-galaxy/Chart.yaml`
2. Creates a `v1.0.0` git commit and tag
3. Pushes both to GitHub

GitHub Actions then takes over and:

1. Builds `ghcr.io/noeosorio/porter-galaxy-backend:v1.0.0` and pushes to GHCR
2. Builds `ghcr.io/noeosorio/porter-galaxy-frontend:v1.0.0` and pushes to GHCR
3. Packages the Helm chart and pushes `porter-galaxy-1.0.0.tgz` to Chart Museum

You can watch it run at: `https://github.com/noeosorio/porter-galaxy/actions`

When the workflow is green, the chart is live at `https://charts.noeosorio.com`.

---

## Part 5 — Install the chart in any cluster

Once published, anyone (including you) installs it like this:

```bash
# Register your Chart Museum as a Helm repo (once per machine)
helm repo add porter-galaxy https://charts.noeosorio.com
helm repo update

# Install
helm install galaxy porter-galaxy/porter-galaxy \
  --namespace porter-galaxy \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=galaxy.theirdomain.com
```

Or using the Makefile (after setting `CHARTMUSEUM_REMOTE`):

```bash
make chart-repo-add CHARTMUSEUM_REMOTE=https://charts.noeosorio.com
make install-prod INGRESS_HOST=galaxy.theirdomain.com
```

**Access without an Ingress (port-forward):**

```bash
kubectl port-forward svc/galaxy-porter-galaxy-frontend 8080:80 -n porter-galaxy
# Open http://localhost:8080
```

---

## Part 6 — How to update the chart

> **Releases are tag-driven, not push-driven.**
> Pushing to `main` does **not** rebuild images or publish a new chart version. The `Publish` workflow only fires when you push a `v*.*.*` git tag. Use `make release VERSION=X.Y.Z` (or `git tag vX.Y.Z && git push origin vX.Y.Z` if you want to skip the Makefile). Without a tag, GHCR and Chart Museum stay on the previous version forever.

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

That's it. CI builds new images, pushes a new chart version. Then upgrade any running install:

```bash
# Pull the updated chart index
helm repo update

# Upgrade (picks up new images automatically via appVersion)
helm upgrade galaxy porter-galaxy/porter-galaxy --namespace porter-galaxy --reuse-values

# Or with the Makefile:
make upgrade-prod VERSION=1.1.0
```

### For a config-only change (no code change):

If you just want to change a value (e.g., enable ingress, change resource limits) without cutting a new release:

```bash
helm upgrade galaxy porter-galaxy/porter-galaxy \
  --namespace porter-galaxy \
  --reuse-values \
  --set ingress.enabled=true \
  --set ingress.host=galaxy.newdomain.com
```

### How versioning works

```
Chart.yaml
  version: 1.1.0     ← the chart version (tracks Chart Museum)
  appVersion: v1.1.0 ← becomes the Docker image tag

Deployment uses:
  image: ghcr.io/noeosorio/porter-galaxy-backend:v1.1.0
```

`make release VERSION=1.1.0` updates both. You never touch image tags manually.

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
helm diff upgrade galaxy porter-galaxy/porter-galaxy --reuse-values
# (requires: helm plugin install https://github.com/databus23/helm-diff)

# See all chart versions available in Chart Museum
helm search repo porter-galaxy --versions
```

---

## Troubleshooting

**Pods stuck in `ImagePullBackOff`**
The GHCR images are public by default for public repos. If your repo is private, you need to create an `imagePullSecret`. Check: `kubectl describe pod <pod-name> -n porter-galaxy`.

**Chart Museum returns 401**
You're hitting the basic auth. All `curl` pushes and `helm repo add` calls need credentials:

```bash
helm repo add porter-galaxy https://charts.noeosorio.com \
  --username admin --password YOURPASS
```

`**helm repo update` shows no new versions**
The chart push in CI may have failed. Check GitHub Actions logs. You can also push manually: `make chart-push-remote CHARTMUSEUM_PASS=yourpass`.

**Backend pods crash on startup**
The backend needs RBAC access to list Kubernetes resources. The chart creates a `ClusterRole` and `ClusterRoleBinding` automatically — check they exist:

```bash
kubectl get clusterrole,clusterrolebinding | grep porter-galaxy
```

