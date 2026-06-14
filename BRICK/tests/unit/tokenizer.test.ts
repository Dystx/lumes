import { describe, it, expect } from "vitest";
import { extractDesignTokens } from "../../src/tokenizer";
import { join } from "node:path";

describe("extractDesignTokens", () => {
  it("reads spacing values from a Tailwind v3 config", () => {
    const tokens = extractDesignTokens({
      tailwindConfigPath: join(__dirname, "../fixtures/tailwind-v3.config.js"),
    });
    const values = tokens.spacing.map((t) => t.value);
    expect(values).toContain(4);
    expect(values).toContain(16);
  });

  it("reads spacing values from a Tailwind v4 @theme CSS file", () => {
    const tokens = extractDesignTokens({
      tailwindThemeCssPath: join(__dirname, "../fixtures/tailwind-v4-theme.css"),
    });
    const values = tokens.spacing.map((t) => t.value);
    expect(values).toContain(4);
    expect(values).toContain(16);
  });

  it("preserves OKLCH color raw values", () => {
    const tokens = extractDesignTokens({
      tailwindThemeCssPath: join(__dirname, "../fixtures/tailwind-v4-theme.css"),
    });
    expect(tokens.colors.length).toBeGreaterThan(0);
    const primary = tokens.colors.find((c) => c.name === "primary");
    expect(primary).toBeDefined();
    expect(primary?.oklch).toContain("oklch");
  });
});
