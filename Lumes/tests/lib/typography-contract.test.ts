import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/components/shell/situation-panel.tsx",
  "src/components/dashboard/DashboardPanel.tsx",
  "src/components/ui/section-heading.tsx",
];

describe("typography contract", () => {
  it("exposes one UI family, one data family, and readable scale tokens", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const globals = readFileSync("src/app/globals.css", "utf8");

    expect(layout).toContain("IBM_Plex_Sans");
    expect(layout).toContain('variable: "--font-ui"');
    expect(layout).toContain("IBM_Plex_Mono");
    expect(layout).toContain('variable: "--font-data"');
    expect(layout).toContain("preload: false");
    expect(globals).toContain("--type-body");
    expect(globals).toContain("--type-secondary");
    expect(globals).toContain("--type-meta");
  });

  it("keeps Fraunces out of application headings and removes raw sub-11px text utilities", () => {
    const headingSources = sourceFiles.slice(2).map((file) => readFileSync(file, "utf8"));
    for (const source of headingSources) {
      expect(source).not.toContain("font-display");
    }

    const source = sourceFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/text-\[(?:9|10)px\]/);
  });

  it("uses the explicit secondary size token instead of Tailwind's secondary color utility", () => {
    const secondaryTextFiles = [
      "src/components/dashboard/DashboardPanel.tsx",
      "src/components/filters/filters-panel.tsx",
      "src/components/mobile/map-peek.tsx",
      "src/components/news-section.tsx",
      "src/components/shell/situation-panel.tsx",
      "src/components/ui/section-error.tsx",
    ];

    for (const file of secondaryTextFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\btext-secondary\b/);
      expect(source).toContain("text-[length:var(--type-secondary)]");
    }
  });
});
