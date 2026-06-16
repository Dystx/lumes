import type { Rule, Issue, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DraggingMovementsContext {
  /* no runtime context needed */
}

function hasPointerOrKeyboardAlternative(element: {
  attributes: Record<string, string | undefined>;
}): boolean {
  const attrs = element.attributes;
  return (
    'onClick' in attrs ||
    'onKeyDown' in attrs ||
    'onPointerDown' in attrs ||
    attrs.role === 'button'
  );
}

export const draggingMovementsRule = createRule<DraggingMovementsContext>({
  id: 'wcag/dragging-movements',
  category: 'wcag',
  severity: 'medium',
  aiSpecific: false,
  create() {
    return {};
  },
  analyze(_context: DraggingMovementsContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    for (const element of facts.allElements) {
      if (element.attributes.draggable !== 'true') {
        continue;
      }

      if (hasPointerOrKeyboardAlternative(element)) {
        continue;
      }

      issues.push({
        ruleId: 'wcag/dragging-movements',
        category: 'wcag',
        severity: 'medium',
        aiSpecific: false,
        message: 'draggable element lacks a pointer or keyboard alternative',
        line: element.line,
        column: element.column,
        advice: 'Provide an onClick, onKeyDown, or button role as an alternative to dragging.',
      });
    }

    return issues;
  },
});

export default draggingMovementsRule satisfies Rule<DraggingMovementsContext>;
