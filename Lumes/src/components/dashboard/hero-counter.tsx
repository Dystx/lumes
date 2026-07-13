"use client";
// HeroCounter — large hero metric for the dashboard (TASK H, refactor plan).
//
// Replaces the cramped 160×68 stat cards with a bigger 40-60px display number
// that reads at a glance. Clickable to filter.

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
import { LoadingSkeleton } from "@/components/ui/empty-state";

export interface HeroCounterProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  pulse?: boolean;
  active?: boolean;
  onClick?: () => void;
  /** Optional subtitle shown below the number */
  hint?: string;
  /** Optional secondary line shown in a faint color (e.g. "Updated 12s ago") */
  caption?: string;
  /** Show skeleton loading state */
  isLoading?: boolean;
}

export function HeroCounter({
  label,
  value,
  icon: Icon,
  color,
  pulse,
  active,
  onClick,
  hint,
  caption,
  isLoading,
}: HeroCounterProps) {
  if (isLoading) {
    return <LoadingSkeleton rows={2} height={48} />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}: ${value}${hint ? ` (${hint})` : ""}`}
      className={`group relative flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-md border text-left transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/40 min-w-0 max-w-full overflow-hidden ${
        active
          ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)] shadow-[0_0_0_1px_var(--ember-accent)]"
          : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-semibold">
          {label}
        </span>
        <Icon
          className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ color }}
        />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-2xl font-bold font-mono tabular-nums leading-none ${
            pulse ? "animate-pulse" : ""
          }`}
          style={{ color }}
        >
          {value}
        </span>
        {hint && (
          <span className="text-meta text-[var(--ember-text-faint)] truncate max-w-[80px]">
            {hint}
          </span>
        )}
      </div>
      {caption && (
        <span className="text-meta text-[var(--ember-text-faint)] truncate w-full">
          {caption}
        </span>
      )}
      {active && (
        <span
          className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[var(--ember-accent)]"
          aria-hidden
        />
      )}
    </button>
  );
}