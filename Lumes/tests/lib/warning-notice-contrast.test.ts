import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("warning notice typography contract", () => {
  it("keeps warning text readable instead of using the conflicting secondary color utility", () => {
    const sources = [
      readFileSync("src/components/shell/situation-panel.tsx", "utf8"),
      readFileSync("src/components/filters/filters-panel.tsx", "utf8"),
    ];

    for (const source of sources) {
      expect(source).toContain("text-[length:var(--type-secondary)]");
      expect(source).toContain("text-[var(--ember-warning)]");
    }

    const situationPanel = sources[0];
    const warningNotice = situationPanel.match(
      /<p className=\"[^\"]*text-\[var\(--ember-warning\)\][^\"]*\">/,
    )?.[0];

    expect(warningNotice).toBeDefined();
    expect(warningNotice).not.toContain("text-secondary");
  });
});
