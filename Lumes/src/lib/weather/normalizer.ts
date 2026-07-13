import type { WeatherObservation } from "@/lib/types";
import { normalizeObservationTimestamp } from "@/lib/weather/observations";

interface WeatherObservationInput {
  stationId: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  timestamp: string;
  raw: Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalFiniteNumber(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

/** Normalize one untrusted IPMA station observation into a renderable DTO. */
export function normalizeWeatherObservation(input: WeatherObservationInput): WeatherObservation | null {
  const timestamp = normalizeObservationTimestamp(input.timestamp);
  const temperature = finiteNumber(input.raw.temperatura);
  const humidity = finiteNumber(input.raw.humidade);
  const windSpeedKmh = finiteNumber(input.raw.intensidadeVentoKM);
  const windDirectionId = finiteNumber(input.raw.idDireccVento);

  if (
    timestamp === null
    || temperature === null
    || humidity === null
    || windSpeedKmh === null
    || windDirectionId === null
    || humidity < 0
    || humidity > 100
    || windSpeedKmh < 0
    || !Number.isInteger(windDirectionId)
    || windDirectionId < 0
    || windDirectionId > 8
  ) return null;

  return {
    stationId: input.stationId,
    stationName: input.stationName,
    stationLat: input.stationLat,
    stationLon: input.stationLon,
    timestamp,
    temperature,
    humidity,
    windSpeedKmh,
    windDirectionId,
    precipitation: optionalFiniteNumber(input.raw.precAcumulada),
    radiation: optionalFiniteNumber(input.raw.radiacao),
    pressure: optionalFiniteNumber(input.raw.pressao),
  };
}
