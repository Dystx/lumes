import type { Rule, RuleContext, ResolvedConfig } from '../types';

export interface EnabledRule {
  rule: Rule;
  context: unknown;
}

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  loadBuiltins(): void {
    // P0: no built-ins yet; Phase 3 adds real rules.
  }

  getRules(filter?: { kind: 'ai' | 'human' }): Rule[] {
    const list = Array.from(this.rules.values());
    if (!filter) return list;
    return list.filter((r) => (filter.kind === 'ai' ? r.aiSpecific : !r.aiSpecific));
  }

  createContexts(config: ResolvedConfig, filePath: string): EnabledRule[] {
    const context: RuleContext = { config, filePath };
    return this.getRules().map((rule) => ({
      rule,
      context: rule.create(context),
    }));
  }
}
