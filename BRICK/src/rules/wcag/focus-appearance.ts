import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName, isFocusRingClass, isOutlineRemoval } from '../utils';

export interface FocusAppearanceContext {
  globalCssTarget?: string;
}

export const focusAppearanceRule = createRule<FocusAppearanceContext>({
  id: 'wcag/focus-appearance',
  category: 'wcag',
  severity: 'high',
  aiSpecific: false,
  create(context: RuleContext): FocusAppearanceContext {
    return { globalCssTarget: context.config.globalCssTarget };
  },
  analyze(context: FocusAppearanceContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.interactiveElements) {
      const classes = element.classNames.flatMap((fact) => splitClassName(fact.value));

      const removesOutline = classes.some((className) => isOutlineRemoval(className));
      const hasFocusRing = classes.some((className) => isFocusRingClass(className));

      if (removesOutline && !hasFocusRing) {
        const issue: Issue = {
          ruleId: 'wcag/focus-appearance',
          category: 'wcag',
          severity: 'high',
          aiSpecific: false,
          message: `Interactive '${element.tag}' removes focus outline without adding a focus ring`,
          line: element.line,
          column: element.column,
          advice:
            'Add a focus:ring-* or focus-visible:ring-* class, or remove outline-none.',
        };
        if (context.globalCssTarget) {
          issue.fix = {
            kind: 'css-anchor',
            description: 'Inject global focus-ring CSS block',
            targetFile: context.globalCssTarget,
            anchor: '@slop-audit:v1.0.0:fix:focus-ring',
          };
        }
        issues.push(issue);
      }
    }

    return issues;
  },
});

export default focusAppearanceRule satisfies Rule<FocusAppearanceContext>;
