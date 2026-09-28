# Quickstart: verify each slice

Run in a **visible** browser tab: hidden tabs pause `requestAnimationFrame`, so frame rates and
transitions cannot be judged there.

## Gates (every slice)

```bash
(cd backend && go build ./... && go vet ./...)
(cd frontend && npm run build && npm run lint)
helm lint charts/porter-galaxy
```

## Load setup (fake stream)

```bash
(cd backend && go run ./cmd/fakestream -pods 1000 -namespaces 20 -churn 500ms)
(cd frontend && VITE_API_URL=http://localhost:4078 npm run build && npx vite preview --port 5199)
# open http://localhost:5199/?stats
```

## Deploy (every slice)

`make release VERSION=<x.y.z>`, then in Porter: **Add-ons → porter-galaxy → Configuration →
Chart Version** `<x.y.z>` → **Review changes → Deploy changes**, and open the app URL.

## §1 Large clusters stay smooth (US1, 0.6.0)

**Baseline (0.5.x renderer, 2026-09-28).** Headless Chrome (ANGLE Metal, Apple M4 Max), 1456×830,
10 s drag-orbit per view, measured with `requestAnimationFrame`. "CPU ×4" uses CDP CPU throttling to
approximate a typical laptop; the M4 Max alone hits the 60 Hz cap at 1,000 pods.

| Load | CPU | Topology avg fps / p99 ms | Clusters avg fps / p99 ms |
| --- | --- | --- | --- |
| 1,000 pods, no churn | ×1 | 59.5 / 16.8 | 60.1 / 16.8 |
| 1,000 pods, churn 500 ms | ×1 | 60.0 / 16.8 | 60.1 / 16.8 |
| 3,000 pods, churn 500 ms | ×1 | 34.9 / 50.1 | 29.1 / 66.6 |
| 1,000 pods, no churn | ×4 | 23.4 / 83.4 | 21.5 / 83.4 |
| 1,000 pods, churn 500 ms | ×4 | 21.1 / 83.4 | 17.5 / 100.1 |

**US1 result (instanced renderer, same setup).** Every case holds the 60 Hz cap (avg 60 fps,
p99 16.8 ms, max 16.8 ms in both views), including the hardest one the baseline could not reach:

| Load | CPU | Topology avg fps / p99 ms | Clusters avg fps / p99 ms |
| --- | --- | --- | --- |
| 1,000 pods, churn 500 ms | ×1 | 60.1 / 16.8 | 60.1 / 16.8 |
| 3,000 pods, churn 500 ms | ×1 | 60.0 / 16.8 | 60.1 / 16.8 |
| 1,000 pods, churn 500 ms | ×4 | 60.1 / 16.8 | 60.0 / 16.8 |
| 3,000 pods, churn 500 ms | ×4 | 60.0 / 16.8 | 60.1 / 16.8 |


1. Fake stream at 1,000 pods, churn off (`-churn 0`): orbit continuously for 10 s in each view.
   The stats overlay stays ≥ 30 fps (target 60). Record the lowest value in the PR.
2. Same with `-churn 500ms`: no frame above 50 ms in the stats graph while orbiting.
3. `-pods 3000`: the app stays usable (≥ 20 fps); record the value.
4. Hover, click, double-click, search + Enter, Reset, and `R` behave as in 0.5.0 (spec 001 §3).
5. On the Porter add-on: both views show the same objects and colors as 0.5.0.

## §2 Stable, meaningful layout (US2, 0.7.0)

1. Fake stream at 1,000 pods, churn off: the layout settles in < 3 s after load.
2. Namespaces form visually separate groups in both views.
3. Restart the fake stream with `-churn 500ms -churn-size 1`. With `?stats`, the console logs
   `max unrelated displacement` per update: it stays < 5% of the view width.
4. Reload the page: namespaces appear in the same places.
5. On the Porter add-on: `pk scale deploy -n default web-server-web --replicas=3` — the new pods
   appear next to their Deployment and nothing else visibly jumps. Scale back afterwards.

## §3 Labels and 2D mode (US3, 0.8.0)

1. Full view at 1,000 pods: namespace labels and at least the 20 largest Deployments are
   labeled; no two labels overlap.
2. Zoom into one namespace: Pod names appear once close enough, still without overlaps.
3. Toggle 2D: Topology locks to the front view with tiers top to bottom; Clusters locks to the
   top view. Drag pans instead of rotating; zoom still works; toggle back restores 3D.
4. In a browser with WebGL disabled (Chrome: `--disable-webgl`), the app shows "Galaxy needs
   WebGL2" instead of a blank page.
