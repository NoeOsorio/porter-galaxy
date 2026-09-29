# Quickstart: verify each slice

## Every slice

```bash
make verify          # gates + fake-stream checks (waits its turn if another run is active)
```

Then deploy: `make release VERSION=<x.y.z>`, set the Porter add-on's **Chart Version**, and open
the app. `pk` = `porter kubectl --project 1 --cluster 1 --`.

## §1 Every workload kind (US1, 0.9.0)

1. `pk get pods -A -o jsonpath='{range .items[*]}{.metadata.ownerReferences[0].kind}{"\n"}{end}' | sort | uniq -c`
   — every owner kind listed appears as a workload kind in Clusters, and Galaxy shows no
   standalone Pod that has an owner (SC-001).
2. The `test-postgres` StatefulSet (or any StatefulSet) appears with its Pods in both views; in
   Topology it sits under its Service.
3. DaemonSet Pods (`kube-proxy`, `aws-node`) appear under their DaemonSet in Clusters.
4. Create a CronJob that runs every minute:
   `pk create cronjob galaxy-tick -n default --image=busybox --schedule="*/1 * * * *" -- /bin/true`;
   after two runs, Clusters shows CronJob → 2 Jobs → completed Pods. Delete it afterwards.
5. Select a Pod with a PVC or ConfigMap: its references are drawn; deselect and they disappear.

## §2 Stream patches (0.10.0)

1. `curl -s --compressed -N <url>/api/v1/clusters | head -c 300` shows `event: snapshot` first.
2. With `?stats`, the console logs bytes received per minute; in steady state it is ≥ 80% lower
   than 0.9.0's full-snapshot rate on the same cluster (SC-003). Record both numbers.
3. Restart the backend: the client resyncs from a new snapshot and the graph stays correct.

## §3 Health (US2, 0.11.0)

1. `pk run galaxy-crash -n default --image=busybox --restart=Always -- /bin/false`: within 5 s of
   its first restart it pulses and is marked failed (SC-002); its panel shows restarts, last
   reason, and the latest Warning events.
2. `pk run galaxy-oom -n default --image=polinux/stress --limits=memory=20Mi -- stress --vm 1 --vm-bytes 64M`:
   the panel shows `OOMKilled` as the last termination reason.
3. Delete both Pods.

## §4 Usage (US3, 0.12.0)

1. With metrics-server (present on the reference cluster), busy Pods are visibly larger or
   brighter than idle ones.
2. On `make up` (kind, no metrics-server) the legend says usage encoding is off and how to enable
   it.
