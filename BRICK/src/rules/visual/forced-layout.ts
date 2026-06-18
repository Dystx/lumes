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

function matchesPattern(value: string, gapTokens: string[] | undefined): boolean {
  const classes = splitClassName(value);
  return (
    hasAllClasses(classes, REQUIRED_LAYOUT_CLASSES) &&
    classes.some((className) => isGapClass(className, gapTokens))
  );
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
    // Suppressed when the project intentionally restricts gap tokens.
    if (
      context.gapTokens &&
      context.gapTokens.length >= 1 &&
      context.gapTokens.length <= 3
    ) {
      return [];
    }

    let runStart: { line: number; column: number } | null = null;
    let runLength = 0;

    for (const classNameFact of facts.staticClassNames) {
      if (matchesPattern(classNameFact.value, context.gapTokens)) {
        if (runStart === null) {
          runStart = { line: classNameFact.line, column: classNameFact.column };
        }
        runLength++;
      } else {
        if (runStart !== null && runLength > context.threshold) {
          return [
            {
              ruleId: 'visual/forced-layout',
              category: 'visual',
              severity: 'medium',
              aiSpecific: true,
              message: `Repetitive flex-col gap wrapper pattern detected (${runLength} instances)`,
              line: runStart.line,
              column: runStart.column,
              advice: 'Extract a reusable layout component or restrict gapTokens to intentional values.',
            },
          ];
        }
        runStart = null;
        runLength = 0;
      }
    }

    if (runStart !== null && runLength > context.threshold) {
      return [
        {
          ruleId: 'visual/forced-layout',
          category: 'visual',
          severity: 'medium',
          aiSpecific: true,
          message: `Repetitive flex-col gap wrapper pattern detected (${runLength} instances)`,
          line: runStart.line,
          column: runStart.column,
          advice: 'Extract a reusable layout component or restrict gapTokens to intentional values.',
        },
      ];
    }

    return [];
  },
});

export default forcedLayoutRule satisfies Rule<ForcedLayoutContext>;
