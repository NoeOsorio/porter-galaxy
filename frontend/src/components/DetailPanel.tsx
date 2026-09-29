import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { STATE_COLORS, type State } from "../lib/objectKey";
import { age, formatBytes, formatCPU, type ObjectDetails } from "../lib/objectDetails";

export interface PanelNode {
  id: string;
  name: string;
  namespace?: string;
  color: string;
  status?: string;
  state?: State;
  metadata?: {
    desired?: number;
    ready?: number;
    version?: string;
    nodeId?: string;
    address?: string;
    connections?: number;
    cpu?: string;
    memory?: string;
  };
}

interface Props {
  node: PanelNode;
  icon: string;
  typeLabel: string;
  details: ObjectDetails;
  deleted: boolean;
  onClose: () => void;
  /** Positioning classes; each view places the panel below its own controls. */
  className: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
      <div className="text-[10px] font-semibold opacity-60 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      {label}: <span className={mono ? "text-white/60 text-[10px] font-mono break-all" : "text-white/90"}>{children}</span>
    </div>
  );
}

function UsageRow({ label, now, base, format, baseLabel }: { label: string; now: number; base?: number; format: (n: number) => string; baseLabel: string }) {
  return (
    <Row label={label}>
      {format(now)}
      {base ? (
        <span className="text-white/45">
          {" "}
          of {format(base)} {baseLabel} ({Math.round((now / base) * 100)}%)
        </span>
      ) : null}
    </Row>
  );
}

/** Shared detail panel for the selected object in both views. */
export default function DetailPanel({ node, icon, typeLabel, details, deleted, onClose, className }: Props) {
  const { owners, hpa, policies, refs, pvc, pod, warnings, usage } = details;
  const meta = node.metadata ?? {};
  const refRows: [string, string[] | undefined][] = [
    ["pvc", refs?.pvcs],
    ["configmap", refs?.configMaps],
    ["secret", refs?.secrets],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className={`absolute left-6 pointer-events-auto min-w-[260px] max-w-[320px] max-h-[calc(100vh-240px)] overflow-y-auto ${className}`}
    >
      <div
        className="bg-[rgba(8,8,25,0.92)] rounded-xl py-4 px-5 text-white/75 text-[11px] leading-[1.8] backdrop-blur-xl border"
        style={{ borderColor: node.color + "33" }}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="font-semibold text-[15px]" style={{ color: node.color }}>
            {icon} {node.name}
            {deleted && <span className="ml-2 text-[10px] font-normal text-red-400">deleted</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none text-white/30 cursor-pointer text-base p-0 hover:text-white/50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <Section title="DETAILS">
          <Row label="type">{typeLabel}</Row>
          <Row label="id" mono>{node.id}</Row>
          {node.namespace && <Row label="namespace">{node.namespace}</Row>}
          {node.status && (
            <div>
              status: <span style={{ color: node.state ? STATE_COLORS[node.state].color : "#fff" }}>{node.status}</span>
            </div>
          )}
          {owners.length > 0 && <Row label="owned by">{owners.join(" → ")}</Row>}
          {meta.connections !== undefined && <Row label="connections">{meta.connections}</Row>}
        </Section>

        {meta.desired !== undefined && (
          <Section title="REPLICAS">
            <Row label="desired">{meta.desired}</Row>
            <Row label="ready">{meta.ready}</Row>
            {hpa && (
              <Row label="autoscaler">
                {hpa.name}: {hpa.current} now, {hpa.min}–{hpa.max}
              </Row>
            )}
          </Section>
        )}

        {(meta.version || meta.nodeId) && (
          <Section title="POD INFO">
            {meta.version && <Row label="version">{meta.version}</Row>}
            {meta.nodeId && <Row label="node" mono>{meta.nodeId}</Row>}
          </Section>
        )}

        {(meta.cpu || meta.memory) && (
          <Section title="CAPACITY">
            {meta.cpu && <Row label="cpu">{meta.cpu}</Row>}
            {meta.memory && <Row label="memory">{meta.memory}</Row>}
          </Section>
        )}

        {meta.address && (
          <Section title="ADDRESS">
            <div className="text-white/60 text-[10px] font-mono break-all">{meta.address}</div>
          </Section>
        )}

        {usage && (
          <Section title="USAGE">
            <UsageRow label="cpu" now={usage.now.cpuMillis} base={usage.base?.cpuMillis} format={formatCPU} baseLabel={usage.baseLabel} />
            <UsageRow label="memory" now={usage.now.memoryBytes} base={usage.base?.memoryBytes} format={formatBytes} baseLabel={usage.baseLabel} />
          </Section>
        )}

        {pod && (pod.restarts || pod.lastTermination) && (
          <Section title="HEALTH">
            <Row label="restarts">{pod.restarts ?? 0}</Row>
            {pod.lastTermination && (
              <Row label="last termination">
                {pod.lastTermination.reason || "Unknown"} (exit {pod.lastTermination.exitCode}), {age(pod.lastTermination.at)} ago
              </Row>
            )}
          </Section>
        )}

        {warnings.length > 0 && (
          <Section title="WARNINGS">
            {warnings.map((w) => (
              <div key={`${w.reason}|${w.lastSeen}|${w.message}`}>
                <span className="text-amber-300/90">{w.reason}</span>
                <span className="text-white/40">
                  {" "}
                  ×{w.count} · {age(w.lastSeen)} ago
                </span>
                <div className="text-white/55 text-[10px] break-words leading-[1.5]">{w.message}</div>
              </div>
            ))}
          </Section>
        )}

        {refRows.some(([, names]) => names?.length) && (
          <Section title="REFERENCES">
            {refRows.map(([kind, names]) => names?.length ? <Row key={kind} label={kind} mono>{names.join(", ")}</Row> : null)}
          </Section>
        )}

        {pvc && (
          <Section title="CLAIM">
            <Row label="phase">{pvc.phase}</Row>
            {pvc.storageClass && <Row label="storage class">{pvc.storageClass}</Row>}
          </Section>
        )}

        {policies.length > 0 && (
          <Section title="NETWORK POLICIES">
            <div className="text-white/80">{policies.join(", ")}</div>
          </Section>
        )}
      </div>
    </motion.div>
  );
}
