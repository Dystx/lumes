import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';

export interface AstroIslandLeakContext {
  severity: Issue['severity'];
  disabled: boolean;
}

export const astroIslandLeakRule: Rule<AstroIslandLeakContext> = {
  id: 'arch/astro-island-leak',
  category: 'arch',
  severity: 'low',
  aiSpecific: true,

  create(context: RuleContext): AstroIslandLeakContext {
    const severity = context.config.rules['arch/astro-island-leak'];
    return {
      severity: (severity === 'off' ? 'low' : severity) as Issue['severity'],
      disabled: severity === 'off',
    };
  },

  analyze(context: AstroIslandLeakContext, facts: ScanFacts): Issue[] {
    if (context.disabled) return [];

    const issues: Issue[] = [];
    for (const component of facts.astroComponents) {
      if (component.hasEventHandler && !component.hasClientDirective) {
        issues.push({
          ruleId: 'arch/astro-island-leak',
          category: 'arch',
          severity: context.severity,
          aiSpecific: true,
          filePath: facts.filePath,
          message: `<${component.tag}> binds an event handler without a client:* hydration directive.`,
          line: component.line,
          column: component.column,
          advice: 'Add a client directive (e.g. client:load, client:idle, client:visible) so the component hydrates on the client.',
        });
      }
    }
    return issues;
  },
};
