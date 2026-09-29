# Contract: Cluster Stream (SSE `GET /api/v1/clusters`)

Replaces the spec 001 snapshot contract. Backend and frontend ship in the same chart release.

## Transport

- `Content-Type: text/event-stream`, `Content-Encoding: gzip` when the request sends
  `Accept-Encoding: gzip` (browsers do). The backend flushes the gzip writer after every event.
- Each event has an SSE `event:` name: `snapshot` or `patch`. A comment line (`: ping`) keeps the
  connection alive every 30 s.

## `snapshot`

```jsonc
{ "version": 41, "clusters": [ /* Cluster, see data-model.md */ ] }
```

Sent once per connection, and again when the server detects the client missed a patch.

## `patch`

```jsonc
{
  "base": 41,
  "version": 42,
  "clusters": [
    {
      "id": "in-cluster",
      "upsert": { "pods": [ /* full Pod objects */ ], "workloads": [] },
      "remove": { "pods": ["pod/default/web-7d9-abc"] },
      "fields": { "metricsAvailable": true }
    }
  ],
  "addedClusters": [],
  "removedClusters": []
}
```

- Object lists: `nodes`, `pods`, `workloads`, `loadBalancers`, `pvcs`, `hpas`,
  `networkPolicies`, `namespaces`, `topology`. Objects are matched by `key`; topology links by
  `from|to`.
- An object is upserted when any field changed; clients replace it whole.
- The client applies a patch only if `base` equals the version it holds; otherwise it closes the
  stream and reconnects (receiving a fresh `snapshot`).

## Removed

- `deployments` (now `workloads` with `kind: "Deployment"`).
- `metrics` placeholder map (replaced by per-Pod `usage` and `metricsAvailable`).
