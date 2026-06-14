import { readFileSync } from "node:fs";
import type { TokenValue, ColorToken } from "../types.js";
import { parseNumericValue } from "./units.js";
import { parseColor } from "./oklch.js";

export interface CssTokenGroups {
  spacing: TokenValue[];
  radii: TokenValue[];
  fontSizes: TokenValue[];
  colors: ColorToken[];
  zIndex: number[];
  shadows: string[];
  lineHeights: number[];
  letterSpacing: number[];
  fontWeights: number[];
  fontFamilies: string[];
}

/**
 * Parse CSS custom properties outside of @theme when needed.
 * Returns any design-token shaped variables it can find.
 */
export function parseCssVars(cssText: string): CssTokenGroups {
  const groups: CssTokenGroups = {
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

  for (const match of cssText.matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) {
    const name = match[1].trim();
    const value = match[2].trim();

    if (name.startsWith("spacing-") || name === "spacing") {
      const parsed = parseNumericValue(value);
      if (parsed) groups.spacing.push(parsed);
    } else if (name.startsWith("color-")) {
      const tokenName = name.replace(/^color-/, "");
      groups.colors.push(parseColor(value, tokenName));
    } else if (name.startsWith("font-size-")) {
      const parsed = parseNumericValue(value);
      if (parsed) groups.fontSizes.push(parsed);
    } else if (name.startsWith("border-radius-") || name.startsWith("radius-")) {
      const parsed = parseNumericValue(value);
      if (parsed) groups.radii.push(parsed);
    } else if (name.startsWith("z-")) {
      const n = Number(value);
      if (Number.isFinite(n)) groups.zIndex.push(n);
    } else if (name.startsWith("shadow-")) {
      groups.shadows.push(value);
    } else if (name.startsWith("line-height-")) {
      const n = Number(value);
      if (Number.isFinite(n)) groups.lineHeights.push(n);
    } else if (name.startsWith("tracking-")) {
      const emMatch = value.match(/^([\d.-]+)em$/);
      if (emMatch) {
        const n = parseFloat(emMatch[1]);
        if (Number.isFinite(n)) groups.letterSpacing.push(n);
      }
    } else if (name.startsWith("font-weight-")) {
      const n = Number(value);
      if (Number.isFinite(n)) groups.fontWeights.push(n);
    } else if (name.startsWith("font-") && !name.startsWith("font-size-")) {
      const stack = value.replace(/^["']|["']$/g, "").split(",")[0]?.trim();
      if (stack) groups.fontFamilies.push(stack);
    }
  }

  return groups;
}

export function parseCssVarsFromFile(filePath: string): CssTokenGroups {
  return parseCssVars(readFileSync(filePath, "utf-8"));
}
