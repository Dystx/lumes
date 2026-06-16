import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CalcFontSizeContext {
  // No per-context state required.
}

// Detects fontSize or quoted 'font-size' set to a calc() expression inside a
// style prop object literal.
const FONT_SIZE_CALC_RE = /(?:fontSize|['"]font-size['"])\s*:\s*[^,;}]*calc\(/i;

export const calcFontSizeRule = createRule<CalcFontSizeContext>({
  id: 'typo/calc-fontsize',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  create(_context: RuleContext): CalcFontSizeContext {
    return {};
  },
  analyze(_context: CalcFontSizeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const styleProp of facts.styleProps) {
      if (FONT_SIZE_CALC_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'typo/calc-fontsize',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          message: 'font-size uses calc() without an explicit design token baseline',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Use a typography token or a named clamp() instead of calc() for font sizes.',
        });
      }
    }

    return issues;
  },
});

export default calcFontSizeRule satisfies Rule<CalcFontSizeContext>;
