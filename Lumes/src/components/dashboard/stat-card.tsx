"use client";
// DashStat — dashboard summary counter card (Total / Active / Critical / High).
// Clickable; renders active state when filter is applied.
//
// Hero metric style — large mono number + small icon + uppercase label.

import type { LucideIcon } from "@/components/icons/phosphor-icons";

export interface DashStatProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  pulse?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export function DashStat({
  label,
  value,
  icon: Icon,
  color,
  pulse,
  active,
  onClick,
}: DashStatProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative overflow-hidden text-left rounded-md border p-2.5 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/40 ${
        active
          ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)] shadow-[0_0_0_1px_var(--ember-accent)]"
          : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {label}
        </span>
        <Icon className="w-3 h-3" style={{ color }} />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-xl font-mono font-bold tabular-nums ${pulse ? "animate-pulse" : ""}`}
          style={{ color }}
        >
          {value}
        </span>
      </div>
      {active && (
        <span
          className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[var(--ember-accent)]"
          aria-hidden
        />
      )}
    </button>
  );
}

// ResourceStat — resources deployed card (Personnel / Engines / Aircraft).
// Compact 3-column layout; clickable; renders active state.
export interface ResourceStatProps {
  icon: LucideIcon;
  value: number;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function ResourceStat({
  icon: Icon,
  value,
  label,
  active,
  onClick,
}: ResourceStatProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border p-2 text-center transition-all hover:scale-[1.04] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/40 ${
        active
          ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]"
          : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
      }`}
    >
      <Icon
        className={`w-3.5 h-3.5 mx-auto mb-1 ${
          active ? "text-[var(--ember-accent)]" : "text-[var(--ember-text-muted)]"
        }`}
      />
      <div className="text-base font-mono font-bold tabular-nums text-[var(--ember-text)]">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mt-0.5">
        {label}
      </div>
    </button>
  );
}