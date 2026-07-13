import { describe, expect, it } from "vitest";
import {
  normalizeWeatherWarningsResponse,
  transformWeatherWarningsResponse,
} from "@/lib/weather-warnings-client";

const fetchedAt = "2026-07-13T10:00:00Z";
const warning = {
  id: "LSB-Wind-2026-07-13T10:00:00",
  area: "LSB",
  areaName: "Lisboa",
  type: "Wind",
  text: "Strong wind",
  level: "orange" as const,
  startTime: "2026-07-13T10:00:00",
  endTime: "2026-07-13T20:00:00",
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    source: "ipma-warnings",
    fetchedAt,
    count: 1,
    warnings: [warning],
    distribution: { red: 0, orange: 1, yellow: 0 },
    dataState: { state: "healthy", updatedAt: fetchedAt, source: "ipma-warnings" },
    ...overrides,
  };
}

describe("weather warnings client boundary", () => {
  it("accepts healthy warnings and IPMA timezone-less timestamps", () => {
    expect(normalizeWeatherWarningsResponse(response())).toMatchObject({ count: 1, warnings: [warning] });
  });

  it("preserves explicit empty state", () => {
    expect(normalizeWeatherWarningsResponse(response({
      count: 0,
      warnings: [],
      distribution: { red: 0, orange: 0, yellow: 0 },
      dataState: { state: "empty", updatedAt: fetchedAt, source: "ipma-warnings" },
    }))).toMatchObject({ count: 0, warnings: [] });
  });

  it("rejects wrong source, freshness, and count metadata", () => {
    expect(normalizeWeatherWarningsResponse(response({ source: "other" }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ fetchedAt: "not-a-date" }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ count: 2 }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ count: -1 }))).toBeNull();
  });

  it("rejects distribution mismatches and impossible data states", () => {
    expect(normalizeWeatherWarningsResponse(response({ distribution: { red: 1, orange: 1, yellow: 0 } }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({
      dataState: { state: "empty", updatedAt: fetchedAt },
    }))).toBeNull();
  });

  it("keeps valid mixed rows when the declared count matches", () => {
    expect(normalizeWeatherWarningsResponse(response({ warnings: [warning, { ...warning, text: 42 }], count: 1 }))).toMatchObject({
      count: 1,
      warnings: [warning],
    });
  });

  it("fails closed for all-invalid non-empty rows, duplicates, and bad enums", () => {
    expect(normalizeWeatherWarningsResponse(response({ warnings: [{ ...warning, text: 42 }] }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ warnings: [warning, warning], count: 2, distribution: { red: 0, orange: 2, yellow: 0 } }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ warnings: [{ ...warning, level: "green" }], count: 1 }))).toBeNull();
  });

  it("requires a valid start time and allows an intentionally empty end time", () => {
    expect(normalizeWeatherWarningsResponse(response({ warnings: [{ ...warning, endTime: "" }] }))).toMatchObject({ count: 1 });
    expect(normalizeWeatherWarningsResponse(response({ warnings: [{ ...warning, startTime: "2026-02-30T10:00:00Z" }] }))).toBeNull();
    expect(normalizeWeatherWarningsResponse(response({ warnings: [{ ...warning, endTime: "not-a-date" }] }))).toBeNull();
  });

  it("throws a stable error for malformed successful payloads", () => {
    expect(() => transformWeatherWarningsResponse({})).toThrow("Invalid weather warnings response envelope");
  });
});
