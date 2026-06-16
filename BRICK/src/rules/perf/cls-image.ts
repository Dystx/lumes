import type { Rule, Issue, RuleContext, ScanFacts, ElementFact } from '../../types';
import { createRule } from '../rule';
import { splitClassName } from '../utils';

function isPositiveDimension(value: string | undefined): boolean {
  if (value === undefined) return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function hasAspectRatioClass(classNames: ElementFact['classNames']): boolean {
  for (const fact of classNames) {
    for (const className of splitClassName(fact.value)) {
      if (/^aspect-/.test(className)) {
        return true;
      }
    }
  }
  return false;
}

export interface ClsImageContext {
  // No configuration needed.
}

export const clsImageRule = createRule<ClsImageContext>({
  id: 'perf/cls-image',
  category: 'perf',
  severity: 'low',
  aiSpecific: false,
  create(_context: RuleContext): ClsImageContext {
    return {};
  },
  analyze(_context: ClsImageContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const img of facts.imageElements) {
      if (img.attributes.loading !== 'lazy') {
        continue;
      }

      const hasDimensions =
        isPositiveDimension(img.attributes.width) && isPositiveDimension(img.attributes.height);
      if (hasDimensions) {
        continue;
      }

      if (hasAspectRatioClass(img.classNames)) {
        continue;
      }

      issues.push({
        ruleId: 'perf/cls-image',
        category: 'perf',
        severity: 'low',
        aiSpecific: false,
        message: 'Lazy-loaded image lacks explicit dimensions or aspect ratio',
        line: img.line,
        column: img.column,
        advice: 'Add width/height attributes or an aspect-ratio utility to prevent layout shift.',
      });
    }

    return issues;
  },
});

export default clsImageRule satisfies Rule<ClsImageContext>;
