import { describe, expect, it } from "vitest";
import { SAMPLE_INCIDENTS } from "@/lib/sample-data";
import { enrichIncidentWithLiveContext } from "@/lib/incident-context";
import type { FireRiskResponse, WeatherResponse } from "@/lib/types";

const weatherAtIncident: WeatherResponse = {
  source: "ipma",
  fetchedAt: "2026-07-12T10:00:00Z",
  timestamp: "2026-07-12T10:00:00Z",
  count: 1,
  observations: [{
    stationId: "station-1",
    stationLat: 39.4,
    stationLon: -8.2,
    timestamp: "2026-07-12T10:00:00Z",
    temperature: 34,
    humidity: 18,
    windSpeedKmh: 31,
    windDirectionId: 2,
    precipitation: 0,
    radiation: 500,
    pressure: 1010,
  }],
};

const riskAtIncident: FireRiskResponse = {
  source: "ipma",
  fetchedAt: "2026-07-12T10:00:00Z",
  dataPrev: "2026-07-12",
  dataRun: "2026-07-12T06:00:00Z",
  count: 1,
  distribution: { 5: 1 },
  records: [{
    dico: "123456",
    latitude: 39.4,
    longitude: -8.2,
    rcm: 5,
    dataPrev: "2026-07-12",
  }],
};

describe("incident context enrichment", () => {
  it("does not enrich sample incidents that already contain context", () => {
    const sample = SAMPLE_INCIDENTS[0];

    expect(enrichIncidentWithLiveContext(sample, weatherAtIncident, riskAtIncident)).toBe(sample);
  });

  it("adds nearby weather and fire-risk context to live incidents", () => {
    const liveIncident = {
      ...SAMPLE_INCIDENTS[0],
      isLive: true,
      latitude: 39.4,
      longitude: -8.2,
      windKmh: 0,
      windDirection: "—",
      humidity: 0,
      temperatureC: 0,
      ipmaRisk: "reduced" as const,
    };

    expect(enrichIncidentWithLiveContext(liveIncident, weatherAtIncident, riskAtIncident)).toMatchObject({
      windKmh: 31,
      windDirection: "E",
      humidity: 18,
      temperatureC: 34,
      ipmaRisk: "maximum",
    });
  });

  it("leaves live context unchanged when sources have no usable nearby record", () => {
    const liveIncident = {
      ...SAMPLE_INCIDENTS[0],
      isLive: true,
      latitude: 39.4,
      longitude: -8.2,
    };
    const remoteWeather = {
      ...weatherAtIncident,
      observations: [{ ...weatherAtIncident.observations[0], stationLat: 41.2, stationLon: -7.1 }],
    };
    const remoteRisk = {
      ...riskAtIncident,
      records: [{ ...riskAtIncident.records[0], latitude: 41.2, longitude: -7.1, rcm: 1 }],
    };

    expect(enrichIncidentWithLiveContext(liveIncident, remoteWeather, remoteRisk)).toMatchObject({
      windKmh: liveIncident.windKmh,
      windDirection: liveIncident.windDirection,
      humidity: liveIncident.humidity,
      temperatureC: liveIncident.temperatureC,
      // Risk lookup intentionally has no distance cutoff; preserve the old
      // nearest-record behavior even when the record is far away.
      ipmaRisk: "reduced",
    });
  });

  it("does not enrich a live incident when weather normalization yields no observations", () => {
    const liveIncident = {
      ...SAMPLE_INCIDENTS[0],
      isLive: true,
      latitude: 39.4,
      longitude: -8.2,
    };
    const emptyWeather: WeatherResponse = { ...weatherAtIncident, count: 0, observations: [] };

    expect(enrichIncidentWithLiveContext(liveIncident, emptyWeather, null)).toMatchObject({
      windKmh: liveIncident.windKmh,
      windDirection: liveIncident.windDirection,
      humidity: liveIncident.humidity,
      temperatureC: liveIncident.temperatureC,
    });
  });
});
