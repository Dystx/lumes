import { describe, expect, it } from "vitest";
import { normalizeFireRiskForecast } from "@/lib/fire-risk/forecast-normalizer";

describe("fire-risk forecast normalization", () => {
  it("keeps finite known forecast fields and drops unknown fields", () => {
    expect(normalizeFireRiskForecast({
      data: [{
        globalIdLocal: 111,
        idDistrito: 11,
        idConcelho: 1106,
        rcm: 3,
        forecastDate: "2026-07-12",
        privateDetail: "not public",
      }],
    })).toEqual({
      state: "healthy",
      data: {
        data: [{
          globalIdLocal: 111,
          idDistrito: 11,
          idConcelho: 1106,
          rcm: 3,
          forecastDate: "2026-07-12",
        }],
      },
    });
  });

  it("classifies missing or unusable rows as empty", () => {
    expect(normalizeFireRiskForecast({ data: [{ globalIdLocal: "bad" }, { rcm: 9 }, {}] })).toMatchObject({
      state: "empty",
      data: { data: [] },
    });
  });

  it("rejects malformed top-level containers", () => {
    expect(normalizeFireRiskForecast({})).toMatchObject({ state: "invalid" });
    expect(normalizeFireRiskForecast([])).toMatchObject({ state: "invalid" });
    expect(normalizeFireRiskForecast({ data: "not-an-array" })).toMatchObject({ state: "invalid" });
  });
});
