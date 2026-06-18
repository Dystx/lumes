import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const HARDCODED_COLOR_RE = /(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6,8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;

export const hardcodedColorRule = createRule<unknown>({
  id: 'visual/hardcoded-color',
  category: 'visual',
  severity: 'low',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();

    for (const styleProp of facts.styleProps) {
      if (!HARDCODED_COLOR_RE.test(styleProp.source)) continue;

      const key = `${styleProp.line}:${styleProp.column}`;
      if (seen.has(key)) continue;
      seen.add(key);

      issues.push({
        ruleId: 'visual/hardcoded-color',
        category: 'visual',
        severity: 'low',
        aiSpecific: true,
        message: 'Hardcoded color literal in style prop',
        line: styleProp.line,
        column: styleProp.column,
        advice: 'Use a design-system color token instead.',
      });
    }

    return issues;
  },
});

export default hardcodedColorRule satisfies Rule<unknown>;
