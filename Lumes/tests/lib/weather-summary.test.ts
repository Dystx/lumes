import { describe, expect, it } from "vitest";
import { buildWeatherSummary } from "@/lib/weather-summary";
import type { WeatherResponse } from "@/lib/types";

function weatherWithObservations(observations: WeatherResponse["observations"]): WeatherResponse {
  return {
    source: "ipma",
    fetchedAt: "2026-07-12T10:00:00Z",
    timestamp: "2026-07-12T10:00:00Z",
    count: observations.length,
    observations,
  };
}

describe("weather summary", () => {
  it("returns null when weather data has no observations", () => {
    expect(buildWeatherSummary(null)).toBeNull();
    expect(buildWeatherSummary(weatherWithObservations([]))).toBeNull();
  });

  it("ignores observations missing a required metric", () => {
    const completeObservation: WeatherResponse["observations"][number] = {
      stationId: "complete",
      stationLat: 39,
      stationLon: -8,
      timestamp: "2026-07-12T10:00:00Z",
      temperature: 30,
      humidity: 20,
      windSpeedKmh: 25,
      windDirectionId: 0,
      precipitation: 0,
      radiation: 0,
      pressure: 0,
    };
    const incomplete = weatherWithObservations([
      {
        stationId: "missing-humidity",
        temperature: 99,
        humidity: null,
        windSpeedKmh: 99,
      } as unknown as WeatherResponse["observations"][number],
      completeObservation,
    ]);

    expect(buildWeatherSummary(incomplete)).toEqual({
      avgTemp: 30,
      avgHumidity: 20,
      maxWind: 25,
      stationCount: 1,
    });
  });

  it("calculates averages, maximum wind, and station count", () => {
    const weather = weatherWithObservations([
      {
        stationId: "one",
        timestamp: "2026-07-12T10:00:00Z",
        temperature: 20,
        humidity: 40,
        windSpeedKmh: 10,
        windDirectionId: 0,
        precipitation: 0,
        radiation: 0,
        pressure: 0,
      },
      {
        stationId: "two",
        timestamp: "2026-07-12T10:00:00Z",
        temperature: 30,
        humidity: 20,
        windSpeedKmh: 35,
        windDirectionId: 1,
        precipitation: 0,
        radiation: 0,
        pressure: 0,
      },
    ]);

    expect(buildWeatherSummary(weather)).toEqual({
      avgTemp: 25,
      avgHumidity: 30,
      maxWind: 35,
      stationCount: 2,
    });
  });
});
