import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { hasAllClasses, splitClassName } from '../utils';

const REQUIRED_LAYOUT_CLASSES = ['flex', 'flex-col'] as const;

function isGapClass(className: string, gapTokens: string[] | undefined): boolean {
  if (gapTokens && gapTokens.length > 0) {
    return gapTokens.includes(className);
  }
  return className.startsWith('gap-');
}

export interface ForcedLayoutContext {
  threshold: number;
  gapTokens: string[] | undefined;
}

function resolveThreshold(configured: unknown): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return 3;
}

export const forcedLayoutRule = createRule<ForcedLayoutContext>({
  id: 'visual/forced-layout',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create(context: RuleContext): ForcedLayoutContext {
    return {
      threshold: resolveThreshold(context.config.ruleConfig.forcedLayoutThreshold),
      gapTokens: context.config.gapTokens,
    };
  },
  analyze(context: ForcedLayoutContext, facts: ScanFacts): Issue[] {
    const matches: Array<{ line: number; column: number }> = [];

    for (const classNameFact of facts.staticClassNames) {
      const classes = splitClassName(classNameFact.value);
      if (
        hasAllClasses(classes, REQUIRED_LAYOUT_CLASSES) &&
        classes.some((className) => isGapClass(className, context.gapTokens))
      ) {
        matches.push({ line: classNameFact.line, column: classNameFact.column });
      }
    }

    if (matches.length > context.threshold) {
      const first = matches[0];
      return [
        {
          ruleId: 'visual/forced-layout',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: `Repetitive flex-col gap wrapper pattern detected (${matches.length} instances)`,
          line: first.line,
          column: first.column,
          advice: 'Extract a reusable layout component or restrict gapTokens to intentional values.',
        },
      ];
    }

    return [];
  },
});

export default forcedLayoutRule satisfies Rule<ForcedLayoutContext>;
