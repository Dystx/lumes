import Link from "next/link";
import type { ReactNode } from "react";
import { EmberIcon } from "@/components/icons/brand-icons";
import { SectionHeading } from "@/components/ui/section-heading";
import { AppToolbar } from "@/components/shell/app-toolbar";

interface PublicPageShellProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/** Shared, token-based chrome for public pages outside the live map shell. */
export function PublicPageShell({ children, title, description }: PublicPageShellProps) {
  return (
    <main lang="pt-PT" className="min-h-screen bg-[var(--ember-bg)] text-[var(--ember-text)]">
      <AppToolbar
        brand={
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-md px-1 font-display text-base font-semibold tracking-tight hover:text-[var(--ember-accent)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ember-accent-subtle)]">
              <EmberIcon className="h-4 w-4 text-[var(--ember-accent)]" />
            </span>
            lumes.pt
          </Link>
        }
        actions={
          <Link
            href="/"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)]"
          >
            Voltar ao mapa
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {(title || description) && (
          <div className="mb-8 max-w-[72ch]">
            {title && <SectionHeading title={title} description={description} variant="display" />}
            {!title && description && <p className="text-sm leading-6 text-[var(--ember-text-muted)]">{description}</p>}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
