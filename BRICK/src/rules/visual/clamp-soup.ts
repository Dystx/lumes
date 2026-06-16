import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface ClampSoupContext {
  // No per-context state required.
}

const CLAMP_RE = /clamp\s*\([^)]*\)/gi;
const VIEWPORT_UNIT_RE = /(?<![a-zA-Z_])(vw|vh)(?![a-zA-Z0-9_])/;

function isClampSoup(value: string): boolean {
  return VIEWPORT_UNIT_RE.test(value) && !value.includes('var(');
}

export const clampSoupRule = createRule<ClampSoupContext>({
  id: 'visual/clamp-soup',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  create(_context: RuleContext): ClampSoupContext {
    return {};
  },
  analyze(_context: ClampSoupContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const styleProp of facts.styleProps) {
      const clamps = styleProp.source.match(CLAMP_RE) ?? [];
      for (const clamp of clamps) {
        if (isClampSoup(clamp)) {
          issues.push({
            ruleId: 'visual/clamp-soup',
            category: 'visual',
            severity: 'high',
            aiSpecific: true,
            message: 'clamp() uses raw viewport units without a design token alias',
            line: styleProp.line,
            column: styleProp.column,
            advice: 'Replace viewport-only clamp() with token-based fluid sizing or alias the values in your design config.',
          });
        }
      }
    }

    return issues;
  },
});

export default clampSoupRule satisfies Rule<ClampSoupContext>;
