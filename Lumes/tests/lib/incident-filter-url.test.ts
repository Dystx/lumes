import { describe, expect, it } from "vitest";
import {
  ALL_SEVERITIES,
  type IncidentFilterState,
} from "@/lib/incident-filters";
import {
  parseIncidentFilterQuery,
  writeIncidentFilterQuery,
} from "@/lib/incident-filter-url";

describe("incident filter URL codec", () => {
  it("parses an absent query as the documented filter baseline", () => {
    expect(parseIncidentFilterQuery(new URLSearchParams())).toEqual({
      severities: new Set(ALL_SEVERITIES),
      hideResolved: true,
      quick: "all",
      phase: null,
      resource: null,
      search: "",
    });
  });

  it("round-trips all supported filters while preserving unrelated parameters", () => {
    const params = new URLSearchParams(
      "incident=abc&severity=critical,high&includeResolved=1&quick=active&phase=Em+Curso&resource=aircraft&q=loule",
    );
    const filters = parseIncidentFilterQuery(params);

    expect(filters).toEqual({
      severities: new Set(["critical", "high"]),
      hideResolved: false,
      quick: "active",
      phase: "Em Curso",
      resource: "aircraft",
      search: "loule",
    });

    const next = new URLSearchParams("incident=abc&utm_source=test");
    writeIncidentFilterQuery(next, filters);
    expect(next.toString()).toBe(
      "incident=abc&utm_source=test&severity=critical%2Chigh&includeResolved=1&quick=active&phase=Em+Curso&resource=aircraft&q=loule",
    );
  });

  it("represents an empty severity set and sanitizes invalid values", () => {
    const empty: IncidentFilterState = {
      severities: new Set(),
      hideResolved: true,
      quick: "all",
      phase: null,
      resource: null,
      search: "",
    };
    const params = new URLSearchParams("incident=abc");
    writeIncidentFilterQuery(params, empty);
    expect(params.get("severity")).toBe("none");
    expect(parseIncidentFilterQuery(params).severities).toEqual(new Set());

    const invalid = parseIncidentFilterQuery(new URLSearchParams(
      "severity=critical,invalid&quick=bogus&resource=bogus&includeResolved=0",
    ));
    expect(invalid.severities).toEqual(new Set(["critical"]));
    expect(invalid.quick).toBe("all");
    expect(invalid.resource).toBeNull();
    expect(invalid.hideResolved).toBe(true);
  });
});
