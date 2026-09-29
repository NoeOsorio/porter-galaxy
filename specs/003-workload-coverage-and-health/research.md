# Research: Workload Coverage and Health

## R1. Read from informer listers, drop the copy store

- **Decision**: Delete `internal/store`. The informer manager registers informers for every kind,
  attaches one generic `ResourceEventHandler` that only signals "something changed", and exposes
  the factory's typed listers. The builder reads through those listers.
- **Rationale**: Each kind today needs a map, three store methods, a handler, and a tombstone
  helper (~60 lines); eight more kinds would add ~500 lines of copies of data the informer cache
  already holds. Listers are thread-safe and indexed by namespace.
- **Transforms**: ReplicaSets and Jobs keep a `SetTransform` that trims to metadata and owner
  references (as ReplicaSets do today); Pods keep full specs because health and refs read them.

## R2. Workloads

- **Decision**: One `workloads` list replaces `deployments`: `{key, kind, namespace, name, state,
  desired, ready, owner?}` for Deployment, StatefulSet, DaemonSet, Job, and CronJob. Pod ownership
  follows owner references: Pod → ReplicaSet → Deployment, Pod → Job → CronJob, Pod →
  StatefulSet / DaemonSet directly. Jobs owned by a CronJob carry `owner` so the frontend draws
  CronJob → Job → Pod.
- **State**: Deployment/StatefulSet use ready vs desired; DaemonSet uses numberReady vs
  desiredNumberScheduled; Job uses succeeded/failed/active (`completed`, `failed`, `running`);
  CronJob is `running` when it has active Jobs, else `completed` if its last run succeeded, else
  `scaled-to-zero` when suspended.
- **Rationale**: Databases (StatefulSets), agents (DaemonSets), and batch work show up as
  standalone Pods today (spec 001 US1 left `owner.kind` set but undrawn).

## R3. References, HPAs, NetworkPolicies, Namespaces

- **References**: PVC, ConfigMap, and Secret names come from each Pod's `volumes`, `envFrom`, and
  `env[].valueFrom`. Only names are emitted; Secrets and ConfigMaps are never listed or read.
  PVCs are watched for `phase` (Bound/Pending) because an unbound claim explains a Pending Pod.
- **HPAs** (`autoscaling/v2`): emitted with target key, min, max, current, and desired replicas,
  shown in the target workload's detail panel.
- **NetworkPolicies**: emitted with namespace and pod selector; the detail panel lists the
  policies that select a Pod (label match done in the backend). No policy edges are drawn.
- **Namespaces**: watched for phase (`Terminating` shows on the group label).
- **Drawing**: references are hidden by default and drawn only for the selected object (spec edge
  case: no hairball).

## R4. Stream patches and compression

- **Decision**: Per connection, the first event is a full `snapshot` with a `version`; later
  events are `patch` messages `{base, version, clusters: [{id, upsert: {<list>: [objects]},
  remove: {<list>: [keys]}}]}` computed per object key between consecutive broadcasts. The hub
  keeps the last broadcast snapshot and its version; a new client receives that exact snapshot
  and is subscribed under the same lock, so the next patch always applies to what it holds.
  If a client's buffer overflows, the hub marks it and sends it a full snapshot instead of the
  next patch. The backend writes the stream through `gzip.Writer` and flushes after each event;
  nginx passes it through untouched (`proxy_buffering off`).
- **Rationale**: Today every change resends every object; with 500 ms churn on a large cluster
  that dominates bandwidth and client JSON parsing. Dropped frames were harmless with full
  snapshots but would corrupt a patch-based client, hence the resync rule.
- **Alternatives**: JSON Patch (RFC 6902) — index-based paths break on reordered arrays;
  nginx gzip on `text/event-stream` — buffers events inside the compressor.

## R5. Health

- **Decision**: Pods emit `restarts` (sum of container restart counts), `lastTermination`
  (`{reason, exitCode, at}` from `lastState.terminated`), and `recentRestart` (restart within 10
  minutes). State rules from spec 001 stay; `failed` also covers `OOMKilled` with restarts.
- **Events**: a separate informer factory watches `core/v1` Events with the field selector
  `type=Warning`. An index keeps the latest 10 per involved object key, and drops entries older
  than 1 hour. Events are not part of the patch stream's object lists; they ride on the object
  as `warnings: [{reason, message, count, lastSeen}]` so selecting an object needs no extra call.
- **Rationale**: Warning events are the useful subset and bounded; Normal events would multiply
  memory and patch traffic.

## R6. Metrics

- **Decision**: Poll `GET /apis/metrics.k8s.io/v1beta1/pods` and `/nodes` every 15 s with the
  client-go REST client. If the API group is absent, emit `metricsAvailable: false` and poll the
  discovery endpoint every 5 minutes. Pods emit `usage: {cpuMillis, memoryBytes}` and
  `requests` from the Pod spec, so the frontend encodes usage / request.
- **Rationale**: No new Go module (`k8s.io/metrics` is not needed for two list calls).
- **Encoding**: node size scales by up to 1.6× with usage ratio; brightness (glow) by up to 2×.

## R7. Frontend

- **Workload nodes**: `deployment` node type becomes `workload` with `kind`; each kind gets an
  icon and a slightly different color within the current orange family so kinds are
  distinguishable but still read as "workload".
- **Topology**: Service → Workload → Pod for any kind (StatefulSets behind Services appear).
- **Clusters**: CronJob → Job → Pod; DaemonSet pods keep their node placement links.
- **Pulse**: a per-instance `aPulse` attribute in `NodeInstances` for `recentRestart`.
- **Detail panel**: one shared component for both views: state, owner chain, restarts and last
  termination, warnings, HPA, references (drawn on selection), policies, usage.
