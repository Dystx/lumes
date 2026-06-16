import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { loadRegistrySnapshot, type RegistrySnapshot } from '../registry-loader';

export interface ShadcnPropMismatchContext {
  snapshot: RegistrySnapshot;
  severity: Issue['severity'];
  disabled: boolean;
}

export const shadcnPropMismatchRule: Rule<ShadcnPropMismatchContext> = {
  id: 'component/shadcn-prop-mismatch',
  category: 'component',
  severity: 'high',
  aiSpecific: true,

  create(context: RuleContext): ShadcnPropMismatchContext {
    const severity = context.config.rules['component/shadcn-prop-mismatch'];
    return {
      snapshot: loadRegistrySnapshot(context.cwd),
      severity: (severity === 'off' ? 'high' : severity) as Issue['severity'],
      disabled: severity === 'off',
    };
  },

  analyze(context: ShadcnPropMismatchContext, facts: ScanFacts): Issue[] {
    if (context.disabled) return [];
    const issues: Issue[] = [];
    const components = context.snapshot.components;

    for (const element of facts.allElements) {
      const registryEntry = components[element.tag];
      if (!registryEntry || !registryEntry.forbiddenProps?.includes('className')) {
        continue;
      }

      if (element.attributes.className !== undefined) {
        issues.push({
          ruleId: 'component/shadcn-prop-mismatch',
          category: 'component',
          severity: context.severity,
          aiSpecific: true,
          filePath: facts.filePath,
          message: `Legacy className injection on shadcn/ui <${element.tag}>; the registry schema does not expose this prop.`,
          line: element.line,
          column: element.column,
          advice: 'Use the component\'s documented styling API or wrap it in a container instead of injecting className.',
        });
      }
    }

    return issues;
  },
};
