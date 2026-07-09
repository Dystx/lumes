// Centralised incident status / severity / phase helpers.
//
// All status mappings live here so the UI, API routes, and ingest layer
// share a single source of truth.

import type { Language } from "@/lib/i18n";
import type { EventType } from "@/lib/types";

// ---------------- Severity ----------------

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SEVERITY_LABEL_PT: Record<Severity, string> = {
  critical: "Crítico",
  high: "Elevado",
  medium: "Médio",
  low: "Baixo",
};
export const SEVERITY_LABEL_EN: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const SEVERITY_LABEL: Record<Severity, { pt: string; en: string }> = {
  critical: { pt: "Crítico", en: "Critical" },
  high: { pt: "Elevado", en: "High" },
  medium: { pt: "Médio", en: "Medium" },
  low: { pt: "Baixo", en: "Low" },
};

export function severityLabel(s: Severity | string, lang: Language = "pt"): string {
  if (lang === "pt") return SEVERITY_LABEL_PT[s as Severity] ?? String(s);
  return SEVERITY_LABEL_EN[s as Severity] ?? String(s);
}

// ---------------- Incident status (collapsed) ----------------

export type IncidentStatus = "active" | "detected" | "contained" | "resolved" | "monitoring";

export const STATUS_RANK: Record<IncidentStatus, number> = {
  active: 0,
  detected: 1,
  monitoring: 2,
  contained: 3,
  resolved: 4,
};

export const STATUS_LABEL_PT: Record<IncidentStatus, string> = {
  active: "Ativo",
  detected: "Detetado",
  contained: "Contido",
  resolved: "Resolvido",
  monitoring: "Em Vigilância",
};
export const STATUS_LABEL_EN: Record<IncidentStatus, string> = {
  active: "Active",
  detected: "Detected",
  contained: "Contained",
  resolved: "Resolved",
  monitoring: "Monitoring",
};

export function statusLabel(s: IncidentStatus | string, lang: Language = "pt"): string {
  if (lang === "pt") return STATUS_LABEL_PT[s as IncidentStatus] ?? String(s);
  return STATUS_LABEL_EN[s as IncidentStatus] ?? String(s);
}

// ---------------- Operational phase (raw ANEPC EstadoAgrupado) ----------------

export const OPERATIONAL_PHASES = [
  "Em Despacho",
  "Em Curso",
  "Em Resolução",
  "Em Conclusão",
  "Vigilância",
  "Encerrada",
  "Falso Alarme",
] as const;
export type OperationalPhase = (typeof OPERATIONAL_PHASES)[number];

// Coarse group from raw status text (used when statusGroup is not persisted)
const PHASE_PREFIX: Array<[string, OperationalPhase]> = [
  ["Despacho", "Em Despacho"],
  ["Chegada", "Em Despacho"],
  ["Em Curso", "Em Curso"],
  ["Em Resolu", "Em Resolução"],
  ["Resolu", "Em Resolução"],
  ["Em Conclus", "Em Conclusão"],
  ["Conclus", "Em Conclusão"],
  ["Vigil", "Vigilância"],
  ["Encerrad", "Encerrada"],
  ["Falso", "Falso Alarme"],
];

export function mapStatusGroup(
  statusText: string | null | undefined,
  fallback?: string,
): OperationalPhase | string {
  if (statusText) {
    for (const [prefix, group] of PHASE_PREFIX) {
      if (statusText.includes(prefix)) return group;
    }
  }
  return fallback ?? "unknown";
}

// Color tokens — use CSS vars from globals.css
export const PHASE_COLOR: Record<string, string> = {
  "Em Despacho": "var(--ember-warning)",
  "Chegada ao TO": "var(--ember-warning)",
  "Despacho de 1º Alerta": "var(--ember-warning)",
  "Em Curso": "var(--ember-critical)",
  "Em Resolução": "var(--ember-warning)",
  "Em Conclusão": "var(--ember-info)",
  "Conclusão": "var(--ember-info)",
  "Vigilância": "var(--ember-accent)",
  "Encerrada": "var(--ember-text-faint)",
  "Encerrado": "var(--ember-text-faint)",
  "Falso Alarme": "var(--ember-text-faint)",
  "Resolução": "var(--ember-info)",
};

// Raw status text → display label (used in detail panel)
const STATUS_RAW_PT: Record<string, string> = {
  "Chegada ao TO": "Chegada ao TO",
  "Em Curso": "Em Curso",
  "Em Resolução": "Em Resolução",
  "Conclusão": "Conclusão",
  "Vigilância": "Em Vigilância",
  "Encerrada": "Encerrada",
  "Despacho": "Despacho",
  "Resolução": "Resolução",
  "Concluída": "Concluída",
  "Falso Alarme": "Falso Alarme",
  "Encerrado": "Encerrado",
  "Concluído": "Concluído",
};
const STATUS_RAW_EN: Record<string, string> = {
  "Chegada ao TO": "Arrival at scene",
  "Em Curso": "On course",
  "Em Resolução": "Resolution in progress",
  "Conclusão": "Concluded",
  "Vigilância": "Monitoring",
  "Encerrada": "Closed",
  "Despacho": "Dispatched",
  "Resolução": "Resolution",
  "Concluída": "Concluded",
  "Falso Alarme": "False alarm",
  "Encerrado": "Closed",
  "Concluído": "Concluded",
};

export function statusRawLabel(raw: string | undefined | null, lang: Language = "pt"): string {
  if (!raw) return "—";
  if (lang === "pt") return STATUS_RAW_PT[raw] ?? raw;
  return STATUS_RAW_EN[raw] ?? raw;
}

// ---------------- Source types ----------------

export type SourceType = "satellite" | "official" | "community" | "news";
export const SOURCE_LABEL: Record<SourceType, { pt: string; en: string }> = {
  satellite: { pt: "Satélite", en: "Satellite" },
  official: { pt: "Oficial", en: "Official" },
  community: { pt: "Comunidade", en: "Community" },
  news: { pt: "Notícias", en: "News" },
};

// ---------------- Portuguese date parsing ----------------
// ANEPC dates come as "DD/MM/YYYY HH:MM" (Lisbon local). Convert to ISO.
export function ptDateToISO(pt: string | undefined | null): string {
  if (!pt) return new Date().toISOString();
  const m = pt.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`;
}

// ---------------- Sorting ----------------

/**
 * Sort incidents by:
 *   1. status rank (active first, resolved last)
 *   2. severity rank (critical first)
 *   3. area burned (descending)
 *   4. firstDetected (most recent first)
 */
export function rankIncidents<T extends { status?: string; severity?: string; estimatedAreaHa?: number; firstDetected?: string }>(
  incidents: T[],
): T[] {
  return [...incidents].sort((a, b) => {
    const sa = STATUS_RANK[a.status as IncidentStatus] ?? 9;
    const sb = STATUS_RANK[b.status as IncidentStatus] ?? 9;
    if (sa !== sb) return sa - sb;
    const sevA = SEVERITY_RANK[a.severity as Severity] ?? 9;
    const sevB = SEVERITY_RANK[b.severity as Severity] ?? 9;
    if (sevA !== sevB) return sevA - sevB;
    const areaA = a.estimatedAreaHa || 0;
    const areaB = b.estimatedAreaHa || 0;
    if (areaA !== areaB) return areaB - areaA;
    return new Date(b.firstDetected || 0).getTime() - new Date(a.firstDetected || 0).getTime();
  });
}

// ---------------- Geo dedup ----------------

/**
 * Dedupe incidents that are at nearly the same lat/lon (within ~50m).
 * Used for top-priority list to avoid showing 5 cards named
 * "Junto à EN 18 (Évora)" when they're the same fire re-ingested.
 */
export function dedupeByLocation<T extends { geometry?: { coordinates?: [number, number] } }>(
  incidents: T[],
  tolerance = 0.001, // ~111m at the equator
): T[] {
  const out: T[] = [];
  for (const inc of incidents) {
    const c = inc.geometry?.coordinates;
    if (!c) {
      out.push(inc);
      continue;
    }
    const dup = out.find(
      (p) =>
        Math.abs((p.geometry?.coordinates?.[1] ?? 0) - c[1]) < tolerance &&
        Math.abs((p.geometry?.coordinates?.[0] ?? 0) - c[0]) < tolerance,
    );
    if (!dup) out.push(inc);
  }
  return out;
}

// ---------------- ANEPC normalization helpers (shared) ----------------
// Used by both the ingest pipeline and the /api/incidents read path.
// Pure functions to avoid duplication.

export function mapEventType(rasi: string): EventType {
  if (!rasi) return "other";
  if (rasi.includes("Rurais")) return "wildfire";
  if (rasi.includes("Urbanos")) return "urban_fire";
  if (rasi.includes("Outros Incêndios")) return "other_fire";
  return "other";
}

export function mapIncidentStatus(estadoAgrupado: string): IncidentStatus {
  if (!estadoAgrupado) return "detected";
  if (estadoAgrupado.includes("Despacho")) return "detected";
  if (estadoAgrupado.includes("Curso")) return "active";
  if (estadoAgrupado.includes("Resolu")) return "contained";
  // "Em Conclusão" means "being concluded" — still active, not yet closed.
  // Only fully terminated states (Encerrada / Encerrado / Falso Alarme) are resolved.
  if (estadoAgrupado.includes("Encerrada") || estadoAgrupado.includes("Falso Alarme")) return "resolved";
  if (estadoAgrupado.includes("Conclu")) return "contained";
  if (estadoAgrupado.includes("Vigil")) return "monitoring";
  return "detected";
}

export function mapSeverity(
  personnelTotal: number,
  assetsAerial: number,
  eventType: EventType,
  incidentStatus: IncidentStatus
): Severity {
  let peak: Severity;
  if (eventType === "wildfire") {
    if (assetsAerial >= 2 || personnelTotal >= 30) peak = "critical";
    else if (assetsAerial >= 1 || personnelTotal >= 15) peak = "high";
    else if (personnelTotal >= 5) peak = "medium";
    else peak = "low";
  } else if (eventType === "urban_fire") {
    if (personnelTotal >= 20) peak = "high";
    else if (personnelTotal >= 8) peak = "medium";
    else peak = "low";
  } else {
    peak = personnelTotal >= 15 ? "medium" : "low";
  }

  switch (incidentStatus) {
    case "resolved":
      return peak === "critical" ? "medium" : "low";
    case "contained":
    case "monitoring":
      return peak === "critical" ? "high" : peak === "high" ? "medium" : "low";
    default:
      return peak;
  }
}

export function freshnessScore(observedAt: string): number {
  const ageHr = (Date.now() - new Date(observedAt).getTime()) / 3_600_000;
  return Math.max(0, 1 - ageHr / 24);
}