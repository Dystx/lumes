export interface FireRiskForecastRecord {
  globalIdLocal?: number;
  idDistrito?: number;
  idConcelho?: number;
  rcm?: number;
  forecastDate?: string;
}

export interface FireRiskForecastEnvelope {
  data: FireRiskForecastRecord[];
}

export type ForecastNormalization =
  | { state: "healthy"; data: FireRiskForecastEnvelope }
  | { state: "empty"; reason: string; data: FireRiskForecastEnvelope }
  | { state: "invalid"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function normalizeRecord(value: unknown): FireRiskForecastRecord | null {
  if (!isRecord(value)) return null;

  const globalIdLocal = optionalInteger(value.globalIdLocal);
  const idDistrito = optionalInteger(value.idDistrito);
  const idConcelho = optionalInteger(value.idConcelho);
  const rcm = optionalInteger(value.rcm, 0, 5);
  const forecastDate = optionalDate(value.forecastDate);
  if (
    globalIdLocal === null
    || idDistrito === null
    || idConcelho === null
    || rcm === null
    || forecastDate === null
  ) return null;

  const hasKnownField = [globalIdLocal, idDistrito, idConcelho, rcm, forecastDate].some((field) => field !== undefined);
  if (!hasKnownField) return null;

  return {
    ...(globalIdLocal !== undefined ? { globalIdLocal } : {}),
    ...(idDistrito !== undefined ? { idDistrito } : {}),
    ...(idConcelho !== undefined ? { idConcelho } : {}),
    ...(rcm !== undefined ? { rcm } : {}),
    ...(forecastDate !== undefined ? { forecastDate } : {}),
  };
}

export function normalizeFireRiskForecast(value: unknown): ForecastNormalization {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return { state: "invalid", reason: "IPMA forecast envelope was malformed" };
  }

  const data = value.data
    .map(normalizeRecord)
    .filter((record): record is FireRiskForecastRecord => record !== null);
  if (data.length === 0) {
    return {
      state: "empty",
      reason: "IPMA returned no usable forecast rows",
      data: { data: [] },
    };
  }

  return { state: "healthy", data: { data } };
}
