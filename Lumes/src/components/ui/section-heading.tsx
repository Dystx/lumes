import type { ReactNode } from "react";

interface SectionHeadingProps {
  title: string;
  action?: ReactNode;
  description?: string;
  variant?: "compact" | "display";
}

export function SectionHeading({ title, action, description, variant = "compact" }: SectionHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {variant === "display" ? (
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        ) : (
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--ember-text-muted)]">{title}</h2>
        )}
        {description && <p className="mt-1 text-xs text-[var(--ember-text-faint)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
