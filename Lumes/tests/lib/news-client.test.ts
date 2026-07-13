import { describe, expect, it } from "vitest";
import { normalizeNewsResponse, transformNewsResponse } from "@/lib/news-client";

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "rss-publico-fire-1",
    title: "Incêndio florestal em Sintra mobiliza bombeiros",
    source: "Público",
    sourceUrl: "https://news.test/sintra",
    publishedAt: "2026-07-13T10:00:00.000Z",
    category: "press",
    summary: "Operação em curso.",
    municipality: "Sintra",
    district: "Lisboa",
    matched: true,
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "lumes-curated",
    fetchedAt: "2026-07-13T10:01:00.000Z",
    matched: [validItem()],
    incidents: [],
    press: [],
    sources: [validItem({
      id: "src-anepc",
      title: "ANEPC — Autoridade Nacional de Emergência e Proteção Civil",
      source: "ANEPC",
      sourceUrl: "https://www.prociv.pt/",
      publishedAt: "2026-01-01T00:00:00Z",
      category: "official",
      summary: "Comunicados oficiais.",
      matched: undefined,
    })],
    placesTracked: ["Sintra"],
    placesMatched: ["Sintra"],
    placesUnmatched: [],
    counts: { matched: 1, incidents: 0, press: 1, sources: 1 },
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      source: "lumes-curated-news",
    },
    ...overrides,
  };
}

describe("client news boundary", () => {
  it("normalizes a valid aggregate envelope while preserving total press count", () => {
    expect(normalizeNewsResponse(validResponse())).toMatchObject({
      source: "lumes-curated",
      fetchedAt: "2026-07-13T10:01:00.000Z",
      matched: [{ id: "rss-publico-fire-1", sourceUrl: "https://news.test/sintra" }],
      press: [],
      counts: { matched: 1, incidents: 0, press: 1, sources: 1 },
      dataState: { state: "healthy", source: "lumes-curated-news" },
    });
  });

  it("preserves a true empty response without inventing rows", () => {
    expect(normalizeNewsResponse(validResponse({
      matched: [],
      incidents: [],
      press: [],
      sources: [],
      placesTracked: [],
      placesMatched: [],
      placesUnmatched: [],
      counts: { matched: 0, incidents: 0, press: 0, sources: 0 },
      dataState: {
        state: "empty",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "lumes-curated-news",
      },
    }))).toMatchObject({
      matched: [],
      counts: { matched: 0, incidents: 0, press: 0, sources: 0 },
      dataState: { state: "empty" },
    });
  });

  it("retains valid rows from a mixed array when declared counts match", () => {
    expect(normalizeNewsResponse(validResponse({
      matched: [validItem(), validItem({ id: "bad-row", sourceUrl: "javascript:alert(1)" })],
      counts: { matched: 1, incidents: 0, press: 1, sources: 1 },
    }))?.matched.map((item) => item.id)).toEqual(["rss-publico-fire-1"]);
  });

  it("accepts relative incident hrefs but rejects unsafe links", () => {
    expect(normalizeNewsResponse(validResponse({
      incidents: [validItem({
        id: "inc-1",
        category: "incident",
        matched: false,
        href: "/?incident=inc-1",
      })],
      counts: { matched: 1, incidents: 1, press: 1, sources: 1 },
    }))?.incidents[0].href).toBe("/?incident=inc-1");

    expect(normalizeNewsResponse(validResponse({
      matched: [validItem({ href: "javascript:alert(1)" })],
    }))).toBeNull();
  });

  it.each([
    ["missing source", { source: "" }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid category", { matched: [validItem({ category: "social" })] }],
    ["invalid article URL", { matched: [validItem({ sourceUrl: "javascript:alert(1)" })] }],
    ["invalid count", { counts: { matched: 1.5, incidents: 0, press: 1, sources: 1 } }],
    ["invalid places", { placesTracked: [" "] }],
    ["invalid severity", { matched: [validItem({ severity: "medium" })] }],
    ["invalid data state", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeNewsResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects a non-empty payload when every row in a required array is malformed", () => {
    const response = validResponse({
      matched: [validItem({ sourceUrl: "javascript:alert(1)" })],
      counts: { matched: 0, incidents: 0, press: 0, sources: 1 },
    });

    expect(normalizeNewsResponse(response)).toBeNull();
    expect(() => transformNewsResponse(response)).toThrow("Invalid news response envelope");
  });

  it("rejects duplicate IDs that would make rendered map/list keys ambiguous", () => {
    expect(normalizeNewsResponse(validResponse({
      matched: [validItem(), validItem({ id: "rss-publico-fire-1-copy" })],
      counts: { matched: 2, incidents: 0, press: 2, sources: 1 },
    }))).not.toBeNull();

    expect(normalizeNewsResponse(validResponse({
      matched: [validItem(), validItem({ id: "rss-publico-fire-1" })],
      counts: { matched: 2, incidents: 0, press: 2, sources: 1 },
    }))).toBeNull();
  });
});
