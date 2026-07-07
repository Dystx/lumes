"use client";
// SectionError — inline error state for individual dashboard sections.
//
// When an API fails (network, server error, etc.) the dashboard section
// should degrade gracefully: show a clear message + retry button instead
// of the entire page error boundary.

import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";

export interface SectionErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function SectionError({
  title,
  message,
  onRetry,
  compact = false,
}: SectionErrorProps) {
  const { language: lang } = useLanguage();
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-2 ${compact ? "py-3" : "py-6"} px-4 text-center`}
    >
      <AlertCircle
        className={`${compact ? "w-5 h-5" : "w-7 h-7"} text-[var(--ember-warning)] flex-shrink-0`}
        aria-hidden="true"
      />
      <div className="text-[11px] font-medium text-[var(--ember-text)]">
        {title ?? t(lang, "error.sectionTitle")}
      </div>
      <div className="text-[10px] text-[var(--ember-text-faint)] max-w-xs">
        {message ?? t(lang, "error.sectionMessage")}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-accent)] text-[10px] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
        >
          <RefreshCw className="w-2.5 h-2.5" aria-hidden="true" />
          <span>{t(lang, "error.retry")}</span>
        </button>
      )}
    </div>
  );
}