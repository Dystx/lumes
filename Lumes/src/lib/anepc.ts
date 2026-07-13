// Shared ANEPC/Prociv ArcGIS parsing and normalization.
// Both the read API and the persistence ingest pipeline use this adapter so
// malformed upstream payloads are bounded once and domain fields cannot drift.

import type { LiveIncident, VerificationStatus } from "@/lib/types";
import {
  freshnessScore,
  mapEventType,
  mapIncidentStatus,
  mapSeverity,
  ptDateToISO,
} from "@/lib/incident";
import { presentIncident } from "@/lib/incident-presentation";

const INCIDENT_EVENT_TYPES = new Set(["wildfire", "urban_fire", "other_fire"]);

const PORTUGAL_COORDINATE_REGIONS = [
  { south: 36.5, north: 42.2, west: -9.5, east: -6 },
  { south: 32.3, north: 32.9, west: -17.4, east: -16.2 },
  { south: 36.8, north: 40, west: -31.5, east: -24 },
] as const;

export interface RawANepcProps {
  ID_oc: number;
  Numero: string;
  CodEstadoOcorrencia: number;
  EstadoOcorrencia: string;
  EstadoAgrupado: string;
  DataInicioOcorrencia: string;
  RASI: string;
  Natureza: string;
  Regiao: string;
  SubRegiao: string;
  Concelho: string;
  Freguesia: string;
  Localidade: string;
  Endereco: string;
  OperacionaisTerrestres: number;
  OPAereos: number;
  Operacionais: number;
  MeiosTerrestres: number;
  MeiosAereos: number;
  Latitude: number;
  Longitude: number;
  DuracaoMinutos: number;
}

export interface RawANepcFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: RawANepcProps;
}

export interface ParsedANepcFeatureCollection {
  totalRaw: number;
  features: RawANepcFeature[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : undefined;
  }
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed) ? parsed : undefined;
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isPortugalCoordinate(latitude: number, longitude: number): boolean {
  return PORTUGAL_COORDINATE_REGIONS.some((region) =>
    latitude >= region.south &&
    latitude <= region.north &&
    longitude >= region.west &&
    longitude <= region.east,
  );
}

function parseFeature(value: unknown): RawANepcFeature | null {
  if (!isRecord(value) || value.type !== "Feature") return null;
  const rawProperties = isRecord(value.properties) ? value.properties : {};
  const rawGeometry = isRecord(value.geometry) ? value.geometry : {};
  if (rawGeometry.type !== undefined && rawGeometry.type !== "Point") return null;
  const coordinates = Array.isArray(rawGeometry.coordinates) ? rawGeometry.coordinates : [];
  const longitude = finiteOrUndefined(rawProperties.Longitude) ?? finiteOrUndefined(coordinates[0]);
  const latitude = finiteOrUndefined(rawProperties.Latitude) ?? finiteOrUndefined(coordinates[1]);
  const id = nonNegativeInteger(rawProperties.ID_oc);
  const startTimestamp = ptDateToISO(text(rawProperties.DataInicioOcorrencia));
  if (
    id === undefined ||
    longitude === undefined ||
    latitude === undefined ||
    startTimestamp === null ||
    !isPortugalCoordinate(latitude, longitude)
  ) return null;

  const codEstadoOcorrencia = nonNegativeInteger(rawProperties.CodEstadoOcorrencia);
  const operacionaisTerrestres = nonNegativeInteger(rawProperties.OperacionaisTerrestres);
  const opAereos = nonNegativeInteger(rawProperties.OPAereos);
  const operacionais = nonNegativeInteger(rawProperties.Operacionais);
  const meiosTerrestres = nonNegativeInteger(rawProperties.MeiosTerrestres);
  const meiosAereos = nonNegativeInteger(rawProperties.MeiosAereos);
  const duracaoMinutos = nonNegativeInteger(rawProperties.DuracaoMinutos);
  if (
    codEstadoOcorrencia === undefined ||
    operacionaisTerrestres === undefined ||
    opAereos === undefined ||
    operacionais === undefined ||
    meiosTerrestres === undefined ||
    meiosAereos === undefined ||
    duracaoMinutos === undefined
  ) return null;

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      ID_oc: id,
      Numero: text(rawProperties.Numero),
      CodEstadoOcorrencia: codEstadoOcorrencia,
      EstadoOcorrencia: text(rawProperties.EstadoOcorrencia),
      EstadoAgrupado: text(rawProperties.EstadoAgrupado),
      DataInicioOcorrencia: text(rawProperties.DataInicioOcorrencia),
      RASI: text(rawProperties.RASI),
      Natureza: text(rawProperties.Natureza),
      Regiao: text(rawProperties.Regiao),
      SubRegiao: text(rawProperties.SubRegiao),
      Concelho: text(rawProperties.Concelho),
      Freguesia: text(rawProperties.Freguesia),
      Localidade: text(rawProperties.Localidade),
      Endereco: text(rawProperties.Endereco),
      OperacionaisTerrestres: operacionaisTerrestres,
      OPAereos: opAereos,
      Operacionais: operacionais,
      MeiosTerrestres: meiosTerrestres,
      MeiosAereos: meiosAereos,
      Latitude: latitude,
      Longitude: longitude,
      DuracaoMinutos: duracaoMinutos,
    },
  };
}

export function parseANepcFeatureCollection(value: unknown): ParsedANepcFeatureCollection | null {
  if (!isRecord(value) || !Array.isArray(value.features)) return null;
  return {
    totalRaw: value.features.length,
    features: value.features
      .map(parseFeature)
      .filter((feature): feature is RawANepcFeature => feature !== null),
  };
}

export function normalizeANepcFeature(feature: RawANepcFeature): LiveIncident | null {
  const p = feature.properties;
  const rasi = p.RASI;
  const eventType = mapEventType(rasi);
  const incidentStatus = mapIncidentStatus(p.EstadoAgrupado);
  const severity = mapSeverity(p.Operacionais, p.MeiosAereos, eventType, incidentStatus);
  const observedAt = ptDateToISO(p.DataInicioOcorrencia);
  if (observedAt === null) return null;
  const verificationStatus: VerificationStatus = "officially-verified";
  const freshness = freshnessScore(observedAt);
  const confidence = 0.92 * freshness + 0.05;
  const displayName = p.Localidade || p.Concelho || p.Freguesia || `Ocorrência ${p.Numero || p.ID_oc}`;

  const incident: LiveIncident = {
    id: `anepc-${p.ID_oc}`,
    sourceId: "anepc-prociv-arcgis",
    sourceInternalId: String(p.ID_oc),
    observedAt,
    ingestedAt: new Date().toISOString(),
    geometry: feature.geometry,
    sourceType: "official",
    properties: {
      numero: p.Numero,
      statusCode: p.CodEstadoOcorrencia,
      statusText: p.EstadoOcorrencia,
      statusGroup: p.EstadoAgrupado,
      rasi,
      naturezaText: p.Natureza,
      localidade: p.Localidade,
      endereco: p.Endereco,
      municipality: p.Concelho,
      parish: p.Freguesia,
      region: p.Regiao,
      subregion: p.SubRegiao,
      personnelTotal: p.Operacionais,
      personnelGround: p.OperacionaisTerrestres,
      personnelAerial: p.OPAereos,
      assetsGround: p.MeiosTerrestres,
      assetsAerial: p.MeiosAereos,
      durationMinutes: p.DuracaoMinutos,
    },
    trust: {
      confidence,
      sourceReputation: 0.95,
      verificationStatus,
      corroborationCount: 0,
      freshnessScore: freshness,
    },
    eventType,
    incidentStatus,
    severity,
    displayName: `${displayName} (${p.Concelho || "—"})`,
    estimatedAreaHa: 0,
    firstDetected: observedAt,
    lastUpdated: observedAt,
  };

  return { ...incident, displayName: presentIncident(incident, "pt").title };
}

export function isFireIncident(incident: LiveIncident): boolean {
  return INCIDENT_EVENT_TYPES.has(incident.eventType);
}
