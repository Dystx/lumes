import type { Rule, Issue, RuleContext, ScanFacts, FixSuggestion } from '../../types';
import { createRule } from '../rule';
import { isLayoutArbitrary, matchesAllowlist, nearestTailwindSpacingToken, splitClassName } from '../utils';

export interface ArbitraryEscapeContext {
  allowlist: readonly (string | RegExp)[];
}

export const arbitraryEscapeRule = createRule<ArbitraryEscapeContext>({
  id: 'visual/arbitrary-escape',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create(context: RuleContext): ArbitraryEscapeContext {
    return {
      allowlist: context.config.arbitraryValueAllowlist,
    };
  },
  analyze(context: ArbitraryEscapeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      const offenders = classes.filter(
        (className) =>
          isLayoutArbitrary(className) &&
          !className.includes('calc(') &&
          !matchesAllowlist(className, context.allowlist),
      );
      const fixes: FixSuggestion[] = offenders
        .map((offender): FixSuggestion | undefined => {
          const token = nearestTailwindSpacingToken(offender);
          if (!token) return undefined;
          return {
            kind: 'replace',
            description: `Replace '${offender}' with '${token}'`,
            targetFile: facts.filePath,
            oldValue: offender,
            newValue: token,
          };
        })
        .filter((fix): fix is FixSuggestion => fix !== undefined);

      if (offenders.length > 0) {
        issues.push({
          ruleId: 'visual/arbitrary-escape',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: `Layout arbitrary value(s) ${offenders.map((o) => `'${o}'`).join(', ')} escaped the design system`,
          line: classNameFact.line,
          column: classNameFact.column,
          advice: 'Replace with a design-system token or add it to arbitraryValueAllowlist if intentional.',
          ...(fixes.length > 0 ? { fixes } : {}),
        });
      }
    }

    return issues;
  },
});

export default arbitraryEscapeRule satisfies Rule<ArbitraryEscapeContext>;
