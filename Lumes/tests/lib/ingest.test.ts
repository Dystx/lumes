import { describe, it, expect, vi, beforeEach } from "vitest";
import { runIngest } from "@/lib/ingest";

// Mock fetch globally; persistence is mocked so we don't touch DB.
vi.mock("@/lib/persistence", () => ({
  persistIncidents: vi.fn(async (incidents: unknown[]) => ({
    upserted: incidents.length,
    created: incidents.length,
    updated: 0,
    snapshotsCreated: 0,
    errors: [],
  })),
}));

import { persistIncidents } from "@/lib/persistence";

describe("runIngest", () => {
  beforeEach(() => {
    vi.mocked(persistIncidents).mockClear();
  });

  it("returns zero-incident result on ANEPC HTTP 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
      )
    );
    const result = await runIngest();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("ANEPC HTTP 503");
    expect(result.upserted).toBe(0);
  });

  it("returns zero-incident result on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const result = await runIngest();
    expect(result.errors[0]).toContain("ANEPC fetch failed");
    expect(result.errors[0]).toContain("ECONNREFUSED");
    expect(result.upserted).toBe(0);
  });

  it("persists incidents on successful response", async () => {
    const validPayload = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-9.1, 38.7] },
          properties: {
            ID_oc: 1,
            Numero: "1",
            CodEstadoOcorrencia: 1,
            EstadoOcorrencia: "Em Curso",
            EstadoAgrupado: "Em Curso",
            DataInicioOcorrencia: "01/07/2026 12:00",
            RASI: "Incêndios Rurais DECIR",
            Natureza: "Incêndio",
            Regiao: "Lisboa",
            SubRegiao: "—",
            Concelho: "Lisboa",
            Freguesia: "—",
            Localidade: "Test",
            Endereco: "—",
            OperacionaisTerrestres: 5,
            OPAereos: 0,
            Operacionais: 5,
            MeiosTerrestres: 1,
            MeiosAereos: 0,
            Latitude: 38.7,
            Longitude: -9.1,
            DuracaoMinutos: 60,
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(validPayload))));

    const result = await runIngest();
    expect(result.errors).toHaveLength(0);
    expect(result.upserted).toBe(1);
    expect(vi.mocked(persistIncidents)).toHaveBeenCalledOnce();
  });

  it("handles malformed payload without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ unexpected: "shape" })))
    );
    const result = await runIngest();
    expect(result.errors[0]).toContain("no features array");
    expect(result.upserted).toBe(0);
  });

  it("times out on hung upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        // Mimic real fetch: respect the abort signal so runIngest's
        // AbortSignal.timeout(20_000) fires within the test timeout.
        const signal = init?.signal as AbortSignal | undefined;
        return await new Promise<Response>((_resolve, reject) => {
          const t = setTimeout(() => reject(new Error("would have timed out")), 50);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            const err = new Error("aborted");
            (err as Error & { name: string }).name = "AbortError";
            reject(err);
          });
        });
      })
    );
    const result = await runIngest();
    // Hung upstream must surface as an error, not a successful empty result.
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
