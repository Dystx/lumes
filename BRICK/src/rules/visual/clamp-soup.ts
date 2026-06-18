import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { matchesAllowlist } from '../utils';

export interface ClampSoupContext {
  allowlist: (string | RegExp)[];
}

const CLAMP_RE = /clamp\s*\((?:[^()]|\([^)]*\))*\)/gi;
const VIEWPORT_UNIT_RE = /(?<![a-zA-Z_])(vw|vh)(?![a-zA-Z0-9_])/;

function hasRawViewportUnit(value: string): boolean {
  // Strip CSS custom-property aliases; any remaining viewport unit is raw.
  const withoutVar = value.replace(/var\([^)]*\)/g, '');
  return VIEWPORT_UNIT_RE.test(withoutVar);
}

function findClampIssues(
  source: string,
  line: number,
  column: number,
  allowlist: (string | RegExp)[],
  issues: Issue[],
): void {
  const clamps = source.match(CLAMP_RE) ?? [];
  for (const clamp of clamps) {
    if (matchesAllowlist(clamp, allowlist)) continue;
    if (hasRawViewportUnit(clamp)) {
      issues.push({
        ruleId: 'visual/clamp-soup',
        category: 'visual',
        severity: 'high',
        aiSpecific: true,
        message: 'clamp() uses raw viewport units without a design token alias',
        line,
        column,
        advice: 'Replace viewport-only clamp() with token-based fluid sizing, alias the values in your design config, or add the clamp to clampAllowlist if intentional.',
      });
    }
  }
}

export const clampSoupRule = createRule<ClampSoupContext>({
  id: 'visual/clamp-soup',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  create(context: RuleContext): ClampSoupContext {
    return {
      allowlist: context.config.clampAllowlist ?? [],
    };
  },
  analyze(context: ClampSoupContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const styleProp of facts.styleProps) {
      findClampIssues(styleProp.source, styleProp.line, styleProp.column, context.allowlist, issues);
    }

    for (const classNameFact of facts.staticClassNames) {
      findClampIssues(classNameFact.value, classNameFact.line, classNameFact.column, context.allowlist, issues);
    }

    return issues;
  },
});

export default clampSoupRule satisfies Rule<ClampSoupContext>;
