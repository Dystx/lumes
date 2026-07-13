import { describe, expect, it } from "vitest";
import { normalizeOpenMeteoSnapshot } from "@/lib/risk/composite";

describe("Open-Meteo snapshot normalization", () => {
  it("returns a finite weather snapshot and preserves missing precipitation compatibility", () => {
    expect(normalizeOpenMeteoSnapshot({
      current: {
        temperature_2m: 31,
        relative_humidity_2m: 25,
        wind_speed_10m: 22,
        wind_direction_10m: 180,
      },
    })).toEqual({
      temperatureC: 31,
      relativeHumidityPct: 25,
      windSpeedKmh: 22,
      windFromDeg: 180,
      precipitationMm24h: 0,
    });
  });

  it.each([
    ["missing current", {}],
    ["string humidity", { current: { temperature_2m: 31, relative_humidity_2m: "dry", wind_speed_10m: 22, wind_direction_10m: 180, precipitation: 0 } }],
    ["out-of-range humidity", { current: { temperature_2m: 31, relative_humidity_2m: 101, wind_speed_10m: 22, wind_direction_10m: 180, precipitation: 0 } }],
    ["negative wind", { current: { temperature_2m: 31, relative_humidity_2m: 25, wind_speed_10m: -1, wind_direction_10m: 180, precipitation: 0 } }],
    ["invalid direction", { current: { temperature_2m: 31, relative_humidity_2m: 25, wind_speed_10m: 22, wind_direction_10m: 361, precipitation: 0 } }],
    ["negative precipitation", { current: { temperature_2m: 31, relative_humidity_2m: 25, wind_speed_10m: 22, wind_direction_10m: 180, precipitation: -1 } }],
  ])("rejects %s", (_label, value) => {
    expect(normalizeOpenMeteoSnapshot(value)).toBeNull();
  });
});
