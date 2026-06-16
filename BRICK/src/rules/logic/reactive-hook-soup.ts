import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface ReactiveHookSoupContext {
  // No per-context state required.
}

export const reactiveHookSoupRule = createRule<ReactiveHookSoupContext>({
  id: 'logic/reactive-hook-soup',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  create(_context: RuleContext): ReactiveHookSoupContext {
    return {};
  },
  analyze(_context: ReactiveHookSoupContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const component of facts.components) {
      const effectCount = component.hookCalls.filter((hook) => hook.name === 'useEffect').length;
      if (effectCount >= 3) {
        issues.push({
          ruleId: 'logic/reactive-hook-soup',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `${component.name ?? 'Component'} contains ${effectCount} useEffect calls that may be manually synchronizing state across local layers.`,
          line: component.line,
          column: component.column,
          advice: 'Lift derived state into a single useEffect, use a reducer, or derive values during render instead of chaining effects.',
        });
      }
    }

    return issues;
  },
});

export default reactiveHookSoupRule satisfies Rule<ReactiveHookSoupContext>;
