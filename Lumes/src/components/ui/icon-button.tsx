import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
}

export function IconButton({ children, label, className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--ember-text-faint)] transition-colors hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
