import type { ApiCluster, ApiClusterPatch, ApiClustersResponse, ApiPatchEvent, ApiSnapshotEvent } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ClusterStreamHandlers {
  onSnapshot: (data: ApiSnapshotEvent, bytes: number) => void;
  onPatch: (data: ApiPatchEvent, bytes: number) => void;
  onError: (error: Error) => void;
}

export function createClusterEventSource({ onSnapshot, onPatch, onError }: ClusterStreamHandlers): EventSource {
  const eventSource = new EventSource(`${API_URL}/api/v1/clusters`);
  const listen = <T>(event: string, handle: (data: T, bytes: number) => void) =>
    eventSource.addEventListener(event, (e) => {
      try {
        handle(JSON.parse(e.data) as T, e.data.length);
      } catch (error) {
        onError(new Error(`Failed to parse ${event} event: ${error}`));
      }
    });
  listen("snapshot", onSnapshot);
  listen("patch", onPatch);
  eventSource.onerror = () => onError(new Error("SSE connection error"));
  return eventSource;
}

const objectKey = (o: object) => ("key" in o ? String(o.key) : `${"from" in o ? o.from : ""}|${"to" in o ? o.to : ""}`);

// Lists and clusters the patch does not touch keep their identity, so memos
// keyed on them in the views do not recompute.
function patchCluster(cluster: ApiCluster, patch: ApiClusterPatch): ApiCluster {
  const upsert = (patch.upsert ?? {}) as Record<string, object[]>;
  const remove = (patch.remove ?? {}) as Record<string, string[]>;
  const next = { ...cluster, ...patch.fields } as unknown as Record<string, object[]>;
  for (const name of new Set([...Object.keys(upsert), ...Object.keys(remove)])) {
    const upserts = new Map((upsert[name] ?? []).map((o) => [objectKey(o), o]));
    const removed = new Set(remove[name] ?? []);
    const list: object[] = [];
    for (const o of next[name] ?? []) {
      const k = objectKey(o);
      if (removed.has(k)) continue;
      list.push(upserts.get(k) ?? o);
      upserts.delete(k);
    }
    list.push(...upserts.values());
    next[name] = list;
  }
  return next as unknown as ApiCluster;
}

export function applyPatch(snapshot: ApiClustersResponse, patch: ApiPatchEvent): ApiClustersResponse {
  const byId = new Map(patch.clusters.map((c) => [c.id, c]));
  const removed = new Set(patch.removedClusters);
  const clusters = snapshot.clusters
    .filter((c) => !removed.has(c.id))
    .map((c) => (byId.has(c.id) ? patchCluster(c, byId.get(c.id)!) : c));
  return { clusters: [...clusters, ...patch.addedClusters] };
}
