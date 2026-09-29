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

export type WorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet" | "Job" | "CronJob";

export const WORKLOAD_KINDS: WorkloadKind[] = ["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"];

// One orange family so every kind reads as "workload", with a hue step per kind.
export const WORKLOAD_STYLE: Record<WorkloadKind, { color: string; glow: string; icon: string }> = {
  Deployment: { color: "#fb923c", glow: "#ea580c", icon: "📦" },
  StatefulSet: { color: "#f59e0b", glow: "#d97706", icon: "🗄️" },
  DaemonSet: { color: "#fbbf24", glow: "#ca8a04", icon: "🛰️" },
  Job: { color: "#fdba74", glow: "#f97316", icon: "⚙️" },
  CronJob: { color: "#fcd34d", glow: "#eab308", icon: "⏱️" },
};

export function isWorkloadKind(kind: string | undefined): kind is WorkloadKind {
  return WORKLOAD_KINDS.includes(kind as WorkloadKind);
}

export function workloadKey(kind: WorkloadKind, namespace: string, name: string): string {
  return objectKey(kind.toLowerCase(), namespace, name);
}

export type RefKind = "pvc" | "configmap" | "secret";

export const REF_STYLE: Record<RefKind, { color: string; glow: string; icon: string; label: string }> = {
  pvc: { color: "#60a5fa", glow: "#2563eb", icon: "💾", label: "PVC" },
  configmap: { color: "#c084fc", glow: "#9333ea", icon: "📄", label: "ConfigMap" },
  secret: { color: "#f87171", glow: "#dc2626", icon: "🔑", label: "Secret" },
};

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

/** Status line and replica counts for a workload node; a CronJob has no replicas of its own. */
export function workloadStatus(w: { kind: WorkloadKind; state: State; desired: number; ready: number }) {
  if (w.kind === "CronJob") return { status: STATE_LABELS[w.state], replicas: {} };
  return { status: `${w.ready}/${w.desired} ${w.kind === "Job" ? "succeeded" : "ready"}`, replicas: { desired: w.desired, ready: w.ready } };
}

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
