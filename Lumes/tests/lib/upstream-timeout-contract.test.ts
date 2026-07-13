import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicSourceRoutes = [
  "src/app/api/incidents/route.ts",
  "src/app/api/weather/route.ts",
  "src/app/api/fire-risk/route.ts",
  "src/app/api/weather-warnings/route.ts",
] as const;

describe("public upstream timeout contract", () => {
  it("bounds direct incident and IPMA fetches", () => {
    for (const route of publicSourceRoutes) {
      const source = readFileSync(resolve(process.cwd(), route), "utf8");
      expect(source, route).toContain("AbortSignal.timeout");
    }
  });
});
