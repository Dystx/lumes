import type { ReactNode } from "react";

interface MetricProps {
  label: string;
  value: ReactNode;
  detail?: string;
}

export function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className="rounded-md border border-[var(--ember-border)] bg-[var(--ember-surface-2)] p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--ember-text-faint)]">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums text-[var(--ember-text)]">{value}</div>
      {detail && <div className="mt-1 text-[10px] text-[var(--ember-text-faint)]">{detail}</div>}
    </div>
  );
}
