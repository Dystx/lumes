import type { DesignTokens } from "../types.js";
import { extractTailwindV3 } from "./tailwind-v3.js";
import { extractTailwindV4 } from "./tailwind-v4.js";
import { parseCssVarsFromFile } from "./css-vars.js";
import { TokenCache } from "./cache.js";

export interface TokenizerOptions {
  tailwindConfigPath?: string;
  tailwindThemeCssPath?: string;
  cssVarsPath?: string;
  cache?: TokenCache;
}

export function emptyTokens(): DesignTokens {
  return {
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
}

/**
 * Extract design tokens from available Tailwind v3/v4 and CSS variable sources.
 * Tailwind v4 CSS-native config takes priority, then v3 JS config, then plain CSS variables.
 * Uses the optional token cache when paths have not changed.
 */
export function extractDesignTokens(opts: TokenizerOptions): DesignTokens {
  const merged = emptyTokens();
  const cache = opts.cache;

  function getCached(filePath: string, extract: () => DesignTokens): DesignTokens {
    if (!cache) return extract();
    const cached = cache.get(filePath);
    if (cached) return cached;
    const tokens = extract();
    cache.set(filePath, tokens);
    return tokens;
  }

  if (opts.tailwindThemeCssPath) {
    const v4 = getCached(opts.tailwindThemeCssPath, () =>
      extractTailwindV4(opts.tailwindThemeCssPath!)
    );
    mergeTokens(merged, v4);
  }

  if (opts.tailwindConfigPath) {
    const v3 = getCached(opts.tailwindConfigPath, () =>
      extractTailwindV3(opts.tailwindConfigPath!)
    );
    mergeTokens(merged, v3);
  }

  if (opts.cssVarsPath) {
    const vars = getCached(opts.cssVarsPath, () => parseCssVarsFromFile(opts.cssVarsPath!));
    mergeTokens(
      merged,
      {
        ...vars,
        zIndex: vars.zIndex,
        shadows: vars.shadows,
        lineHeights: vars.lineHeights,
      }
    );
  }

  return merged;
}

function mergeTokens(target: DesignTokens, source: DesignTokens): void {
  target.spacing.push(...(source.spacing ?? []));
  target.radii.push(...(source.radii ?? []));
  target.fontSizes.push(...(source.fontSizes ?? []));
  target.colors.push(...(source.colors ?? []));
  target.zIndex.push(...(source.zIndex ?? []));
  target.shadows.push(...(source.shadows ?? []));
  target.lineHeights.push(...(source.lineHeights ?? []));
  target.letterSpacing.push(...(source.letterSpacing ?? []));
  target.fontWeights.push(...(source.fontWeights ?? []));
  target.fontFamilies.push(...(source.fontFamilies ?? []));
}
