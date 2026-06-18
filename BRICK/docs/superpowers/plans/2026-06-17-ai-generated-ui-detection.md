# AI-Generated UI Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five rules that detect common AI-generated UI anti-patterns and raise the slop index on AI-built codebases.

**Architecture:** Extend `ScanFacts` with `consoleCalls` and `stringLiterals`, add file-level rules for inline styles, raw style values, console logs, and placeholder text, and add a project-level rule that flags duplicated screen boilerplate.

**Tech Stack:** TypeScript, Vitest, SWC AST, existing `slop-audit` rule framework.

---

## Task 1: Extend `ScanFacts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add new fact types**

```ts
export interface ConsoleCallFact {
  method: 'log' | 'warn' | 'error' | 'info' | 'debug';
  line: number;
  column: number;
}

export interface StringLiteralFact {
  value: string;
  line: number;
  column: number;
}
```

- [ ] **Step 2: Add fields to `ScanFacts`**

```ts
export interface ScanFacts {
  // ...existing fields
  consoleCalls: ConsoleCallFact[];
  stringLiterals: StringLiteralFact[];
}
```

---

## Task 2: Collect new facts in the visitor

**Files:**
- Modify: `src/engine/visitor.ts`

- [ ] **Step 1: Initialize arrays in `extractFacts`**

```ts
const facts: ScanFacts = {
  // ...existing fields
  consoleCalls: [],
  stringLiterals: [],
};
```

- [ ] **Step 2: Collect string literals during walk**

Inside the existing AST walk, when `type === 'StringLiteral'` and `typeof node.value === 'string'`, push:

```ts
facts.stringLiterals.push({ value: node.value as string, line, column });
```

- [ ] **Step 3: Collect `console.*` calls**

When `type === 'CallExpression'`, check if callee is a member expression with object `console` and method name in the allowed set. If so:

```ts
facts.consoleCalls.push({ method: methodName as ConsoleCallFact['method'], line, column });
```

---

## Task 3: Implement `logic/console-log`

**Files:**
- Create: `src/rules/logic/console-log.ts`
- Test: `tests/rules/console-log.test.ts`

- [ ] **Step 1: Write the rule**

```ts
import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const consoleLogRule = createRule<unknown>({
  id: 'logic/console-log',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  create() { return undefined; },
  analyze(_context, facts: ScanFacts): Issue[] {
    return facts.consoleCalls.map((call) => ({
      ruleId: 'logic/console-log',
      category: 'logic',
      severity: 'low',
      aiSpecific: true,
      message: `Console.${call.method} call left in source`,
      line: call.line,
      column: call.column,
      advice: 'Remove debugging logs before committing.',
    }));
  },
});

export default consoleLogRule satisfies Rule<unknown>;
```

- [ ] **Step 2: Write unit test**

Create a test that runs the rule on a file containing `console.log('debug')` and expects one issue with the correct message.

---

## Task 4: Implement `typo/placeholder-text`

**Files:**
- Create: `src/rules/typo/placeholder-text.ts`
- Test: `tests/rules/placeholder-text.test.ts`

- [ ] **Step 1: Define deny-list helper**

```ts
const DEFAULT_DENYLIST = [
  'lorem ipsum',
  'placeholder',
  'todo',
  'fixme',
  'dummy',
  'sample text',
  'your text here',
  'example text',
];
```

- [ ] **Step 2: Write the rule**

Match each `stringLiterals` value case-insensitively against the deny-list. Emit one issue per match.

- [ ] **Step 3: Write unit tests**

Test matches for `"Lorem ipsum dolor"`, `"TODO: fix this"`, and non-matches for `"Save changes"`.

---

## Task 5: Register and enable `visual/inline-style`

**Files:**
- Modify: `src/rules/builtins.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Import and register the rule**

```ts
import { inlineStyleRule } from './visual/inline-style';
```

Add `inlineStyleRule` to `builtinRules`.

- [ ] **Step 2: Add default severity**

In `DEFAULT_CONFIG.rules`:

```ts
'visual/inline-style': 'medium',
```

---

## Task 6: Implement `visual/raw-style-values`

**Files:**
- Create: `src/rules/visual/raw-style-values.ts`
- Test: `tests/rules/raw-style-values.test.ts`

- [ ] **Step 1: Theme import detection**

```ts
const THEME_IMPORT_RE = /theme|tokens|spacing|colors/i;
function hasThemeImport(facts: ScanFacts): boolean {
  return facts.imports.some((i) => THEME_IMPORT_RE.test(i.source));
}
```

- [ ] **Step 2: Raw value detection**

```ts
const RAW_NUMBER_RE = /:\s*\d+(\.\d+)?\b/;
const RAW_COLOR_RE = /#[0-9a-f]{3,8}\b|rgb\(|rgba\(/i;
```

For each `styleProps` source, if `hasThemeImport` and source matches either regex, emit an issue.

- [ ] **Step 3: Add default severity**

In `DEFAULT_CONFIG.rules`:

```ts
'visual/raw-style-values': 'low',
```

---

## Task 7: Implement `layout/duplicated-screen`

**Files:**
- Modify: `src/rules/project.ts`
- Test: `tests/rules/project.test.ts`

- [ ] **Step 1: Compute screen fingerprints**

For each `FileScanResult`, if the path contains `/app/` or `/screens/`, compute a fingerprint from the ordered list of top-level JSX opening element tag names in `facts.allElements` (limit to first 15).

- [ ] **Step 2: Group identical fingerprints**

Use a map from fingerprint JSON to file path list. For each group with ≥ 2 files, emit a single project-level issue:

```ts
createProjectIssue(
  'layout/duplicated-screen',
  'layout',
  config.rules['layout/duplicated-screen'] as Issue['severity'],
  true,
  `${files.length} screen files share the same top-level structure`,
  'Extract the common boilerplate into a reusable screen layout component.',
  files[0],
);
```

- [ ] **Step 3: Add default severity**

In `DEFAULT_CONFIG.rules`:

```ts
'layout/duplicated-screen': 'medium',
```

---

## Task 8: Update React Native / Expo preset

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Keep AI UI rules enabled for native**

Ensure `NATIVE_RULE_OVERRIDES` does **not** disable the new rules. It should still disable web-only rules from the previous preset.

---

## Task 9: Tests and quality gates

- [ ] **Step 1: Run focused tests**

```bash
pnpm test -- --run tests/rules/console-log.test.ts tests/rules/placeholder-text.test.ts tests/rules/raw-style-values.test.ts tests/rules/project.test.ts tests/engine/visitor.test.ts tests/config.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run full quality gates**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Re-scan `documents/lm`**

```bash
cd /Users/cheng/documents/lm && node /Users/cheng/BRICK/bin/slop-audit.js scan --format json --threads 4
```

Expected: slop index rises significantly above 0.036 and issues include the new AI UI rules.

- [ ] **Step 4: Re-baseline LOOPED if needed**

If LOOPED baseline invalidates due to new default rules, run:

```bash
cd /Users/cheng/looped && node /Users/cheng/BRICK/bin/slop-audit.js scan --baseline
```
