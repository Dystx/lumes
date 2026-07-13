import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const modal = readFileSync("src/components/reports/report-fire-modal.tsx", "utf8");

describe("community report modal client ownership", () => {
  it("delegates response parsing to the bounded client module", () => {
    expect(modal).toContain("submitCommunityReport");
    expect(modal).not.toContain('fetch("/api/reports"');
    expect(modal).not.toContain("as ReportResponse");
  });
});
