import { describe, expect, it } from "vitest";
import {
  normalizeIncidentNewsResponse,
  transformIncidentNewsResponse,
} from "@/lib/incident-news-client";

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "news-incident-1",
    title: "Incêndio florestal em Lisboa",
    source: "Público",
    sourceUrl: "https://news.test/fire",
    publishedAt: "2026-07-13T10:00:00.000Z",
    category: "press",
    summary: "Bombeiros combatem o incêndio.",
    municipality: "Lisboa",
    district: "Lisboa",
    matched: true,
    matchedOn: "Lisboa",
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    incidentId: "incident-1",
    count: 1,
    items: [validItem()],
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      source: "incident-news",
    },
    ...overrides,
  };
}

describe("client incident-news boundary", () => {
  it("normalizes a valid matched-news envelope and preserves trusted metadata", () => {
    expect(normalizeIncidentNewsResponse(validResponse())).toMatchObject({
      incidentId: "incident-1",
      count: 1,
      items: [{ sourceUrl: "https://news.test/fire", matchedOn: "Lisboa" }],
      dataState: { state: "healthy", source: "incident-news" },
    });
  });

  it("preserves a true empty response", () => {
    expect(normalizeIncidentNewsResponse(validResponse({
      count: 0,
      items: [],
      dataState: {
        state: "empty",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "incident-news",
      },
    }))).toMatchObject({ incidentId: "incident-1", count: 0, items: [], dataState: { state: "empty" } });
  });

  it("retains valid rows from a mixed payload when the declared count matches", () => {
    expect(normalizeIncidentNewsResponse(validResponse({
      count: 1,
      items: [validItem(), validItem({ id: "bad", sourceUrl: "javascript:alert(1)" })],
    }))?.items.map((item) => item.id)).toEqual(["news-incident-1"]);
  });

  it.each([
    ["missing incident id", { incidentId: "" }],
    ["count mismatch", { count: 2 }],
    ["invalid URL", { items: [validItem({ sourceUrl: "javascript:alert(1)" })] }],
    ["invalid timestamp", { items: [validItem({ publishedAt: "not-a-date" })] }],
    ["unknown category", { items: [validItem({ category: "social" })] }],
    ["invalid matched flag", { items: [validItem({ matched: "true" })] }],
    ["invalid trust metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeIncidentNewsResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects a non-empty payload when every item is malformed", () => {
    const response = validResponse({
      items: [validItem({ sourceUrl: "javascript:alert(1)" })],
    });

    expect(normalizeIncidentNewsResponse(response)).toBeNull();
    expect(() => transformIncidentNewsResponse(response)).toThrow("Invalid incident news response envelope");
  });
});
