import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";
import { resetRateLimit } from "@/lib/api/rate-limit";
import { GET as incidentsGet } from "@/app/api/incidents/route";
import { GET as weatherGet } from "@/app/api/weather/route";
import { GET as riskGet } from "@/app/api/fire-risk/route";
import { GET as dashboardGet } from "@/app/api/dashboard/route";
import { GET as sourceHealthGet } from "@/app/api/source-health/route";

const incidentFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-9.14, 38.72] },
  properties: {
    ID_oc: 1, Numero: "1", CodEstadoOcorrencia: 1, EstadoOcorrencia: "Em curso",
    EstadoAgrupado: "Em Curso", DataInicioOcorrencia: "2026-07-09 12:00:00",
    RASI: "Incêndios Rurais", Natureza: "Incêndio", Regiao: "Lisboa", SubRegiao: "Lisboa",
    Concelho: "Lisboa", Freguesia: "Misericórdia", Localidade: "Lisboa", Endereco: "Rua",
    OperacionaisTerrestres: 2, OPAereos: 0, Operacionais: 3, MeiosTerrestres: 1,
    MeiosAereos: 0, Latitude: 38.72, Longitude: -9.14, DuracaoMinutos: 10,
  },
};

describe("live data route contracts", () => {
  beforeEach(() => {
    invalidate();
    resetRateLimit();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns healthy incident data with a public cache contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [incidentFeature] }), { status: 200 })));
    const response = await incidentsGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    await expect(response.json()).resolves.toMatchObject({ count: 1, dataState: { state: "healthy" } });
  });

  it("returns an explicit empty state when ANEPC returns no valid features", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }],
    }), { status: 200 })));

    const response = await incidentsGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({
      count: 0,
      incidents: [],
      dataState: { state: "empty", source: "anepc-prociv-arcgis" },
    });
  });

  it("keeps valid ANEPC incidents while dropping malformed operational scalars", async () => {
    const malformedFeature = {
      ...incidentFeature,
      geometry: { type: "Point", coordinates: [-9.15, 38.73] },
      properties: { ...incidentFeature.properties, ID_oc: 2, Operacionais: "3foo" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [incidentFeature, malformedFeature] }), { status: 200 })));

    const response = await incidentsGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      count: 1,
      incidents: [{ id: "anepc-1", properties: { personnelTotal: 3 } }],
      dataState: { state: "healthy", source: "anepc-prociv-arcgis" },
    });
  });

  it("returns cacheable empty state when all ANEPC operational scalars are invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{
        ...incidentFeature,
        properties: { ...incidentFeature.properties, Operacionais: "Infinity" },
      }],
    }), { status: 200 })));

    const response = await incidentsGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({
      count: 0,
      incidents: [],
      dataState: { state: "empty", source: "anepc-prociv-arcgis" },
    });
  });

  it("returns cacheable empty state when ANEPC timestamps are invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{
        ...incidentFeature,
        properties: { ...incidentFeature.properties, DataInicioOcorrencia: "not-a-date" },
      }],
    }), { status: 200 })));

    const response = await incidentsGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(payload).toMatchObject({ count: 0, incidents: [], dataState: { state: "empty", source: "anepc-prociv-arcgis" } });
  });

  it("normalizes sentinel locality labels before returning incidents", async () => {
    const sentinelFeature = {
      ...incidentFeature,
      properties: { ...incidentFeature.properties, Localidade: "---", Concelho: "Viseu", Freguesia: "São João" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [sentinelFeature] }), { status: 200 })));
    const response = await incidentsGet();
    const body = await response.json();
    expect(body.incidents[0].displayName).toBe("Viseu");
  });

  it("returns a retryable incident failure without exposing the upstream message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream token=private")));
    const response = await incidentsGet();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      incidents: [], dataState: { state: "retryable-error" }, error: "Live incident data is temporarily unavailable.",
    });
  });

  it("shares a slow ANEPC load across concurrent requests", async () => {
    vi.useFakeTimers();
    try {
      const resolvers: Array<(response: Response) => void> = [];
      const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
        resolvers.push(resolve);
      }));
      vi.stubGlobal("fetch", fetchMock);

      const first = incidentsGet();
      await vi.advanceTimersByTimeAsync(0);
      const second = incidentsGet();
      await vi.advanceTimersByTimeAsync(5_100);

      for (const resolve of resolvers) {
        resolve(new Response(JSON.stringify({ features: [incidentFeature] }), { status: 200 }));
      }

      const [firstResponse, secondResponse] = await Promise.all([first, second]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      await expect(firstResponse.json()).resolves.toMatchObject({ count: 1 });
      await expect(secondResponse.json()).resolves.toMatchObject({ count: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares an upstream rejection and releases the guard for the next request", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error("first upstream failure"))
        .mockResolvedValueOnce(new Response(JSON.stringify({ features: [incidentFeature] }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const first = incidentsGet();
      const second = incidentsGet();
      await vi.advanceTimersByTimeAsync(5_100);
      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(firstResponse.status).toBe(500);
      expect(secondResponse.status).toBe(500);

      const retry = await incidentsGet();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(retry.status).toBe(200);
      await expect(retry.json()).resolves.toMatchObject({ count: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a redacted, non-cacheable weather failure", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream token=private")));

    const response = await weatherGet();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "ipma",
      observations: [],
      error: "Weather data is temporarily unavailable.",
      dataState: { state: "retryable-error" },
    });
    expect(JSON.stringify(payload)).not.toContain("upstream token=private");
  });

  it("uses the provider observation timestamp for source freshness", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-07-12T10:00:00": { "1": { temperatura: 24, humidade: 40, intensidadeVentoKM: 8, idDireccVento: 2 } },
        "2026-07-09T11:30:00Z": { "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { properties: { idEstacao: 1, localEstacao: "Lisboa" }, geometry: { coordinates: [-9.14, 38.72] } },
      ]), { status: 200 })));

    const response = await weatherGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.timestamp).toBe("2026-07-12T10:00:00");
    expect(body.dataState.sourceUpdatedAt).toBe("2026-07-12T09:00:00.000Z");
    expect(body.observations[0]).toMatchObject({ temperature: 24, timestamp: "2026-07-12T10:00:00" });
  });

  it("returns a cacheable explicit empty state when all observation timestamps are invalid", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-02-30T12:00:00Z": { "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 } },
        "not-a-timestamp": { "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { properties: { idEstacao: 1, localEstacao: "Lisboa" }, geometry: { coordinates: [-9.14, 38.72] } },
      ]), { status: 200 })));

    const response = await weatherGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(body).toMatchObject({
      count: 0,
      observations: [],
      timestamp: "",
      dataState: { state: "empty" },
    });
  });

  it("returns a redacted, non-cacheable fire-risk failure", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream token=private")));
    const response = await riskGet(new Request("http://localhost/api/fire-risk"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
    expect(JSON.stringify(payload)).not.toContain("upstream token=private");
  });

  it("returns typed healthy states for weather and fire risk", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-07-09T12:00:00Z": { "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { properties: { idEstacao: 1, localEstacao: "Lisboa" }, geometry: { coordinates: [-9.14, 38.72] } },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        dataPrev: "2026-07-09", dataRun: "2026-07-09", local: { "111": { latitude: 38.72, longitude: -9.14, data: { rcm: 3 } } },
      }), { status: 200 })));

    const weather = await weatherGet();
    expect(weather.status).toBe(200);
    await expect(weather.json()).resolves.toMatchObject({ count: 1, dataState: { state: "healthy" } });

    const risk = await riskGet(new Request("http://localhost/api/fire-risk"));
    expect(risk.status).toBe(200);
    await expect(risk.json()).resolves.toMatchObject({ count: 1, dataState: { state: "healthy" } });
  });

  it("drops malformed fire-risk records and reports an empty cacheable state", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      dataPrev: "2026-07-09",
      dataRun: "2026-07-09",
      local: { "bad": { latitude: "not-a-number", longitude: null, data: { rcm: "unknown" } } },
    }), { status: 200 })));

    const risk = await riskGet(new Request("http://localhost/api/fire-risk"));
    const body = await risk.json();
    expect(risk.status).toBe(200);
    expect(risk.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(body).toMatchObject({ count: 0, records: [], dataState: { state: "empty" } });
  });

  it("keeps valid fire-risk records while dropping malformed provider rows", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      dataPrev: "2026-07-09",
      dataRun: "2026-07-09",
      local: {
        valid: { latitude: 38.72, longitude: -9.14, data: { rcm: 3 } },
        invalid: { latitude: "bad", longitude: 0, data: { rcm: "unknown" } },
      },
    }), { status: 200 })));

    const risk = await riskGet(new Request("http://localhost/api/fire-risk"));
    const body = await risk.json();

    expect(body).toMatchObject({
      count: 1,
      records: [{ dico: "valid", latitude: 38.72, longitude: -9.14, rcm: 3 }],
      distribution: { 3: 1 },
      dataState: { state: "healthy" },
    });
  });

  it("does not cache rate-limited fire-risk responses", async () => {
    for (let index = 0; index < 30; index += 1) {
      await riskGet(new Request("http://localhost/api/fire-risk", { headers: { "x-real-ip": "fire-risk-test" } }));
    }
    const response = await riskGet(new Request("http://localhost/api/fire-risk", { headers: { "x-real-ip": "fire-risk-test" } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
  });

  it("drops malformed weather observations and reports an explicit empty state", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-07-09T12:00:00Z": { "1": { temperatura: "hot", humidade: null, intensidadeVentoKM: "fast", idDireccVento: "east" } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { properties: { idEstacao: 1, localEstacao: "Lisboa" }, geometry: { coordinates: ["bad", 38.72] } },
      ]), { status: 200 })));

    const weather = await weatherGet();
    const body = await weather.json();
    expect(body).toMatchObject({
      count: 0,
      observations: [],
      dataState: { state: "empty" },
    });
    expect(weather.headers.get("cache-control")).toContain("s-maxage=3600");
  });

  it("keeps valid weather observations while dropping malformed rows", async () => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-07-09T12:00:00Z": {
          "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10, idDireccVento: 2 },
          "2": { temperatura: "hot", humidade: null, intensidadeVentoKM: "fast", idDireccVento: "east" },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { properties: { idEstacao: 1, localEstacao: "Lisboa" }, geometry: { coordinates: [-9.14, 38.72] } },
        { properties: { idEstacao: 2, localEstacao: "Porto" }, geometry: { coordinates: [-8.61, 41.15] } },
      ]), { status: 200 })));

    const response = await weatherGet();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      count: 1,
      observations: [{ stationId: "1", temperature: 25, humidity: 30, windSpeedKmh: 10, windDirectionId: 2 }],
      dataState: { state: "healthy" },
    });
  });

  it("returns dashboard aggregates with an additive health state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidents: [{
        id: "incident-1", displayName: "Lisboa", severity: "high", incidentStatus: "active",
        estimatedAreaHa: 2, municipality: "Lisboa", properties: { personnelTotal: 4, assetsGround: 1, assetsAerial: 0 },
      }],
    }), { status: 200 })));

    const response = await dashboardGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    await expect(response.json()).resolves.toMatchObject({ summary: { total: 1, activeCount: 1 }, dataState: { state: "healthy" } });
  });

  it("keeps core headline healthy when only optional sources degrade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ count: 1 }), { status: 200 }))));
    const response = await sourceHealthGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      sources: expect.any(Array),
      dataState: { state: "healthy" },
    });
  });

  it("keeps optional source failures visible without poisoning core headline health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ count: 1 }), { status: 200 }))));
    const response = await sourceHealthGet();
    const body = await response.json();
    const firms = body.sources.find((source: { sourceId: string }) => source.sourceId === "nasa-firms-viirs");
    const anepc = body.sources.find((source: { sourceId: string }) => source.sourceId === "anepc-prociv-arcgis");

    expect(firms).toMatchObject({ tier: "optional", state: "error", dataState: "retryable-error" });
    expect(anepc).toMatchObject({ tier: "core", state: "healthy", dataState: "healthy" });
    expect(body.dataState).toMatchObject({ state: "healthy" });
  });
});
