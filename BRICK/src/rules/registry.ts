import { builtinRules } from './builtins';
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
    for (const rule of builtinRules) {
      this.register(rule);
    }
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
