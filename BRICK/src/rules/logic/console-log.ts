import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const consoleLogRule = createRule<unknown>({
  id: 'logic/console-log',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    return (facts.consoleCalls ?? []).map((call) => ({
      ruleId: 'logic/console-log',
      category: 'logic',
      severity: 'low',
      aiSpecific: true,
      message: `Console.${call.method} call left in source`,
      line: call.line,
      column: call.column,
      advice: 'Remove debugging logs before committing.',
    }));
  },
});

export default consoleLogRule satisfies Rule<unknown>;
