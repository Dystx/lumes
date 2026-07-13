import type { DataState } from "@/lib/data-state";

interface StatusIndicatorProps {
  label: string;
  state: DataState | "live";
  pulse?: boolean;
}

const stateClass: Record<StatusIndicatorProps["state"], string> = {
  healthy: "bg-[var(--ember-success)]",
  live: "bg-[var(--ember-accent)]",
  stale: "bg-[var(--ember-warning)]",
  fallback: "bg-[var(--ember-warning)]",
  empty: "bg-[var(--ember-text-faint)]",
  "retryable-error": "bg-[var(--ember-critical)]",
};

export function StatusIndicator({ label, state, pulse = false }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-medium uppercase tracking-wider text-[var(--ember-text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${stateClass[state]} ${pulse ? "animate-pulse" : ""}`} aria-hidden="true" />
      {label}
    </span>
  );
}
