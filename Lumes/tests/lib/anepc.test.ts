import { describe, expect, it } from "vitest";
import { normalizeANepcFeature, parseANepcFeatureCollection } from "@/lib/anepc";
import { freshnessScore, ptDateToISO } from "@/lib/incident";

const validProperties = {
  ID_oc: 1,
  Numero: "1",
  CodEstadoOcorrencia: 1,
  EstadoOcorrencia: "Em Curso",
  EstadoAgrupado: "Em Curso",
  DataInicioOcorrencia: "01/07/2026 12:00",
  RASI: "Incêndios Rurais DECIR",
  Natureza: "Incêndio",
  Regiao: "Lisboa",
  SubRegiao: "Lisboa",
  Concelho: "Lisboa",
  Freguesia: "Misericórdia",
  Localidade: "Lisboa",
  Endereco: "Rua",
  OperacionaisTerrestres: 2,
  OPAereos: 0,
  Operacionais: 3,
  MeiosTerrestres: 1,
  MeiosAereos: 0,
  Latitude: 38.72,
  Longitude: -9.14,
  DuracaoMinutos: 10,
};

describe("shared ANEPC adapter", () => {
  it("converts Lisbon local timestamps with seasonal offsets", () => {
    expect(ptDateToISO("01/07/2026 12:00")).toBe("2026-07-01T11:00:00Z");
    expect(ptDateToISO("01/01/2026 12:00")).toBe("2026-01-01T12:00:00Z");
    expect(ptDateToISO("2026-07-01 12:00:00")).toBe("2026-07-01T11:00:00Z");
  });

  it("clamps future freshness and rejects malformed incident IDs", () => {
    expect(freshnessScore(new Date(Date.now() + 60 * 60 * 1000).toISOString())).toBe(1);

    const parsed = parseANepcFeatureCollection({
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: validProperties },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.15, 38.73] }, properties: { ...validProperties, ID_oc: -1 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.16, 38.74] }, properties: { ...validProperties, ID_oc: 1.5 } },
      ],
    });

    expect(parsed?.features.map((feature) => feature.properties.ID_oc)).toEqual([1]);
  });

  it("filters malformed features while preserving raw count", () => {
    const parsed = parseANepcFeatureCollection({
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: validProperties },
        { type: "Feature", geometry: { type: "Point", coordinates: ["bad", 38.72] }, properties: { ...validProperties, Latitude: "bad", Longitude: "bad" } },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[-9.14, 38.72], [-9.15, 38.73]] }, properties: { ...validProperties, ID_oc: 4 } },
        { type: "not-a-feature", properties: validProperties },
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { ...validProperties, Latitude: 0, Longitude: 0 } },
      ],
    });

    expect(parsed).toMatchObject({ totalRaw: 5, features: [{ properties: { ID_oc: 1 } }] });

    const propertyCoordinateFallback = parseANepcFeatureCollection({
      features: [{ type: "Feature", properties: validProperties }],
    });
    expect(propertyCoordinateFallback?.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [-9.14, 38.72] },
      properties: { ID_oc: 1 },
    });
  });

  it("drops valid-geometry features with malformed operational scalars", () => {
    const parsed = parseANepcFeatureCollection({
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: validProperties },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.15, 38.73] }, properties: { ...validProperties, ID_oc: 2, Operacionais: "3foo" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.16, 38.74] }, properties: { ...validProperties, ID_oc: 3, MeiosAereos: Infinity } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.17, 38.75] }, properties: { ...validProperties, ID_oc: 4, OperacionaisTerrestres: -1 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.18, 38.76] }, properties: { ...validProperties, ID_oc: 5, DuracaoMinutos: NaN } },
      ],
    });

    expect(parsed).toMatchObject({ totalRaw: 5, features: [{ properties: { ID_oc: 1 } }] });
    expect(parsed?.features).toHaveLength(1);
  });

  it("drops features with missing or malformed start timestamps", () => {
    const parsed = parseANepcFeatureCollection({
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: validProperties },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.15, 38.73] }, properties: { ...validProperties, ID_oc: 2, DataInicioOcorrencia: "not-a-date" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.16, 38.74] }, properties: { ...validProperties, ID_oc: 3, DataInicioOcorrencia: "" } },
      ],
    });

    expect(parsed?.features.map((feature) => feature.properties.ID_oc)).toEqual([1]);
  });

  it("preserves valid Portuguese mainland and island coordinates", () => {
    const parsed = parseANepcFeatureCollection({
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: { ...validProperties, ID_oc: 1 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-16.91, 32.65] }, properties: { ...validProperties, ID_oc: 2 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-25.67, 37.74] }, properties: { ...validProperties, ID_oc: 3 } },
      ],
    });

    expect(parsed?.features.map((feature) => feature.properties.ID_oc)).toEqual([1, 2, 3]);
  });

  it("normalizes a valid feature into the official incident contract", () => {
    const parsed = parseANepcFeatureCollection({
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-9.14, 38.72] }, properties: validProperties }],
    });
    const incident = normalizeANepcFeature(parsed!.features[0]);

    expect(incident).toMatchObject({
      id: "anepc-1",
      sourceType: "official",
      eventType: "wildfire",
      incidentStatus: "active",
      geometry: { coordinates: [-9.14, 38.72] },
    });
  });
});
