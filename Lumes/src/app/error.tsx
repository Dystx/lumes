"use client";
// Next.js 16 error boundary — catches runtime errors below the layout
// and shows a PT/EN fallback UI instead of a blank page.
//
// Reference: https://nextjs.org/docs/app/api-reference/file-conventions/error

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/use-language";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { language } = useLanguage();

  useEffect(() => {
    // Log to console — wire to Sentry / pino later
    console.error("[lumes:error-boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
    });
  }, [error]);

  return (
    <main className="h-screen w-full flex flex-col items-center justify-center bg-[var(--ember-bg)] text-[var(--ember-text)] gap-5 p-6 font-sans">
      <div
        className="w-20 h-20 rounded-2xl bg-[var(--ember-surface)] border border-[var(--ember-border)] flex items-center justify-center text-5xl"
        aria-hidden
      >
        🔥
      </div>
      <div className="text-center max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {t(language, "error.title")}
        </h1>
        <p className="text-sm text-[var(--ember-text-muted)] leading-relaxed">
          {t(language, "error.description")}
        </p>
        {error.message && error.message !== "Unknown error" && (
          <details className="mt-3 text-left">
            <summary className="text-[11px] text-[var(--ember-text-faint)] cursor-pointer hover:text-[var(--ember-text-muted)]">
              {t(language, "error.technicalDetails")}
            </summary>
            <pre className="mt-2 p-2 bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded text-[10px] font-mono text-[var(--ember-text-faint)] overflow-x-auto max-h-32">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-md bg-[var(--ember-accent)] text-[var(--ember-bg)] font-medium text-sm hover:opacity-90 transition-opacity"
        >
          {t(language, "error.tryAgain")}
        </button>
        <a
          href="/"
          className="px-4 py-2 rounded-md bg-[var(--ember-surface)] border border-[var(--ember-border)] text-[var(--ember-text)] font-medium text-sm hover:bg-[var(--ember-surface-2)] transition-colors"
        >
          {t(language, "error.goHome")}
        </a>
      </div>
    </main>
  );
}