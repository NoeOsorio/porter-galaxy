# Quickstart: verify each slice

## Every slice

```bash
make verify          # gates + fake-stream checks
```

Then deploy: `make release VERSION=<x.y.z>`, set the Porter add-on's **Chart Version**, sign in, and
use the app. `pk` = `porter kubectl --project <project-id> --cluster <cluster-id> --`.

## §1 Focus a namespace (US1, 0.17.0)

1. In Topology, click a namespace's label: its workloads and pods stay, every other namespace shows
   as one labeled dot, and the camera frames the focused one. Repeat in Clusters.
2. Press Escape with a pod selected: the selection clears. Press Escape again: every namespace
   returns and the camera frames the cluster.
3. Orbit while focused at 3,000 pods (`make verify` perf with focus): ≥ 30 fps.

## §2 Details panel (US2, 0.18.0)

1. Select a Pod: images, ports, requests and limits, probes, labels, node, restarts, and Warning
   events show. No environment values, commands, arguments, or annotations appear anywhere.
2. `curl -b <session> '<url>/api/v1/objects?key=pod/<ns>/<pod>'` returns only the fields in
   contracts/object-details.md; without a session it returns 401.
3. "Copy logs command" and paste it in a terminal: it prints that Pod's logs.

## §3 Share links (US3a, 0.19.0)

1. Select a Pod, focus its namespace, click "Copy link", and open it in a private window: the
   login shows; after signing in, the same Pod is selected and framed.
2. Delete that Pod and open the link again: the namespace opens with "That object no longer
   exists".

## §4 Replay (US3b, 0.20.0)

1. Keep the app open, then roll out a Deployment
   (`pk rollout restart deploy/<name> -n <ns>`, on a test workload you own).
2. Scrub the timeline back: the old Pods reappear and the new ones disappear in order; "Live"
   returns to the current state.
3. After 30 minutes at 3,000 pods with 500 ms churn on the fake stream, tab memory stays under 50 MB.
