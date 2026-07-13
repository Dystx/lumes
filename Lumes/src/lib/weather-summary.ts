import type { WeatherResponse } from "@/lib/types";

export interface WeatherSummary {
  avgTemp: number;
  avgHumidity: number;
  maxWind: number;
  stationCount: number;
}

/** Build the compact IPMA summary shown in the operational sidebar. */
export function buildWeatherSummary(weather: WeatherResponse | null): WeatherSummary | null {
  const observations = (weather?.observations ?? []).filter(
    (observation) => observation.temperature != null
      && observation.humidity != null
      && observation.windSpeedKmh != null,
  );
  if (observations.length === 0) return null;

  const avgTemp = observations.reduce((sum, observation) => sum + (observation.temperature || 0), 0)
    / observations.length;
  const avgHumidity = observations.reduce((sum, observation) => sum + (observation.humidity || 0), 0)
    / observations.length;
  const maxWind = Math.max(...observations.map((observation) => observation.windSpeedKmh || 0));

  return {
    avgTemp,
    avgHumidity,
    maxWind,
    stationCount: observations.length,
  };
}
