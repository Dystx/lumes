import { SEVERITY_LABEL } from "@/lib/incident";
import { t, tFmt, type Language } from "@/lib/i18n";
import type { Severity } from "@/lib/types";

export const MAP_STATUS_SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];

export type SeverityCounts = Readonly<Record<Severity, number>>;

export interface MapStatusSegment {
  severity: Severity;
  count: number;
  label: string;
}

export interface MapStatusSummary {
  headline: string;
  breakdown: string;
  activeFilterLabel?: string;
  emptyMessage?: string;
  ariaLabel: string;
  segments: readonly MapStatusSegment[];
}

export function countIncidentSeverities<T extends { severity: Severity }>(
  incidents: readonly T[],
): SeverityCounts {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const incident of incidents) {
    counts[incident.severity] += 1;
  }

  return counts;
}

export function buildMapStatusSummary({
  lang,
  visibleCount,
  severityCounts,
  activeFilterCount = 0,
}: {
  lang: Language;
  visibleCount: number;
  severityCounts: Partial<Record<Severity, number>>;
  activeFilterCount?: number;
}): MapStatusSummary {
  const count = normalizeCount(visibleCount);
  const filters = normalizeCount(activeFilterCount);
  const filtered = filters > 0;
  const unit = t(lang, count === 1 ? "map.incidentUnit" : "map.incidentsUnit");
  const headline = tFmt(lang, filtered ? "map.filteredSummary" : "map.visibleSummary", { count, unit });
  const activeFilterLabel = filters > 0
    ? tFmt(lang, filters === 1 ? "map.activeFilter" : "map.activeFilters", { count: filters })
    : undefined;

  const segments = MAP_STATUS_SEVERITIES.flatMap((severity) => {
    const severityCount = normalizeCount(severityCounts[severity]);
    if (severityCount === 0) return [];
    return [{
      severity,
      count: severityCount,
      label: formatSeverityLabel(severity, severityCount, lang),
    }];
  });
  const breakdown = segments.map((segment) => `${segment.count} ${segment.label}`).join(" · ");
  const emptyMessage = count === 0
    ? (filtered
      ? t(lang, "map.noFilterMatches")
      : t(lang, "map.noVisibleIncidents"))
    : undefined;
  const details = breakdown || emptyMessage;

  return {
    headline,
    breakdown,
    activeFilterLabel,
    emptyMessage,
    ariaLabel: details ? `${headline}: ${details}` : headline,
    segments,
  };
}

function normalizeCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value as number));
}

function formatSeverityLabel(severity: Severity, count: number, lang: Language): string {
  const label = SEVERITY_LABEL[severity][lang].toLocaleLowerCase(lang === "pt" ? "pt-PT" : "en-US");
  if (lang === "en" || count === 1) return label;
  return `${label}s`;
}
