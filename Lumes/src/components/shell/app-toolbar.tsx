import type { ReactNode } from "react";

interface AppToolbarProps {
  brand: ReactNode;
  actions?: ReactNode;
}

/** Shared token-based top bar for map-adjacent and public shells. */
export function AppToolbar({ brand, actions }: AppToolbarProps) {
  return (
    <header className="border-b border-[var(--ember-border)] bg-[var(--ember-surface)]/80 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        {brand}
        {actions}
      </div>
    </header>
  );
}
