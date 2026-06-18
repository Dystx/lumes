import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { DEFAULT_TYPOGRAPHY_SCALE } from '../../config';

export interface ClampOffscaleContext {
  scale: string[];
}

const CLAMP_RE = /clamp\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi;
const FONT_SIZE_CONTEXT_RE = /(?:fontSize|['"]font-size['"]|text-\[)\s*(?::\s*)?/i;

function toRem(value: string): number | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^([\d.]+)\s*(px|rem|em)?$/i);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return undefined;
  const unit = (match[2] ?? 'rem').toLowerCase();
  if (unit === 'px') return num / 16;
  return num;
}

function isOffScale(value: string, scale: string[]): boolean {
  const rem = toRem(value);
  if (rem === undefined) return false;
  const numericScale = scale
    .map((token) => toRem(token))
    .filter((v): v is number => v !== undefined && v > 0);

  if (numericScale.length === 0) return false;

  let nearestRatio = Infinity;
  for (const token of numericScale) {
    const ratio = Math.abs(rem - token) / token;
    if (ratio < nearestRatio) nearestRatio = ratio;
  }
  return nearestRatio > 0.2;
}

function findOffscaleClamp(source: string, scale: string[]): string | undefined {
  CLAMP_RE.lastIndex = 0;
  const hasFontContext = FONT_SIZE_CONTEXT_RE.test(source);
  let match: RegExpExecArray | null;
  while ((match = CLAMP_RE.exec(source)) !== null) {
    const [min, preferred, max] = [match[1], match[2], match[3]];
    if (isOffScale(min, scale) || isOffScale(preferred, scale) || isOffScale(max, scale)) {
      return match[0];
    }
  }
  if (hasFontContext) {
    CLAMP_RE.lastIndex = 0;
  }
  return undefined;
}

export const clampOffscaleRule = createRule<ClampOffscaleContext>({
  id: 'typo/clamp-offscale',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  create(context: RuleContext): ClampOffscaleContext {
    return {
      scale: context.config.typographyScale ?? DEFAULT_TYPOGRAPHY_SCALE,
    };
  },
  analyze(context: ClampOffscaleContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const { scale } = context;

    for (const styleProp of facts.styleProps) {
      const offscale = findOffscaleClamp(styleProp.source, scale);
      if (offscale) {
        issues.push({
          ruleId: 'typo/clamp-offscale',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath,
          message: `Typography clamp() value ${offscale} deviates from the design scale by more than 20%`,
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Use typography scale tokens for clamp() min/preferred/max values.',
        });
      }
    }

    for (const className of facts.staticClassNames) {
      const match = className.value.match(/text-\[clamp\([^\]]+\)\]/gi);
      if (match) {
        for (const token of match) {
          const inner = token.slice(6, -1); // strip text-[ and ]
          const offscale = findOffscaleClamp(inner, scale);
          if (offscale) {
            issues.push({
              ruleId: 'typo/clamp-offscale',
              category: 'typo',
              severity: 'medium',
              aiSpecific: false,
              filePath: facts.filePath,
              message: `Typography clamp() value ${offscale} deviates from the design scale by more than 20%`,
              line: className.line,
              column: className.column,
              advice: 'Use typography scale tokens for clamp() min/preferred/max values.',
            });
          }
        }
      }
    }

    return issues;
  },
});

export default clampOffscaleRule satisfies Rule<ClampOffscaleContext>;
