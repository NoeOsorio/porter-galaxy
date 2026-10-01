# Contract: Object Details (`GET /api/v1/objects?key=<object key>`)

Behind the session middleware (spec 005). Read from the informer caches; returns only the fields
below. Anything not listed (including `env`, `command`, `args`, annotations, and Secret or
ConfigMap contents) is never sent.

| Response | When |
| --- | --- |
| `200` JSON below | The key names a cached Pod, workload, or Node |
| `400` `{"error": "unsupported kind"}` | Any other kind |
| `404` `{"error": "not found"}` | Not in the cache (deleted, or not synced yet) |
| `401` | No session |

## Pod

```jsonc
{
  "key": "pod/default/web-7d9-abc",
  "node": "node-a",
  "startedAt": "2026-10-01T12:00:00Z",
  "labels": { "app": "web" },
  "containers": [
    {
      "name": "web",
      "image": "ghcr.io/example/web:1.4.2",
      "ports": [{ "name": "http", "containerPort": 8080, "protocol": "TCP" }],
      "requests": { "cpuMillis": 100, "memoryBytes": 134217728 },
      "limits": { "memoryBytes": 268435456 },
      "readiness": { "type": "http", "path": "/healthz", "port": "http", "periodSeconds": 10 },
      "liveness": null,
      "restarts": 0
    }
  ]
}
```

`initContainers` use the same shape. Probe `type` is `http`, `tcp`, `grpc`, or `exec`; for `exec`
only the type is sent, never the command.

## Workload (Deployment, StatefulSet, DaemonSet, Job, CronJob)

```jsonc
{
  "key": "deployment/default/web",
  "labels": { "app": "web" },
  "selector": { "app": "web" },
  "replicas": 3,               // absent for DaemonSet, Job, CronJob
  "strategy": "RollingUpdate", // update strategy type, or the CronJob schedule
  "images": ["ghcr.io/example/web:1.4.2"]
}
```

## Node

```jsonc
{ "key": "node/_/node-a", "labels": { "kubernetes.io/arch": "amd64" }, "kubeletVersion": "v1.30.4", "pods": 18 }
```

Labels are copied as-is; label values are visible to anyone who can list the object and are not
treated as secret.
