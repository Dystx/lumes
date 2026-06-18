import type { Issue, Rule, RuleContext, ScanFacts, Severity } from '../../types';
import { createRule } from '../rule';

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high'];

function resolveSeverity(count: number): Severity {
  if (count >= 6) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

function isConcreteSeverity(value: unknown): value is Severity {
  return SEVERITY_ORDER.includes(value as Severity);
}

export const inlineStyleRule = createRule<RuleContext>({
  id: 'visual/inline-style',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create(context) {
    return context;
  },
  analyze(context, facts): Issue[] {
    const override = context.config.rules['visual/inline-style'];
    if (override === 'off') return [];
    const severity = isConcreteSeverity(override) ? override : resolveSeverity(facts.styleProps.length);
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      issues.push({
        ruleId: 'visual/inline-style',
        category: 'visual',
        severity,
        aiSpecific: true,
        message: 'Inline style prop detected',
        line: styleProp.line,
        column: styleProp.column,
        advice: 'Move the style to a class or design-system token.',
      });
    }
    return issues;
  },
});

export default inlineStyleRule satisfies Rule<RuleContext>;
