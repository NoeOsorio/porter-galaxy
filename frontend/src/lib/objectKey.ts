import type { ApiPod } from "../types/api";

// Mirrors backend/internal/cluster/keys.go; change both together.
export type State =
  | "running"
  | "pending"
  | "completed"
  | "failed"
  | "scaled-to-zero"
  | "unknown";

export const INTERNET_KEY = "internet/_/internet";

export const STATE_COLORS: Record<State, { color: string; glow: string }> = {
  running: { color: "#5bffb0", glow: "#00cc66" },
  pending: { color: "#ffd666", glow: "#cc9900" },
  completed: { color: "#94a3b8", glow: "#64748b" },
  failed: { color: "#ff3333", glow: "#dd0000" },
  "scaled-to-zero": { color: "#64748b", glow: "#475569" },
  unknown: { color: "#a1a1aa", glow: "#71717a" },
};

export const STATE_LABELS: Record<State, string> = {
  running: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
  "scaled-to-zero": "Scaled to zero",
  unknown: "Unknown",
};

export function objectKey(kind: string, namespace: string | undefined, name: string): string {
  return `${kind}/${namespace || "_"}/${name}`;
}

export function parseKey(key: string): { kind: string; namespace?: string; name: string } {
  const [kind = "", namespace = "_", ...rest] = key.split("/");
  return { kind, namespace: namespace === "_" ? undefined : namespace, name: rest.join("/") };
}

// Pods of a controller share the controller's name plus generated hashes; show
// the owner name and the pod's unique suffix so siblings stay distinguishable.
export function podDisplayName(pod: ApiPod): string {
  if (pod.owner.kind === "standalone" || !pod.owner.name) return pod.id;
  const suffix = pod.id.slice(pod.id.lastIndexOf("-") + 1);
  return `${pod.owner.name}-${suffix}`;
}
