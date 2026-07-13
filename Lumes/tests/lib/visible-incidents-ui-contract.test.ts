import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

describe("visible incident derivation UI contract", () => {
  it("keeps playback selection behind the typed pure boundary", () => {
    expect(page).toContain('from "@/lib/visible-incidents"');
    expect(page).toContain("deriveVisibleIncidents({");
    expect(page).toContain("sampleIncidents: SAMPLE_INCIDENTS");
    expect(page).toContain("playbackFrames: PLAYBACK_FRAMES");
    expect(page).not.toContain("const playbackTime = Date.now() + playbackHour * 3600000");
    expect(page).not.toContain("PLAYBACK_FRAMES.reduce((closest, f)");
  });
});
