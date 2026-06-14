import { readFileSync } from "node:fs";
import type { DesignTokens, TokenValue, ColorToken } from "../types.js";
import { parseNumericValue } from "./units.js";
import { parseColor } from "./oklch.js";

export function extractTailwindV4(filePath: string): DesignTokens {
  const cssText = readFileSync(filePath, "utf-8");
  return extractTailwindV4FromString(cssText);
}

export function extractTailwindV4FromString(cssText: string): DesignTokens {
  const tokens: DesignTokens = {
    spacing: [],
    radii: [],
    fontSizes: [],
    colors: [],
    zIndex: [],
    shadows: [],
    lineHeights: [],
    letterSpacing: [],
    fontWeights: [],
    fontFamilies: [],
  };

  // Extract @theme { ... } blocks (also handles @theme inline).
  const themeBlocks: string[] = [];
  for (const match of cssText.matchAll(/@theme\s*(?:inline)?\s*\{([\s\S]*?)\}/g)) {
    themeBlocks.push(match[1]);
  }

  for (const block of themeBlocks) {
    for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) {
      const name = match[1].trim();
      const value = match[2].trim();

      // --spacing-* custom properties.
      if (name.startsWith("spacing-")) {
        const parsed = parseNumericValue(value);
        if (parsed) {
          tokens.spacing.push({ ...parsed, raw: value });
        }
        continue;
      }

      // --color-* custom properties.
      if (name.startsWith("color-")) {
        const tokenName = name.replace(/^color-/, "");
        tokens.colors.push(parseColor(value, tokenName));
        continue;
      }

      // --font-size-* custom properties.
      if (name.startsWith("font-size-")) {
        const parsed = parseNumericValue(value);
        if (parsed) {
          tokens.fontSizes.push({ ...parsed, raw: value });
        }
        continue;
      }

      // --border-radius-* or --radius-* custom properties.
      if (name.startsWith("border-radius-") || name.startsWith("radius-")) {
        const parsed = parseNumericValue(value);
        if (parsed) {
          tokens.radii.push({ ...parsed, raw: value });
        }
        continue;
      }

      // --z-* custom properties.
      if (name.startsWith("z-")) {
        const n = Number(value);
        if (Number.isFinite(n)) tokens.zIndex.push(n);
        continue;
      }

      // --shadow-* custom properties.
      if (name.startsWith("shadow-")) {
        tokens.shadows.push(value);
        continue;
      }

      // --line-height-* custom properties.
      if (name.startsWith("line-height-")) {
        const n = Number(value);
        if (Number.isFinite(n)) tokens.lineHeights.push(n);
        continue;
      }

      // --tracking-* custom properties (letter spacing, usually in em).
      if (name.startsWith("tracking-")) {
        const emMatch = value.match(/^([\d.-]+)em$/);
        if (emMatch) {
          const n = parseFloat(emMatch[1]);
          if (Number.isFinite(n)) tokens.letterSpacing.push(n);
        }
        continue;
      }

      // --font-weight-* custom properties.
      if (name.startsWith("font-weight-")) {
        const n = Number(value);
        if (Number.isFinite(n)) tokens.fontWeights.push(n);
        continue;
      }

      // --font-* custom properties (font family stacks).
      if (name.startsWith("font-") && !name.startsWith("font-size-") && !name.startsWith("font-weight-")) {
        const stack = value.replace(/^["']|["']$/g, "").split(",")[0]?.trim();
        if (stack) tokens.fontFamilies.push(stack);
      }
    }
  }

  return tokens;
}
