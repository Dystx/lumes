import { describe, expect, it } from "vitest";
import { normalizeWeatherObservation } from "@/lib/weather/normalizer";
import {
  observationTimestampToISOString,
  selectLatestObservationTimestamp,
} from "@/lib/weather/observations";

const base = {
  stationId: "1",
  stationName: "Lisboa",
  stationLat: 38.72,
  stationLon: -9.14,
  timestamp: "2026-07-12T10:00:00Z",
};

describe("IPMA weather observation normalization", () => {
  it("selects the newest valid observation bucket by instant, not key order", () => {
    expect(selectLatestObservationTimestamp({
      "2026-07-12T10:00:00": {},
      "2026-07-12T09:30:00Z": {},
      "not-a-timestamp": {},
    })).toBe("2026-07-12T09:30:00Z");
  });

  it("resolves a timezone-less IPMA timestamp as Europe/Lisbon time", () => {
    expect(observationTimestampToISOString("2026-07-12T10:00:00")).toBe("2026-07-12T09:00:00.000Z");
  });

  it("preserves fractional seconds during timezone resolution and ordering", () => {
    expect(observationTimestampToISOString("2026-07-12T10:00:00.100")).toBe("2026-07-12T09:00:00.100Z");
    expect(selectLatestObservationTimestamp({
      "2026-07-12T10:00:00.100": {},
      "2026-07-12T10:00:00.900": {},
    })).toBe("2026-07-12T10:00:00.900");
  });

  it("returns no timestamp when every observation bucket key is invalid", () => {
    expect(selectLatestObservationTimestamp({
      "2026-02-30T12:00:00Z": {},
      "1": {},
      "": {},
    })).toBeNull();
  });

  it("normalizes required metrics and defaults optional metrics", () => {
    expect(normalizeWeatherObservation({
      ...base,
      raw: { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 },
    })).toMatchObject({
      stationId: "1",
      temperature: 25,
      humidity: 30,
      windSpeedKmh: 10,
      windDirectionId: 2,
      precipitation: 0,
      radiation: 0,
      pressure: 0,
    });
  });

  it.each([
    ["missing required metrics", { temperatura: 25, humidade: 30 }],
    ["invalid humidity", { temperatura: 25, humidade: 101, intensidadeVentoKM: 10, idDireccVento: 2 }],
    ["negative wind", { temperatura: 25, humidade: 30, intensidadeVentoKM: -1, idDireccVento: 2 }],
    ["invalid direction", { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 99 }],
  ])("rejects %s", (_label, raw) => {
    expect(normalizeWeatherObservation({ ...base, raw })).toBeNull();
  });

  it("accepts IPMA's timezone-less local timestamp format", () => {
    expect(normalizeWeatherObservation({
      ...base,
      timestamp: "2026-07-12T10:00:00",
      raw: { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 },
    })).toMatchObject({ timestamp: "2026-07-12T10:00:00" });
  });

  it("rejects an invalid observation timestamp", () => {
    expect(normalizeWeatherObservation({
      ...base,
      timestamp: "2026-02-30T10:00:00Z",
      raw: { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 },
    })).toBeNull();
  });
});
