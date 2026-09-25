# Quickstart: verify each slice on a real cluster

Run the gates before opening a PR, then walk the section for your slice on the deployed app.

## Gates (every slice)

```bash
(cd backend && go build ./... && go vet ./...)
(cd frontend && npm run build && npm run lint)
helm lint charts/porter-galaxy
```

## Deploy

1. Merge the slice, then `make release VERSION=<x.y.z>` from `main`.
2. In Porter: **Add-ons → porter-galaxy → Configuration**, set **Chart Version** to `<x.y.z>`,
   **Review changes → Deploy changes**, and wait for **Deployed**.
3. Open the app URL (see the README's "Deploy on Porter" section).

Reference counts (`pk` = `porter kubectl --project 1 --cluster 1 --`):

```bash
pk get deploy -A --no-headers | wc -l
pk get pods -A --no-headers | wc -l
pk get pods -A --field-selector=status.phase=Succeeded --no-headers
```

## §1 Truthful graph (US1, 0.3.0)

1. Clusters view → Overview: deployments and pods match the `pk` counts above.
2. Search each Deployment name from `pk get deploy -A`; each returns exactly one Deployment.
3. Topology view: `grafana` appears with its Pod, linked to its Service.
4. Create two same-named Pods in two namespaces:
   `pk run dup --image=nginx -n default` and `pk run dup --image=nginx -n kube-public`.
   Both appear, each labeled with its namespace. Delete them afterwards.
5. Any Succeeded Pod from the command above is drawn in the "completed" color, not red.
6. The load balancer node reads `ingress-nginx/ingress-nginx-controller`; its detail panel shows
   the ELB hostname.
7. `pk get pods -n default -l app.kubernetes.io/component=backend` → pod is Ready only after the
   backend logs cache sync; `curl <url>/api/v1/clusters` never returns an empty first snapshot.

## §2 Stable shell (US2, 0.4.0)

1. DevTools → Network, disable cache, reload: a loading indicator appears immediately; the main JS
   response has `Content-Encoding: gzip` and a transfer size ≤ 685 KB.
2. Switch Topology ↔ Clusters 10 times: Console has no `Context Lost`; Network shows one
   `/api/v1/clusters` EventStream request.
3. `pk rollout restart deploy -n default porter-galaxy-backend`: the indicator shows
   "reconnecting" then "live"; no error overlay remains.
4. `pk scale deploy -n default porter-galaxy-backend --replicas=0`: after 30 s the indicator shows
   "offline" with the last update time and the graph stays visible. Scale back to 1: it returns to
   "live".

## §3 Camera (US3, 0.5.0)

1. Load each view: all nodes are inside the viewport with a margin.
2. Rotate and zoom out, press `R` and then "Reset view": the camera returns in under 1 s.
3. Click three nodes in quick succession: each click redirects the flight smoothly, no jump.
4. Search `deployment/default/grafana` + Enter (one match): the camera centers it and opens its
   detail panel. Search `grafana` (ingress, service, deployment, and pod match): the camera frames
   all matches. Search `zzz`: "No matches" and the camera stays.
5. Scroll 5 steps in and out: the distance visibly changes each step and stops at the limits.
6. Resize the window to a wide and a tall shape: nodes stay round.
