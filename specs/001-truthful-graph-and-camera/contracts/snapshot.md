# Contract: Cluster Snapshot (SSE `GET /api/v1/clusters`)

Each event's `data` is one JSON `Snapshot`. The backend and frontend ship in the same release, so
this contract changes in place; there is no versioned endpoint.

## Changes in this spec

Fields marked **new** are added; existing fields keep their meaning unless noted.

```jsonc
{
  "clusters": [
    {
      "id": "in-cluster",
      "nodes": [
        { "key": "node/_/ip-10-78-1-1",            // new
          "id": "ip-10-78-1-1",
          "state": "running",                      // new, see data-model.md State
          "capacity": { "cpu": "2", "memory": "3923812Ki" },
          "status": "Ready", "conditions": [] }
      ],
      "pods": [
        { "key": "pod/monitoring/grafana-5f7c9-abcde",   // new
          "id": "grafana-5f7c9-abcde",
          "namespace": "monitoring",
          "nodeId": "ip-10-78-1-1",
          "state": "running",                            // new
          "status": "Running",
          "owner": { "kind": "Deployment", "name": "grafana" },  // new
          "controllerId": "grafana" }                    // now derived from owner; kept for one release
      ],
      "deployments": [
        { "key": "deployment/monitoring/grafana",        // new
          "id": "grafana", "namespace": "monitoring",
          "state": "running",                            // new
          "desired": 1, "ready": 1, "available": 1 }
      ],
      "loadBalancers": [                                 // new
        { "key": "loadbalancer/ingress-nginx/ingress-nginx-controller",
          "displayName": "ingress-nginx/ingress-nginx-controller",
          "address": "k8s-...elb.us-east-1.amazonaws.com" }
      ],
      "topology": [
        { "from": "internet/_/internet",
          "to": "loadbalancer/ingress-nginx/ingress-nginx-controller",
          "type": "internet", "active": true },
        { "from": "service/monitoring/grafana",
          "to": "pod/monitoring/grafana-5f7c9-abcde",    // was a bare pod name
          "type": "service", "active": true }
      ],
      "metrics": {}
    }
  ]
}
```

## Rules

- Every `from`/`to` in `topology` MUST be an ObjectKey that exists in the same cluster's lists, or
  `internet/_/internet`.
- `controllerId` and `status` are deprecated and removed by task T030. Link endpoints change
  format in this release, so frontend and backend must run the same version; both ship in one
  chart release.
- Endpoints: `GET /healthz` (liveness, always 200), `GET /readyz` (**new**, 503 until caches sync).
