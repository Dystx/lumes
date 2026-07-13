import type { FireRiskResponse, WeatherObservation, WeatherResponse } from "@/lib/types";
import type { Incident } from "@/lib/sample-data";

export interface NearestStation {
  station: WeatherObservation;
  distanceKm: number;
}

export interface NearestFireRisk {
  rcm: number;
  dico: string;
  distanceKm: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180)
      * Math.cos((lat2 * Math.PI) / 180)
      * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

export function findNearestStation(observations: WeatherResponse | null, lat: number, lon: number): NearestStation | null {
  if (!observations?.observations?.length) return null;
  let nearest: WeatherObservation | null = null;
  let nearestDist = Infinity;
  for (const observation of observations.observations) {
    if (observation.stationLat == null || observation.stationLon == null) continue;
    const distanceKm = haversine(lat, lon, observation.stationLat, observation.stationLon);
    if (distanceKm < nearestDist) {
      nearestDist = distanceKm;
      nearest = observation;
    }
  }
  return nearest ? { station: nearest, distanceKm: nearestDist } : null;
}

export function findFireRisk(risk: FireRiskResponse | null, lat: number, lon: number): NearestFireRisk | null {
  if (!risk?.records?.length) return null;
  let nearest: FireRiskResponse["records"][number] | null = null;
  let nearestDist = Infinity;
  for (const record of risk.records) {
    const distanceKm = haversine(lat, lon, record.latitude, record.longitude);
    if (distanceKm < nearestDist) {
      nearestDist = distanceKm;
      nearest = record;
    }
  }
  return nearest ? { rcm: nearest.rcm, dico: nearest.dico, distanceKm: nearestDist } : null;
}

const WIND_DIRECTION_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const RCM_TO_IPMA_RISK: Record<number, Incident["ipmaRisk"]> = {
  1: "reduced",
  2: "moderate",
  3: "high",
  4: "very_high",
  5: "maximum",
};

/**
 * Add nearby IPMA context to a live incident without mutating the source
 * object. Sample incidents already carry curated context and are returned as
 * is so playback and fallback data remain stable.
 */
export function enrichIncidentWithLiveContext(
  incident: Incident,
  weatherData: WeatherResponse | null,
  fireRiskData: FireRiskResponse | null,
): Incident {
  if (!incident || !incident.isLive) return incident;

  const enriched = { ...incident };
  const nearestStation = findNearestStation(weatherData, incident.latitude, incident.longitude);
  if (nearestStation && nearestStation.distanceKm < 50) {
    const observation = nearestStation.station;
    enriched.windKmh = observation.windSpeedKmh;
    enriched.humidity = observation.humidity;
    enriched.temperatureC = observation.temperature;
    enriched.windDirection = WIND_DIRECTION_LABELS[observation.windDirectionId] ?? "—";
  }

  const nearestRisk = findFireRisk(fireRiskData, incident.latitude, incident.longitude);
  if (nearestRisk) {
    enriched.ipmaRisk = RCM_TO_IPMA_RISK[nearestRisk.rcm] ?? "reduced";
  }

  return enriched;
}
