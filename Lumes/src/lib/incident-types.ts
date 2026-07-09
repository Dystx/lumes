// IncidentSummary — single canonical type for incident data.
//
// TASK F (refactor plan): Eliminate `(i as any).rawProperties` casts and
// the dual-shape problem (LiveIncident vs adapted Incident) by defining
// one type and having all consumers use it.

import type {
  IncidentStatus,
  Severity,
  SourceType,
  Trust,
  VerificationStatus,
} from "./types";

export type { SourceType };

export type OperationalPhase =
  | "Em Despacho"
  | "Em Curso"
  | "Em Resolução"
  | "Em Conclusão"
  | "Vigilância"
  | "Encerrada"
  | "Falso Alarme"
  | string; // forward-compatible

/** Raw ANEPC properties — populated from /api/incidents properties field. */
export interface IncidentProperties {
  numero?: string;
  statusCode?: number;
  statusText?: string;
  statusGroup?: OperationalPhase;
  rasi?: string;
  naturezaText?: string;
  localidade?: string;
  endereco?: string;
  municipality?: string;
  parish?: string;
  region?: string;
  subregion?: string;
  personnelTotal?: number;
  personnelGround?: number;
  personnelAerial?: number;
  assetsGround?: number;
  assetsAerial?: number;
  durationMinutes?: number;
  displayName?: string;
  latitude?: number;
  longitude?: number;
}

export interface IncidentSummary {
  id: string;
  sourceId: string;
  sourceInternalId: string;
  sourceType: SourceType;
  displayName: string;
  severity: Severity;
  incidentStatus: IncidentStatus;
  /** Raw ANEPC status group (Em Despacho / Em Curso / etc.) */
  statusGroup?: OperationalPhase;
  /** Raw ANEPC status text (Despacho de 1º Alerta, etc.) */
  statusText?: string;
  estimatedAreaHa: number;
  firstDetected: string;
  lastUpdated: string;
  observedAt: string;
  ingestedAt: string;
  /** GeoJSON point — Portugal uses [lon, lat] */
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lon, lat]
  };
  trust: Trust;
  verification: VerificationStatus;
  eventType: "wildfire" | "urban_fire" | "other_fire" | "other";
  /** Convenience flattened location fields */
  municipality?: string;
  district?: string;
  parish?: string;
  locality?: string;
  /** Resource counts (flattened from properties for easier access) */
  personnel?: number;
  engines?: number;
  aircraft?: number;
  /** Original ANEPC properties (for advanced lookups) */
  properties?: IncidentProperties;
  /** Display labels (post-i18n) — populated by use-live-data */
  statusLabel?: { pt: string; en: string };
  severityLabel?: { pt: string; en: string };
}

/** Type guard: confirm an object looks like an IncidentSummary */
export function isIncidentSummary(x: unknown): x is IncidentSummary {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as any).id === "string" &&
    typeof (x as any).severity === "string" &&
    typeof (x as any).geometry === "object"
  );
}