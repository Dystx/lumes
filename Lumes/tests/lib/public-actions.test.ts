import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReportPayload } from "@/lib/public-actions";

const source = readFileSync(resolve(process.cwd(), "src/lib/public-actions.ts"), "utf8");

describe("public action contracts", () => {
  it("maps report form fields to the report API schema", () => {
    expect(buildReportPayload({
      reportType: "smoke",
      latitude: 38.72,
      longitude: -9.14,
      description: "Smoke near the ridge",
      reporterName: "Ana",
    })).toEqual({
      type: "smoke",
      lat: 38.72,
      lon: -9.14,
      description: "Smoke near the ridge",
      name: "Ana",
    });
  });

  it("keeps server follow persistence out of the public action module", () => {
    expect(source).not.toContain("persistFollowChange");
    expect(source).not.toContain("/api/follow");
  });
});
