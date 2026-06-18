import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const COLOR_PROPS = new Set(['color', 'backgroundcolor', 'background']);
const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*[\d.]+\s*)?\)$/;

function parseColor(value: string): { r: number; g: number; b: number } | undefined {
  const trimmed = value.trim();

  if (HEX_RE.test(trimmed)) {
    let hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = RGB_RE.exec(trimmed);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  return undefined;
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

function extractInlineColors(source: string): { color?: string; background?: string } {
  const result: { color?: string; background?: string } = {};
  // Match CSS property declarations inside a JS object literal style source.
  const propRe = /['"]?(\w+)['"]?\s*:\s*['"]?([^'"\n]+)['"]?/g;
  let match: RegExpExecArray | null;
  while ((match = propRe.exec(source)) !== null) {
    const prop = match[1].toLowerCase();
    if (!COLOR_PROPS.has(prop)) continue;
    const value = match[2].trim();
    if (!parseColor(value)) continue;
    if (prop === 'color') result.color = value;
    if (prop === 'backgroundcolor' || prop === 'background') result.background = value;
  }
  return result;
}

export const colorContrastRule = createRule<unknown>({
  id: 'wcag/color-contrast',
  category: 'wcag',
  severity: 'medium',
  aiSpecific: false,
  create(_context: RuleContext): unknown {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();

    for (const fact of facts.styleProps) {
      const { color, background } = extractInlineColors(fact.source);
      if (!color || !background) continue;

      const fg = parseColor(color);
      const bg = parseColor(background);
      if (!fg || !bg) continue;

      const ratio = contrastRatio(fg, bg);
      const key = `${fact.line}:${fact.column}:${ratio.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (ratio < 4.5) {
        issues.push({
          ruleId: 'wcag/color-contrast',
          category: 'wcag',
          severity: 'medium',
          aiSpecific: false,
          message: `Color contrast ratio ${ratio.toFixed(2)}:1 between ${color} and ${background} falls below 4.5:1 for body text.`,
          line: fact.line,
          column: fact.column,
          advice: 'Use a foreground/background pair that meets WCAG AA contrast requirements.',
        });
      }
    }

    return issues;
  },
});

export default colorContrastRule satisfies Rule<unknown>;
