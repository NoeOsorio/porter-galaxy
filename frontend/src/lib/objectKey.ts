import { Boxes, Cog, Database, FileText, HardDrive, KeyRound, Satellite, Timer, type LucideIcon } from "lucide-react";
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
export const WORKLOAD_STYLE: Record<WorkloadKind, { color: string; glow: string; icon: LucideIcon }> = {
  Deployment: { color: "#fb923c", glow: "#ea580c", icon: Boxes },
  StatefulSet: { color: "#f59e0b", glow: "#d97706", icon: Database },
  DaemonSet: { color: "#fbbf24", glow: "#ca8a04", icon: Satellite },
  Job: { color: "#fdba74", glow: "#f97316", icon: Cog },
  CronJob: { color: "#fcd34d", glow: "#eab308", icon: Timer },
};

export function isWorkloadKind(kind: string | undefined): kind is WorkloadKind {
  return WORKLOAD_KINDS.includes(kind as WorkloadKind);
}

export function workloadKey(kind: WorkloadKind, namespace: string, name: string): string {
  return objectKey(kind.toLowerCase(), namespace, name);
}

export type RefKind = "pvc" | "configmap" | "secret";

export const REF_STYLE: Record<RefKind, { color: string; glow: string; icon: LucideIcon; label: string }> = {
  pvc: { color: "#60a5fa", glow: "#2563eb", icon: HardDrive, label: "PVC" },
  configmap: { color: "#c084fc", glow: "#9333ea", icon: FileText, label: "ConfigMap" },
  secret: { color: "#f87171", glow: "#dc2626", icon: KeyRound, label: "Secret" },
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

/** Usage over its reference (requests or allocatable), the larger of CPU and memory; undefined without both. */
export function loadRatio(
  usage: { cpuMillis: number; memoryBytes: number } | undefined,
  base: { cpuMillis: number; memoryBytes: number } | undefined,
): number | undefined {
  if (!usage || !base) return undefined;
  const ratios = [
    base.cpuMillis > 0 ? usage.cpuMillis / base.cpuMillis : undefined,
    base.memoryBytes > 0 ? usage.memoryBytes / base.memoryBytes : undefined,
  ].filter((r): r is number => r !== undefined);
  return ratios.length ? Math.max(...ratios) : undefined;
}
