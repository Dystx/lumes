import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CalcRawPxContext {
  // No per-context state required.
}

const CALC_RAW_PX_RE = /calc\([^)]*\d+px[^)]*\)/i;

export const calcRawPxRule = createRule<CalcRawPxContext>({
  id: 'typo/calc-raw-px',
  category: 'typo',
  severity: 'high',
  aiSpecific: false,
  create(_context: RuleContext): CalcRawPxContext {
    return {};
  },
  analyze(_context: CalcRawPxContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const styleProp of facts.styleProps) {
      if (CALC_RAW_PX_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'typo/calc-raw-px',
          category: 'typo',
          severity: 'high',
          aiSpecific: false,
          message: 'calc() in style prop uses raw px units; prefer rem/em for scalable typography/layout.',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Replace px values in calc() with rem or em units.',
        });
      }
    }

    return issues;
  },
});

export default calcRawPxRule satisfies Rule<CalcRawPxContext>;
