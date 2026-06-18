import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const DEFAULT_DENYLIST = [
  'lorem ipsum',
  'placeholder',
  'todo',
  'fixme',
  'dummy',
  'sample text',
  'your text here',
  'example text',
  'coming soon',
  'under construction',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesDenylist(value: string, term: string): boolean {
  const lower = value.toLowerCase();
  if (term.includes(' ')) {
    return lower.includes(term);
  }
  // Single-word terms must appear as a distinct word (not as a substring of a
  // longer identifier such as "mastodon" containing "todo").
  const boundary = '(?:^|[^a-z0-9_-])';
  const trailing = '(?:[^a-z0-9_-]|$)';
  const re = new RegExp(`${boundary}${escapeRegExp(term)}${trailing}`, 'i');
  return re.test(value);
}

export interface PlaceholderTextContext {
  denylist: string[];
}

export const placeholderTextRule = createRule<PlaceholderTextContext>({
  id: 'typo/placeholder-text',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  create(context: RuleContext): PlaceholderTextContext {
    const configList = context.config.ruleConfig.placeholderDenylist;
    const extra = Array.isArray(configList) ? (configList as string[]) : [];
    return { denylist: [...DEFAULT_DENYLIST, ...extra] };
  },
  analyze(context: PlaceholderTextContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();

    for (const literal of facts.stringLiterals ?? []) {
      for (const term of context.denylist) {
        if (matchesDenylist(literal.value, term)) {
          const key = `${literal.line}:${literal.column}:${term}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push({
            ruleId: 'typo/placeholder-text',
            category: 'typo',
            severity: 'low',
            aiSpecific: true,
            message: `Placeholder text detected: "${literal.value.trim()}"`,
            line: literal.line,
            column: literal.column,
            advice: 'Replace placeholder copy with real user-facing content.',
          });
          break;
        }
      }
    }

    return issues;
  },
});

export default placeholderTextRule satisfies Rule<PlaceholderTextContext>;
