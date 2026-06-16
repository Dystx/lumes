import { builtinRules } from './builtins';
import type { Issue, Rule, RuleContext, ResolvedConfig, ScanFacts } from '../types';

export interface EnabledRule {
  rule: Rule;
  context: unknown;
}

export interface RuleRegistryFactory<Context = unknown> {
  id: string;
  category: Rule['category'];
  severity: Rule['severity'];
  aiSpecific: boolean;
  create(context: RuleContext): Context;
  analyze(context: Context, facts: ScanFacts): Issue[];
}

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void;
  register(id: string, factory: RuleRegistryFactory): void;
  register(ruleOrId: Rule | string, factory?: RuleRegistryFactory): void {
    if (typeof ruleOrId === 'string') {
      if (!factory) {
        throw new Error('Factory is required when registering by id');
      }
      const rule: Rule = {
        id: ruleOrId,
        category: factory.category,
        severity: factory.severity,
        aiSpecific: factory.aiSpecific,
        create: factory.create,
        analyze: factory.analyze,
      };
      this.rules.set(ruleOrId, rule);
    } else {
      this.rules.set(ruleOrId.id, ruleOrId);
    }
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

  createContexts(config: ResolvedConfig, filePath: string, cwd: string): EnabledRule[] {
    const context: RuleContext = { config, filePath, cwd };
    return this.getRules().map((rule) => ({
      rule,
      context: rule.create(context),
    }));
  }
}
