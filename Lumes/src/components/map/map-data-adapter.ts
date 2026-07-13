export interface FireRiskFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { rcm: number; dico: string };
}

export interface FireStationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { name?: string; id: number };
}

export interface RiskRecordInput {
  longitude: number;
  latitude: number;
  rcm: number;
  dico: string;
}

export interface StationRecordInput {
  lon: number;
  lat: number;
  name?: string;
  id: number;
}

export interface SatelliteFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    frp: number;
    confidence: number;
    brightness: number;
    satellite: string;
    instrument: string;
    observedAt: string;
  };
}

function isSatelliteFeature(
  value: SatelliteDetection | SatelliteFeature,
): value is SatelliteFeature {
  return "type" in value && value.type === "Feature";
}

export function toFireRiskFeatures(
  records: readonly RiskRecordInput[] | null | undefined,
  rcmFilter: number | null,
): FireRiskFeature[] {
  return (records ?? [])
    .filter((record) => typeof record.dico === "string" && record.dico.trim().length > 0)
    .filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude))
    .filter((record) => record.latitude >= 36.95 && record.latitude <= 42.15 && record.longitude >= -9.5 && record.longitude <= -6)
    .filter((record) => Number.isInteger(record.rcm) && record.rcm >= 0 && record.rcm <= 5)
    .filter((record) => rcmFilter === null || record.rcm === rcmFilter)
    .map((record) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [record.longitude, record.latitude] as [number, number] },
      properties: { rcm: record.rcm, dico: record.dico },
    }));
}

export function toFireStationFeatures(
  stations: readonly StationRecordInput[] | null | undefined,
): FireStationFeature[] {
  return (stations ?? []).map((station) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [station.lon, station.lat] as [number, number] },
    properties: { name: station.name, id: station.id },
  }));
}

export function toSatelliteFeatures(
  detections: readonly (SatelliteDetection | SatelliteFeature)[] | null | undefined,
): SatelliteFeature[] {
  return (detections ?? []).map((detection) => {
    if (isSatelliteFeature(detection)) {
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [...detection.geometry.coordinates] as [number, number] },
        properties: { ...detection.properties },
      };
    }

    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [...detection.geometry.coordinates] as [number, number] },
      properties: {
        id: detection.id,
        frp: detection.properties.frp,
        confidence: detection.properties.confidence,
        brightness: detection.properties.brightness,
        satellite: detection.properties.satellite,
        instrument: detection.properties.instrument,
        observedAt: detection.observedAt,
      },
    };
  });
}
import type { SatelliteDetection } from "@/lib/types";
