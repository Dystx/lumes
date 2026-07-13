import { t, type Language } from "@/lib/i18n";
import { ALL_SEVERITIES, type ActiveFilter, type IncidentFilterState } from "@/lib/incident-filters";

/**
 * Localizes one active query-filter chip without owning state or callbacks.
 * The page remains the only query owner; this module only translates the
 * presentation derived from that state.
 */
export function localizeActiveFilterLabel(
  filter: ActiveFilter,
  filters: IncidentFilterState,
  lang: Language,
): string {
  if (filter.id === "quick") {
    if (filters.quick === "active") return t(lang, "dashboard.active");
    if (filters.quick === "critical") return t(lang, "dashboard.critical");
    if (filters.quick === "high") return t(lang, "dashboard.high");
    return filter.label;
  }

  if (filter.id === "severity") {
    const labels = ALL_SEVERITIES
      .filter((severity) => filters.severities.has(severity))
      .map((severity) => t(lang, `severity.${severity}`));
    return labels.join(", ") || t(lang, "error.noResults");
  }

  if (filter.id === "resolved") return t(lang, "filterLabels.includingResolved");
  if (filter.id === "search") return `"${filters.search.trim()}"`;
  if (filter.id === "phase") return filters.phase?.trim() || filter.label;

  if (filter.id === "resource") {
    if (filters.resource === "personnel") return t(lang, "filterLabels.withPersonnel");
    if (filters.resource === "engines") return t(lang, "filterLabels.withEngines");
    if (filters.resource === "aircraft") return t(lang, "filterLabels.withAircraft");
  }

  return filter.label;
}
