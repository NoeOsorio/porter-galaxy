# Data Model: Workload Coverage and Health

Object keys and states follow spec 001 ([data-model](../001-truthful-graph-and-camera/data-model.md)).
New key kinds: `statefulset`, `daemonset`, `job`, `cronjob`, `pvc`, `configmap`, `secret`, `hpa`,
`networkpolicy`, `namespace`.

## Workload

| Field | Meaning |
| --- | --- |
| `key`, `kind`, `namespace`, `name` | `kind` ∈ Deployment, StatefulSet, DaemonSet, Job, CronJob |
| `state` | See research R2 per kind |
| `desired`, `ready` | Replica counts (DaemonSet: desired/number ready; Job: completions/succeeded) |
| `owner` | `{kind, name}` for Jobs owned by a CronJob; absent otherwise |

## Pod (additions)

| Field | Meaning |
| --- | --- |
| `owner` | Now resolves to any workload kind (Pod → ReplicaSet → Deployment, Pod → Job → CronJob, …) |
| `restarts` | Sum of container restart counts |
| `lastTermination` | `{reason, exitCode, at}` of the most recent terminated container state, if any |
| `recentRestart` | Restarted within the last 10 minutes |
| `warnings` | Latest ≤ 10 Warning events: `{reason, message, count, lastSeen}` |
| `refs` | `{pvcs: string[], configMaps: string[], secrets: string[]}` (names only) |
| `requests` | `{cpuMillis, memoryBytes}` summed over containers |
| `usage` | `{cpuMillis, memoryBytes}` from the metrics API; absent when unavailable |

Workloads and nodes also carry `warnings`.

## Other objects

| List | Fields |
| --- | --- |
| `pvcs` | `key, namespace, name, phase, storageClass` |
| `hpas` | `key, namespace, name, target (workload key), min, max, current, desired` |
| `networkPolicies` | `key, namespace, name, podKeys (Pods it selects)` |
| `namespaces` | `key, name, phase` |

## Cluster (additions)

`metricsAvailable: boolean`.

## Limits

- ≤ 10 warnings per object, none older than 1 hour.
- References are names only; Secret and ConfigMap contents are never read.
