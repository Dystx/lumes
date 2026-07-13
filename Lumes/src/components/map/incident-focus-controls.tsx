"use client";

import { Compass, Maximize2, X, Loader2, AlertTriangle } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import type { IncidentFocusCapability } from "@/lib/map/incident-focus-capability";
import type { IncidentFocusUiState } from "@/lib/map/incident-focus-state";

export type { IncidentFocusUiState } from "@/lib/map/incident-focus-state";

export type IncidentFocusPlacement = "inspector" | "map";

export interface IncidentFocusControlsProps {
  lang: Language;
  state: IncidentFocusUiState;
  capability: IncidentFocusCapability;
  incidentName: string;
  placement: IncidentFocusPlacement;
  isMobile?: boolean;
  onEnter: () => void;
  onExit: () => void;
  onReturnToOverview: () => void;
}

function reasonText(lang: Language, reason: IncidentFocusCapability["reason"]): string {
  switch (reason) {
    case "webgl-unavailable":
      return t(lang, "incidentFocus.unavailableWebgl");
    case "map-not-ready":
      return t(lang, "incidentFocus.unavailableMap");
    case "invalid-geometry":
      return t(lang, "incidentFocus.unavailableGeometry");
    case "low-capability":
      return t(lang, "incidentFocus.unavailableLow");
    default:
      return t(lang, "incidentFocus.unavailable");
  }
}

function statusLabel(lang: Language, state: IncidentFocusUiState): string {
  if (state === "entering") return t(lang, "incidentFocus.entering");
  if (state === "exiting") return t(lang, "incidentFocus.exiting");
  return t(lang, "incidentFocus.status");
}

function statusAnnouncement(lang: Language, state: IncidentFocusUiState): string {
  if (state === "entering") return t(lang, "incidentFocus.announcementEntering");
  if (state === "exiting") return t(lang, "incidentFocus.announcementExiting");
  return t(lang, "incidentFocus.announcementActive");
}

export function IncidentFocusControls({
  lang,
  state,
  capability,
  incidentName,
  placement,
  isMobile = false,
  onEnter,
  onExit,
  onReturnToOverview,
}: IncidentFocusControlsProps) {
  if (placement === "inspector") {
    if (state === "active" || state === "entering" || state === "exiting") {
      return (
        <div
          className="mt-3 rounded-md border border-[var(--ember-accent)]/40 bg-[var(--ember-accent-subtle)] p-3 text-[var(--ember-text)]"
          aria-live="polite"
          aria-label={statusAnnouncement(lang, state)}
          data-motion-policy="prefers-reduced-motion"
        >
          <div className="flex items-start gap-2">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ember-accent)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ember-accent)]">
                {statusLabel(lang, state)}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ember-text-muted)]">
                {t(lang, "incidentFocus.localContext")}
              </p>
            </div>
          </div>
          {state === "active" && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onExit}
                className="min-h-11 rounded-md border border-[var(--ember-border-strong)] px-3 text-[11px] font-medium text-[var(--ember-text)] transition-colors hover:bg-[var(--ember-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              >
                {t(lang, "incidentFocus.exit")}
              </button>
              <button
                type="button"
                onClick={onReturnToOverview}
                className="min-h-11 rounded-md bg-[var(--ember-surface-2)] px-3 text-[11px] font-medium text-[var(--ember-text)] transition-colors hover:bg-[var(--ember-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              >
                {t(lang, "incidentFocus.returnOverview")}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (!capability.allowed || state === "unavailable") {
      return (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)] p-3 text-[11px] text-[var(--ember-warning)]" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-semibold">{t(lang, "incidentFocus.unavailable")}</div>
            <p className="mt-1 leading-relaxed">{reasonText(lang, capability.reason)}</p>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={onEnter}
        data-testid="incident-focus-entry"
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--ember-accent)]/60 bg-[var(--ember-accent-subtle)] px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ember-accent)] transition-colors hover:bg-[var(--ember-accent)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
        aria-label={`${t(lang, isMobile ? "incidentFocus.exploreThisArea" : "incidentFocus.exploreArea")}: ${incidentName}`}
      >
        <Compass className="h-4 w-4" aria-hidden="true" />
        {t(lang, isMobile ? "incidentFocus.exploreThisArea" : "incidentFocus.exploreArea")}
      </button>
    );
  }

  if (state === "idle" || state === "unavailable") return null;

  const busy = state === "entering" || state === "exiting";
  return (
    <div
      className="pointer-events-auto flex max-w-[min(92vw,28rem)] items-center gap-2 rounded-md border border-[var(--ember-accent)]/50 bg-[var(--ember-surface)]/95 px-2.5 py-2 text-[var(--ember-text)] shadow-[var(--ember-shadow-md)] backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={statusAnnouncement(lang, state)}
      data-motion-policy="prefers-reduced-motion"
      data-testid="incident-focus-status"
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Compass className="h-4 w-4 shrink-0 text-[var(--ember-accent)]" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
        <span className="text-[var(--ember-accent)]">{statusLabel(lang, state)}</span>
        <span className="mx-1 text-[var(--ember-text-faint)]">·</span>
        <span>{incidentName}</span>
      </span>
      {state === "active" && (
        isMobile ? (
          <div className="flex w-full shrink-0 gap-1">
            <button
              type="button"
              onClick={onExit}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 text-meta font-semibold uppercase tracking-wider text-[var(--ember-text-muted)] transition-colors hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              aria-label={t(lang, "incidentFocus.exit")}
            >
              <X className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t(lang, "incidentFocus.exit")}</span>
            </button>
            <button
              type="button"
              onClick={onReturnToOverview}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 text-meta font-semibold uppercase tracking-wider text-[var(--ember-text-muted)] transition-colors hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              aria-label={t(lang, "incidentFocus.returnOverview")}
            >
              <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t(lang, "incidentFocus.returnOverview")}</span>
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onExit}
              className="min-h-11 min-w-11 rounded-md px-2 text-meta font-semibold uppercase tracking-wider text-[var(--ember-text-muted)] transition-colors hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              aria-label={t(lang, "incidentFocus.exit")}
              title={t(lang, "incidentFocus.exit")}
            >
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onReturnToOverview}
              className="min-h-11 min-w-11 rounded-md px-2 text-meta font-semibold uppercase tracking-wider text-[var(--ember-text-muted)] transition-colors hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/60 motion-reduce:transition-none"
              aria-label={t(lang, "incidentFocus.returnOverview")}
              title={t(lang, "incidentFocus.returnOverview")}
            >
              <Maximize2 className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )
      )}
    </div>
  );
}
