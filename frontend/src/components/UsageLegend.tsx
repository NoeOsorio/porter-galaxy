/** Legend line for the usage encoding; `missing` lists clusters without metrics.k8s.io. */
export default function UsageLegend({ missing, total }: { missing: string[]; total: number }) {
  if (missing.length === 0) {
    return <div className="text-[10px] text-white/45 pt-1">Size and glow: usage over requests</div>;
  }
  return (
    <div className="text-[10px] text-amber-200/70 pt-1 leading-[1.5] max-w-[190px]">
      Usage encoding off{total > 1 ? ` for ${missing.join(", ")}` : ""}: install metrics-server to size nodes by load.
    </div>
  );
}
