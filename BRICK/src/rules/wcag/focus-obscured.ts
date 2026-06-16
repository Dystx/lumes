import type { Rule, Issue, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

export interface FocusObscuredContext {
  /* no runtime context needed */
}

export const focusObscuredRule = createRule<FocusObscuredContext>({
  id: 'wcag/focus-obscured',
  category: 'wcag',
  severity: 'low',
  aiSpecific: false,
  create() {
    return {};
  },
  analyze(_context: FocusObscuredContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.allElements) {
      const classes = element.classNames.flatMap((fact) => splitClassName(fact.value));

      const hasFixedOrSticky = classes.some(
        (className) => className === 'fixed' || className === 'sticky',
      );

      if (hasFixedOrSticky) {
        issues.push({
          ruleId: 'wcag/focus-obscured',
          category: 'wcag',
          severity: 'low',
          aiSpecific: false,
          message: 'Element uses fixed/sticky positioning which may obscure focused siblings',
          line: element.line,
          column: element.column,
          advice: 'Ensure focused elements are not hidden behind fixed or sticky wrappers.',
        });
      }
    }

    return issues;
  },
});

export default focusObscuredRule satisfies Rule<FocusObscuredContext>;
