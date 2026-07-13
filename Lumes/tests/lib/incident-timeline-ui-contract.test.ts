import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/detail/IncidentDetailPanel.tsx"), "utf8");

describe("incident timeline client contract", () => {
  it("uses the bounded shared fetch helper instead of an unbounded raw request", () => {
    expect(source).toContain("fetchJsonWithTimeout(");
    expect(source).toContain("timeoutMs: 10_000");
    expect(source).toContain("transformIncidentTimelineResponse(incident.id)");
    expect(source).not.toContain("function parseSnapshots");
    expect(source).not.toMatch(/fetch\(`\/api\/incidents\/\$\{encodeURIComponent\(incident\.id\)\}\/timeline`\)/);
  });

  it("exposes a localized retryable error state", () => {
    expect(source).toContain("setTimelineError(true)");
    expect(source).toContain('role="alert"');
    expect(source).toContain("setRetryCount((count) => count + 1)");
    expect(source).toContain('t(lang, "incident.timelineLoadFailed")');
    expect(source).toContain('t(lang, "incident.timelineRetry")');
  });

  it("keeps timeline and source-count labels in the PT/EN catalog", () => {
    expect(source).toContain('t(lang, "incident.timelineLoading")');
    expect(source).toContain('t(lang, "incident.timelineHeading")');
    expect(source).toContain('t(lang, "incident.timelineEmpty")');
    expect(source).toContain('tFmt(lang, allEvents.length === 1 ? "incident.timelineEvent" : "incident.timelineEvents"');
    expect(source).not.toContain("Loading timeline…");
    expect(source).not.toContain("Activity timeline");
    expect(source).not.toContain("No timeline events recorded yet.");
  });
});
