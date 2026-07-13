import { describe, expect, it } from "vitest";
import {
  normalizeRegionalCommandsResponse,
  transformRegionalCommandsResponse,
} from "@/lib/regional-commands-client";

const fetchedAt = "2026-07-13T10:00:00Z";
const command = {
  id: "anepc-cmd-7",
  name: "Norte",
  region: "Norte",
  area: 12.5,
  geometry: { type: "Polygon", coordinates: [[[-8.1, 41.1], [-8, 41.1], [-8, 41.2]]] },
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    source: "anepc-regional-commands",
    fetchedAt,
    count: 1,
    commands: [command],
    dataState: { state: "healthy", updatedAt: fetchedAt, source: "anepc-regional-commands" },
    ...overrides,
  };
}

describe("regional commands client boundary", () => {
  it("accepts compact and geometry-bearing command rows", () => {
    expect(normalizeRegionalCommandsResponse(response())).toMatchObject({ count: 1, commands: [command] });
    expect(normalizeRegionalCommandsResponse(response({ commands: [{ ...command, geometry: null }] }))).toMatchObject({ commands: [{ geometry: null }] });
  });

  it("preserves an explicit empty response", () => {
    expect(normalizeRegionalCommandsResponse(response({ count: 0, commands: [], dataState: { state: "empty", updatedAt: fetchedAt } }))).toMatchObject({ count: 0, commands: [] });
  });

  it("rejects wrong source, freshness, and count metadata", () => {
    expect(normalizeRegionalCommandsResponse(response({ source: "other" }))).toBeNull();
    expect(normalizeRegionalCommandsResponse(response({ fetchedAt: "not-a-date" }))).toBeNull();
    expect(normalizeRegionalCommandsResponse(response({ count: 2 }))).toBeNull();
  });

  it("keeps valid mixed commands when the declared count matches", () => {
    expect(normalizeRegionalCommandsResponse(response({ count: 1, commands: [command, { ...command, id: "bad", geometry: { type: "Polygon", coordinates: [[[-8.1, "bad"]]] } }] }))).toMatchObject({ count: 1, commands: [command] });
  });

  it("rejects duplicate IDs, malformed geometry, and invalid metadata", () => {
    expect(normalizeRegionalCommandsResponse(response({ count: 2, commands: [command, command] }))).toBeNull();
    expect(normalizeRegionalCommandsResponse(response({ commands: [{ ...command, geometry: { type: "Polygon", coordinates: [[[-8.1, "bad"]]] } }] }))).toBeNull();
    expect(normalizeRegionalCommandsResponse(response({ commands: [{ ...command, area: -1 }] }))).toBeNull();
    expect(normalizeRegionalCommandsResponse(response({ dataState: { state: "empty", updatedAt: fetchedAt } }))).toBeNull();
  });

  it("throws a stable error for malformed successful payloads", () => {
    expect(() => transformRegionalCommandsResponse({})).toThrow("Invalid regional commands response envelope");
  });
});
