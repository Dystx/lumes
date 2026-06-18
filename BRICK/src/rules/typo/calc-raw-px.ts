import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { parseStyleObject } from '../utils';

export interface CalcRawPxContext {
  // No per-context state required.
}

const CALC_RAW_PX_RE = /calc\([^)]*\d+px[^)]*\)/i;

const LAYOUT_CSS_PROPS = new Set([
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'column-gap',
  'row-gap',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'flex-basis',
  'transform',
  'translate',
]);

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
      for (const entry of parseStyleObject(styleProp.source)) {
        if (!LAYOUT_CSS_PROPS.has(entry.property)) continue;
        if (CALC_RAW_PX_RE.test(entry.value)) {
          issues.push({
            ruleId: 'typo/calc-raw-px',
            category: 'typo',
            severity: 'high',
            aiSpecific: false,
            message: `calc() in ${entry.property} uses raw px units; prefer rem/em for scalable layout.`,
            line: styleProp.line,
            column: styleProp.column,
            advice: 'Replace px values in calc() with rem or em units.',
          });
        }
      }
    }

    return issues;
  },
});

export default calcRawPxRule satisfies Rule<CalcRawPxContext>;
