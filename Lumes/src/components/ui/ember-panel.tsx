import type { HTMLAttributes } from "react";

export function EmberPanel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border border-[var(--ember-border)] bg-[var(--ember-surface)] ${className}`} {...props} />;
}
