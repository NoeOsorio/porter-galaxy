# Data Model: Truthful Graph and Usable Camera

## ObjectKey

`<kind>/<namespace>/<name>`, where `kind` is lowercase singular (`pod`, `deployment`, `service`,
`ingress`, `node`, `loadbalancer`, `internet`) and cluster-scoped objects use `_` as namespace.
The frontend's merged graph uses `<clusterId>::<ObjectKey>`.

## State

| State | Pods | Deployments | Nodes |
| --- | --- | --- | --- |
| `running` | phase Running, all containers ready | ready == desired > 0 | Ready condition True |
| `pending` | phase Pending, or Running with unready containers | 0 < ready < desired | — |
| `completed` | phase Succeeded | — | — |
| `failed` | phase Failed, or a container waiting in CrashLoopBackOff, ImagePullBackOff, ErrImagePull | ready == 0 < desired | Ready condition False |
| `scaled-to-zero` | — | desired == 0 | — |
| `unknown` | anything else | — | Ready condition Unknown |

## Owner

`{ kind, name }` from the Pod's controller owner reference; for ReplicaSets owned by a Deployment,
the Deployment. `kind` is `standalone` when there is no owner.

## Link

| Field | Meaning |
| --- | --- |
| `from`, `to` | ObjectKeys |
| `type` | `internet`, `lb`, `ingress`, `service`, `owns`, `scheduled-on` |
| `active` | false when the target endpoint is not ready |

## Relationships drawn in this spec

- Internet → LoadBalancer → Ingress → Service → Pod (existing routing links, now keyed)
- Deployment → Pod (`owns`), derived in the frontend from `pod.owner`
- Pod → Node (`scheduled-on`), derived in the frontend from `pod.nodeId`
- Cluster → Node (Clusters view only), derived in the frontend

The backend's `topology` list keeps only routing links; ownership and placement come from the
object lists, so the snapshot does not repeat them.

## Frontend view model

Both scenes consume one normalized graph built once per snapshot:

- `nodes: Map<ObjectKey, { key, kind, namespace, name, displayName, state, details }>`
- `edges: Array<{ from, to, type, active }>`
- Positions live outside this model (per view) so a snapshot update does not reset layout.
