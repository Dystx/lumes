import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

describe("source-health presentation UI contract", () => {
  it("keeps trust composition behind the tested view-model boundary", () => {
    expect(page).toContain('from "@/lib/source-health-presentation"');
    expect(page).toContain("buildSourceHealthPresentation({");
    expect(page).toContain("sourceHealthPresentation.state");
    expect(page).toContain("sourceHealthPresentation.reason");
    expect(page).toContain("sourceHealthPresentation.optionalLayerWarning");
    expect(page).not.toContain("const liveTrustDataState =");
    expect(page).not.toContain("headlineTrustToDataState(");
  });
});
