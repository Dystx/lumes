import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("satellite client contract", () => {
  it("uses an explicit response DTO for the lazy satellite hook", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/use-app-data.ts"), "utf8");

    expect(source).toContain("export type SatelliteClientResponse = SatelliteResponse");
    expect(source).toMatch(/useFetch<SatelliteClientResponse \| null>\(\"\/api\/satellite\"/);
    expect(source).not.toMatch(/useFetch<any>\(\"\/api\/satellite\"/);
  });
});
