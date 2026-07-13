// Composite fire-risk computation.
//
// Composite risk = biomass_weight × weather_weight × topo_weight, each
// normalised to [0, 1]. The result is then mapped to a categorical scale.
// Weights follow the IFWI/GWIS guidance: biomass matters most for
// intensity, weather matters most for ignition probability.
//
// Live weather comes from Open-Meteo's free, no-key API. Topo factor is
// a simple slope proxy from EU-DEM (we use a constant 1.0 default until
// the DEM is integrated).

import type { BiomassProfile, SpeciesGroup } from "../biomass/equations";

export interface WeatherSnapshot {
  temperatureC: number;       // 2 m air temp
  relativeHumidityPct: number;
  windSpeedKmh: number;
  windFromDeg: number;        // 0=N, 90=E
  precipitationMm24h: number;
}

export interface RiskResult {
  score: number;                          // 0–100 continuous
  category: "low" | "moderate" | "high" | "very_high" | "extreme";
  ignitionLikelihood: number;             // 0–1
  intensityPotential: number;              // 0–1
  components: {
    biomassFactor: number;
    weatherFactor: number;
    topoFactor: number;
  };
  weather: WeatherSnapshot;
  source: string;
}

const WEIGHT_BIOMASS = 0.45;
const WEIGHT_WEATHER = 0.50;
const WEIGHT_TOPO = 0.05;

export function computeRisk(args: {
  biomass: BiomassProfile;
  weather: WeatherSnapshot;
  topoFactor?: number; // 0..1, default 0.5
}): RiskResult {
  const { biomass, weather } = args;
  const topo = args.topoFactor ?? 0.5;

  // Biomass factor: 30 t/ha = low, 150 t/ha = very high.
  const biomassFactor = Math.min(1, biomass.tonsPerHectare / 150);

  // Weather factor: blend temperature, humidity, wind, recent precip.
  // Each contributes 0..1.
  const dryness = 1 - Math.min(1, weather.relativeHumidityPct / 60);
  const heat = Math.min(1, Math.max(0, (weather.temperatureC - 5) / 40));
  const wind = Math.min(1, weather.windSpeedKmh / 50);
  const drought = Math.min(1, Math.max(0, (5 - weather.precipitationMm24h) / 5));
  const weatherFactor = (dryness * 0.40) + (heat * 0.20) + (wind * 0.25) + (drought * 0.15);

  const continuous = 100 * (
    biomassFactor * WEIGHT_BIOMASS +
    weatherFactor * WEIGHT_WEATHER +
    topo * WEIGHT_TOPO
  );

  let category: RiskResult["category"] = "low";
  if (continuous > 80) category = "extreme";
  else if (continuous > 65) category = "very_high";
  else if (continuous > 45) category = "high";
  else if (continuous > 25) category = "moderate";

  return {
    score: Math.round(continuous * 10) / 10,
    category,
    ignitionLikelihood: Math.min(1, weatherFactor * 0.85 + 0.05),
    intensityPotential: Math.min(1, biomassFactor * 0.65 + weatherFactor * 0.35),
    components: {
      biomassFactor: Math.round(biomassFactor * 100) / 100,
      weatherFactor: Math.round(weatherFactor * 100) / 100,
      topoFactor: topo,
    },
    weather,
    source: "computed in-process",
  };
}

export interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    precipitation: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalize the untrusted Open-Meteo JSON before it reaches computeRisk().
 * Missing precipitation remains compatible with the provider's optional
 * response shape and is treated as zero; malformed values are rejected.
 */
export function normalizeOpenMeteoSnapshot(value: unknown): WeatherSnapshot | null {
  if (!isRecord(value) || !isRecord(value.current)) return null;

  const current = value.current;
  const temperatureC = finiteNumber(current.temperature_2m);
  const relativeHumidityPct = finiteNumber(current.relative_humidity_2m);
  const windSpeedKmh = finiteNumber(current.wind_speed_10m);
  const windFromDeg = finiteNumber(current.wind_direction_10m);
  const precipitationMm24h = current.precipitation === undefined || current.precipitation === null
    ? 0
    : finiteNumber(current.precipitation);

  if (
    temperatureC === null
    || relativeHumidityPct === null
    || windSpeedKmh === null
    || windFromDeg === null
    || precipitationMm24h === null
    || relativeHumidityPct < 0
    || relativeHumidityPct > 100
    || windSpeedKmh < 0
    || windFromDeg < 0
    || windFromDeg > 360
    || precipitationMm24h < 0
  ) {
    return null;
  }

  return {
    temperatureC,
    relativeHumidityPct,
    windSpeedKmh,
    windFromDeg,
    precipitationMm24h,
  };
}

export async function fetchOpenMeteoWeather(lat: number, lon: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation",
    timezone: "Europe/Lisbon",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const snapshot = normalizeOpenMeteoSnapshot(await r.json());
  if (!snapshot) throw new Error("Open-Meteo returned an invalid current snapshot");
  return snapshot;
}
