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

  it("returns a retryable incident failure without exposing the upstream message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream token=private")));
    const response = await incidentsGet();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      incidents: [], dataState: { state: "retryable-error" }, error: "Live incident data is temporarily unavailable.",
    });
  });

  it("returns typed healthy states for weather and fire risk", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "2026-07-09T12:00:00Z": { "1": { temperatura: 25, humidade: 30, intensidadeVentoKM: 10 } },
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

  it("exposes source degradation as an actionable response state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 1 }), { status: 200 })));
    const response = await sourceHealthGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sources: expect.any(Array),
      dataState: { state: "retryable-error", reason: "One or more sources need attention" },
    });
  });
});
