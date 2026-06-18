import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const THEME_IMPORT_RE = /theme|tokens|spacing|colors|radius/i;
const RAW_NUMBER_RE = /:\s*\d+(\.\d+)?\b/;
const RAW_COLOR_RE = /#[0-9a-f]{3,8}\b|rgb\(|rgba\(/i;

function hasThemeImport(facts: ScanFacts): boolean {
  return facts.imports.some((i) => THEME_IMPORT_RE.test(i.source));
}

export const rawStyleValuesRule = createRule<unknown>({
  id: 'visual/raw-style-values',
  category: 'visual',
  severity: 'low',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    if (!hasThemeImport(facts)) return [];

    const issues: Issue[] = [];
    const seen = new Set<string>();

    for (const styleProp of facts.styleProps) {
      const hasRawNumber = RAW_NUMBER_RE.test(styleProp.source);
      const hasRawColor = RAW_COLOR_RE.test(styleProp.source);
      if (!hasRawNumber && !hasRawColor) continue;

      const key = `${styleProp.line}:${styleProp.column}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const kind = hasRawColor ? 'raw color' : 'raw numeric value';
      issues.push({
        ruleId: 'visual/raw-style-values',
        category: 'visual',
        severity: 'low',
        aiSpecific: true,
        message: `Inline style uses a ${kind} instead of a design token`,
        line: styleProp.line,
        column: styleProp.column,
        advice: 'Replace the raw value with a token from your theme or spacing scale.',
      });
    }

    return issues;
  },
});

export default rawStyleValuesRule satisfies Rule<unknown>;
