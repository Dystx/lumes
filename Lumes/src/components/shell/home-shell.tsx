import type { ReactNode } from "react";

interface HomeShellProps {
  children: ReactNode;
  skipLink?: ReactNode;
}

/** Owns the page-level responsive shell; map/query orchestration stays in Home. */
export function HomeShell({ children, skipLink }: HomeShellProps) {
  return (
    <div className="h-screen w-full flex xl:overflow-hidden overflow-hidden flex-col xl:flex-row bg-[var(--ember-bg)] text-[var(--ember-text)] font-sans relative">
      {skipLink}
      {children}
    </div>
  );
}
