# AI Detection Rules & Scoring Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the rule and scoring changes from `docs/superpowers/specs/2026-06-15-ai-detection-rules-and-scoring-design.md`.

**Architecture:** Add category weights and density multipliers to the scoring engine, introduce four new/refined rules, replace the manual rule registry with a build-time auto-discovered registry, and re-baseline the two test projects.

**Tech Stack:** TypeScript, Vitest, tsup, tsx, Node worker_threads.

---

## Task 1: Add `categoryWeights` and `RuleSeverity` to the type system

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/engine/cache.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Add `RuleSeverity` and update `ResolvedConfig`**

In `src/types.ts`, keep `Severity` as-is and add a config-only severity type:

```ts
export type Severity = 'low' | 'medium' | 'high';
export type RuleSeverity = Severity | 'auto';
```

Change `ResolvedConfig.rules` from `Record<string, Severity | 'off'>` to `Record<string, RuleSeverity | 'off'>`.

- [ ] **Step 2: Add default `categoryWeights`**

In `src/config.ts`, add `categoryWeights` to `DEFAULT_CONFIG`:

```ts
categoryWeights: {
  visual: 1.2,
  logic: 1.0,
  perf: 0.8,
  typo: 0.5,
  wcag: 1.0,
  layout: 1.0,
  component: 1.0,
  arch: 1.0,
},
```

Change `DEFAULT_CONFIG.rules['visual/inline-style']` to `'auto'`.

- [ ] **Step 3: Include `categoryWeights` in baseline hash**

In `src/engine/cache.ts`, add `'categoryWeights'` to `BASELINE_HASH_KEYS`.

- [ ] **Step 4: Verify config shape**

Add a test in `tests/config.test.ts` asserting that `loadConfig` returns the default `categoryWeights` and that `visual/inline-style` defaults to `'auto'`.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/config.ts src/engine/cache.ts tests/config.test.ts
git commit -m "feat(config): add categoryWeights and RuleSeverity auto support"
```

---

## Task 2: Implement category weights and density multiplier in `scoreFile`

**Files:**
- Modify: `src/engine/metrics.ts`
- Test: `tests/engine/metrics.test.ts`

- [ ] **Step 1: Write a failing test for category weights**

In `tests/engine/metrics.test.ts`:

```ts
it('applies category weights', () => {
  const config = { ...DEFAULT_CONFIG, categoryWeights: { ...DEFAULT_CONFIG.categoryWeights, visual: 2 } };
  const visual = scoreFile(
    fileResult({ issues: [issue('medium', 'visual')] }),
    1.0,
    config,
  );
  const logic = scoreFile(
    fileResult({ issues: [issue('medium', 'logic')] }),
    1.0,
    config,
  );
  expect(visual.componentScore).toBeGreaterThan(logic.componentScore);
});
```

Run: `pnpm test -- tests/engine/metrics.test.ts`  
Expected: FAIL because weights are not yet applied.

- [ ] **Step 2: Write a failing test for density multiplier**

```ts
it('applies a density multiplier for repeated rule instances', () => {
  const single = scoreFile(
    fileResult({ issues: [issue('low', 'visual')] }),
    1.0,
    DEFAULT_CONFIG,
  );
  const many = scoreFile(
    fileResult({ issues: Array.from({ length: 10 }, () => issue('low', 'visual')) }),
    1.0,
    DEFAULT_CONFIG,
  );
  expect(many.componentScore).toBeGreaterThan(single.componentScore * 2);
});
```

Expected: FAIL.

- [ ] **Step 3: Implement weighted, density-aware scoring**

In `src/engine/metrics.ts`, replace the `rawScore` calculation in `scoreFile` with:

```ts
const ruleGroups = new Map<string, { count: number; weighted: number }>();
for (const issue of result.issues) {
  const existing = ruleGroups.get(issue.ruleId) ?? { count: 0, weighted: 0 };
  existing.count += 1;
  const weight = SEVERITY_WEIGHTS[issue.severity];
  const categoryWeight = config.categoryWeights[issue.category] ?? 1;
  existing.weighted += weight * categoryWeight;
  ruleGroups.set(issue.ruleId, existing);
}

let rawScore = 0;
for (const { count, weighted } of ruleGroups.values()) {
  const density = 1 + Math.log10(count);
  rawScore += weighted * density;
}
```

Keep the rest of `scoreFile` unchanged.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- tests/engine/metrics.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/metrics.ts tests/engine/metrics.test.ts
git commit -m "feat(metrics): apply category weights and rule density multiplier"
```

---

## Task 3: Update project aggregation to mean/p90 blend

**Files:**
- Modify: `src/engine/metrics.ts`
- Test: `tests/engine/metrics.test.ts`

- [ ] **Step 1: Write a failing test for the blended slopIndex**

```ts
it('blends mean and p90 for slopIndex', () => {
  const scores = [
    scoreFile(fileResult({ filePath: 'A.tsx', issues: [issue('high', 'logic')] }), 1.0, DEFAULT_CONFIG),
    scoreFile(fileResult({ filePath: 'B.tsx', issues: [issue('low', 'visual')] }), 1.0, DEFAULT_CONFIG),
  ];
  const issueGroups = scores.map((s) => ({
    filePath: s.filePath,
    issues: s.filePath === 'A.tsx' ? [issue('high', 'logic')] : [issue('low', 'visual')],
  }));
  const report = aggregateReport(scores, issueGroups, DEFAULT_CONFIG);
  const mean = (scores[0].adjustedScore + scores[1].adjustedScore) / scores.length;
  const expected = (mean + 0.5 * report.p90Score) / 1.5 * sizeNormalization(2);
  expect(report.slopIndex).toBeCloseTo(expected, 5);
});
```

Run: `pnpm test -- tests/engine/metrics.test.ts`  
Expected: FAIL.

- [ ] **Step 2: Implement the blend**

In `src/engine/metrics.ts`, in `aggregateReport`, change:

```ts
const slopIndex = mean * norm;
```

to:

```ts
const blended = (mean + 0.5 * p90Score) / 1.5;
const slopIndex = blended * norm;
```

- [ ] **Step 3: Run tests**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/metrics.ts tests/engine/metrics.test.ts
git commit -m "feat(metrics): blend mean and p90 in slopIndex"
```

---

## Task 4: Support `'auto'` severity in rule override handling

**Files:**
- Modify: `src/engine/worker.ts`
- Modify: `src/rules/project.ts`
- Test: `tests/engine/worker.test.ts`

- [ ] **Step 1: Write a failing test for `'auto'` override**

In `tests/engine/worker.test.ts` (or create one), add a test that scans a file with `visual/inline-style: 'auto'` and expects the emitted issue severity to match the rule’s dynamic logic (e.g. high for many inline styles).

```ts
it('preserves issue severity when config rule severity is auto', async () => {
  const result = await scanFile(
    filePath,
    { ...DEFAULT_CONFIG, rules: { ...DEFAULT_CONFIG.rules, 'visual/inline-style': 'auto' } },
  );
  const inlineIssues = result.issues.filter((i) => i.ruleId === 'visual/inline-style');
  expect(inlineIssues.length).toBeGreaterThan(5);
  expect(inlineIssues.some((i) => i.severity === 'high')).toBe(true);
});
```

Expected: FAIL because `applyRuleOverrides` does not handle `'auto'`.

- [ ] **Step 2: Handle `'auto'` in `applyRuleOverrides`**

In `src/engine/worker.ts`:

```ts
if (override === 'auto') return issue;
if (override && ['low', 'medium', 'high'].includes(override)) {
  result.push({ ...issue, severity: override as Severity });
} else {
  result.push(issue);
}
```

- [ ] **Step 3: Handle `'auto'` in project rule severity resolution**

In `src/rules/project.ts`, update `isRuleEnabled` to treat `'auto'` as enabled. In each `createProjectIssue` call, if `config.rules[id]` is `'auto'`, fall back to a sensible default severity passed by the analyzer (add a `defaultSeverity` parameter or use the existing `severity` argument). For simplicity, pass the desired severity as the `severity` argument and change the casting logic to:

```ts
const resolvedSeverity = config.rules[id] === 'auto' ? severity : (config.rules[id] as Severity);
```

Apply this in `createProjectIssue` or at each call site.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/worker.ts src/rules/project.ts tests/engine/worker.test.ts
git commit -m "feat(worker): support auto rule severity"
```

---

## Task 5: Refine `visual/inline-style` to use dynamic severity

**Files:**
- Modify: `src/rules/visual/inline-style.ts`
- Test: `tests/rules/inline-style.test.ts`

- [ ] **Step 1: Write a failing test for severity escalation**

In `tests/rules/inline-style.test.ts`:

```ts
it('escalates severity based on inline style count', async () => {
  const source = Array.from({ length: 6 }, (_, i) => `<div key={${i}} style={{ color: 'red' }} />`).join('\n');
  const issues = await runRule(source, makeConfig({ rules: { 'visual/inline-style': 'auto' } }));
  expect(issues.length).toBe(6);
  expect(issues.every((i) => i.severity === 'high')).toBe(true);
});
```

Expected: FAIL.

- [ ] **Step 2: Implement dynamic severity**

In `src/rules/visual/inline-style.ts`:

```ts
function resolveSeverity(count: number): Severity {
  if (count >= 6) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

analyze(_context, facts) {
  const count = facts.styleProps.length;
  const severity = resolveSeverity(count);
  return facts.styleProps.map((styleProp) => ({
    ruleId: 'visual/inline-style',
    category: 'visual',
    severity,
    aiSpecific: true,
    message: 'Inline style prop detected',
    line: styleProp.line,
    column: styleProp.column,
    advice: 'Move the style to a class or design-system token.',
  }));
}
```

Keep the rule definition’s static `severity` as `'medium'` for backward compatibility when it is overridden.

- [ ] **Step 3: Run tests**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/rules/visual/inline-style.ts tests/rules/inline-style.test.ts
git commit -m "feat(rules): dynamic severity for inline-style based on count"
```

---

## Task 6: Add `visual/hardcoded-color` rule

**Files:**
- Create: `src/rules/visual/hardcoded-color.ts`
- Create: `tests/rules/hardcoded-color.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Write the rule**

Create `src/rules/visual/hardcoded-color.ts`:

```ts
import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const COLOR_LITERAL_RE = /(?:#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\()/;

export const hardcodedColorRule = createRule<unknown>({
  id: 'visual/hardcoded-color',
  category: 'visual',
  severity: 'low',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    for (const styleProp of facts.styleProps) {
      if (COLOR_LITERAL_RE.test(styleProp.source)) {
        issues.push({
          ruleId: 'visual/hardcoded-color',
          category: 'visual',
          severity: 'low',
          aiSpecific: true,
          message: 'Hardcoded color literal in style prop',
          line: styleProp.line,
          column: styleProp.column,
          advice: 'Use a design-system color token instead.',
        });
      }
    }
    return issues;
  },
});

export default hardcodedColorRule satisfies Rule<unknown>;
```

- [ ] **Step 2: Register it in config**

In `src/config.ts` add `'visual/hardcoded-color': 'low'` to `DEFAULT_CONFIG.rules`.

- [ ] **Step 3: Write tests**

Create `tests/rules/hardcoded-color.test.ts` covering:
- `#ff0000` in a style prop is flagged.
- `rgb(255, 0, 0)` is flagged.
- A CSS variable like `var(--color)` is not flagged.
- A non-color property like `display: 'flex'` is not flagged.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rules/visual/hardcoded-color.ts tests/rules/hardcoded-color.test.ts src/config.ts
git commit -m "feat(rules): add hardcoded-color detection"
```

---

## Task 7: Add `component/duplicated-component` rule

**Files:**
- Modify: `src/rules/project.ts`
- Modify: `src/config.ts`
- Test: `tests/rules/project.test.ts`

- [ ] **Step 1: Extract a shared duplication analyzer**

In `src/rules/project.ts`, refactor `analyzeDuplicatedScreens` so the fingerprinting logic is reusable. Add:

```ts
function analyzeDuplications(
  results: FileScanResult[],
  config: ResolvedConfig,
  id: string,
  pathFilter?: (filePath: string) => boolean,
): Issue[] {
  if (!isRuleEnabled(config, id)) return [];
  const groups = new Map<string, string[]>();
  for (const result of results) {
    if (pathFilter && !pathFilter(result.filePath)) continue;
    const tags = (result.elementTags ?? []).slice(0, FINGERPRINT_TAG_LIMIT);
    if (tags.length === 0) continue;
    const fingerprint = JSON.stringify(tags);
    const list = groups.get(fingerprint) ?? [];
    list.push(result.filePath);
    groups.set(fingerprint, list);
  }
  const issues: Issue[] = [];
  for (const [fingerprint, files] of groups) {
    if (files.length < 2) continue;
    const tags = JSON.parse(fingerprint) as string[];
    const resolvedSeverity = config.rules[id] === 'auto' ? 'medium' : (config.rules[id] as Severity);
    issues.push(
      createProjectIssue(
        id,
        id === 'layout/duplicated-screen' ? 'layout' : 'component',
        resolvedSeverity,
        true,
        `${files.length} files share the same top-level structure: [${tags.join(', ')}]`,
        'Extract the common boilerplate into a reusable component.',
        files[0],
      ),
    );
  }
  return issues;
}
```

Then rewrite `analyzeDuplicatedScreens` to call `analyzeDuplications(results, config, 'layout/duplicated-screen', (p) => SCREEN_PATH_RE.test(p))`.

- [ ] **Step 2: Add `component/duplicated-component`**

```ts
export function analyzeDuplicatedComponents(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  return analyzeDuplications(results, config, 'component/duplicated-component');
}
```

- [ ] **Step 3: Wire it into `runProjectRules`**

```ts
export function runProjectRules(results: FileScanResult[], config: ResolvedConfig): Issue[] {
  return [
    ...analyzeGapMonopoly(results, config),
    ...analyzeCssBloat(results, config),
    ...analyzeDuplicatedScreens(results, config),
    ...analyzeDuplicatedComponents(results, config),
  ];
}
```

- [ ] **Step 4: Register it in config**

In `src/config.ts` add `'component/duplicated-component': 'medium'`.

- [ ] **Step 5: Write tests**

In `tests/rules/project.test.ts`, add a test with two non-screen component files that have identical top-level element tag sequences and expect one `component/duplicated-component` issue.

- [ ] **Step 6: Run tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rules/project.ts tests/rules/project.test.ts src/config.ts
git commit -m "feat(rules): add duplicated-component project rule"
```

---

## Task 8: Add `logic/style-sheet-avoidance` rule (RN/Expo)

**Files:**
- Create: `src/rules/logic/style-sheet-avoidance.ts`
- Create: `tests/rules/style-sheet-avoidance.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Write the rule**

Create `src/rules/logic/style-sheet-avoidance.ts`:

```ts
import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

const RN_FRAMEWORKS = new Set(['react-native', 'expo']);

export const styleSheetAvoidanceRule = createRule<unknown>({
  id: 'logic/style-sheet-avoidance',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  create() {
    return undefined;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    return [];
  },
});

export default styleSheetAvoidanceRule satisfies Rule<unknown>;
```

Wait — the rule needs access to `config.framework`. The `RuleContext` is available in `create`, not `analyze`. Store it in context:

```ts
interface Context {
  enabled: boolean;
}

create(context: RuleContext): Context {
  return { enabled: RN_FRAMEWORKS.has(context.config.framework ?? '') };
},
analyze(context: Context, facts: ScanFacts): Issue[] {
  if (!context.enabled) return [];
  const hasStyleSheet = facts.imports.some(
    (i) => /react-native/.test(i.source) && /StyleSheet/.test(i.importedNames ?? ''),
  );
  if (hasStyleSheet || facts.styleProps.length === 0) return [];
  return [{
    ruleId: 'logic/style-sheet-avoidance',
    category: 'logic',
    severity: 'medium',
    aiSpecific: true,
    message: `React Native file uses ${facts.styleProps.length} inline style(s) without StyleSheet`,
    line: facts.styleProps[0].line,
    column: facts.styleProps[0].column,
    advice: 'Use StyleSheet.create for static styles.',
  }];
},
```

The `ScanFacts.imports` currently only has `source`, `line`, `column`. Add `importedNames` to `ImportFact` in `src/types.ts` and populate it in `src/engine/visitor.ts` if not already.

- [ ] **Step 2: Extend `ImportFact` and visitor**

In `src/types.ts`:

```ts
export interface ImportFact {
  source: string;
  line: number;
  column: number;
  importedNames?: string[];
}
```

In `src/engine/visitor.ts`, when extracting imports, collect default and named specifier names into `importedNames`. Keep it minimal; if the visitor already collects this, skip this step.

- [ ] **Step 3: Register rule in config**

In `src/config.ts` add `'logic/style-sheet-avoidance': 'medium'`.

- [ ] **Step 4: Write tests**

Create `tests/rules/style-sheet-avoidance.test.ts`:
- RN file with inline styles and no StyleSheet import → 1 issue.
- RN file with `StyleSheet` imported → 0 issues.
- Web file with inline styles → 0 issues.

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/rules/logic/style-sheet-avoidance.ts src/types.ts src/engine/visitor.ts tests/rules/style-sheet-avoidance.test.ts src/config.ts
git commit -m "feat(rules): add react-native StyleSheet avoidance rule"
```

---

## Task 9: Replace manual rule registry with auto-discovery

**Files:**
- Create: `scripts/generate-rule-registry.ts`
- Modify: `src/rules/registry.ts`
- Delete: `src/rules/builtins.ts`
- Modify: `package.json`
- Test: `tests/rules/registry.test.ts`

- [ ] **Step 1: Write the generator**

Create `scripts/generate-rule-registry.ts`:

```ts
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RULES_DIR = join(__dirname, '..', 'src', 'rules');
const OUTPUT = join(RULES_DIR, 'builtins.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      const rel = relative(RULES_DIR, full).replace(/\\/g, '/').replace(/\.ts$/, '');
      if (['rule', 'registry', 'builtins'].includes(rel)) continue;
      out.push(rel);
    }
  }
  return out.sort();
}

const files = walk(RULES_DIR);
const imports = files.map((f, i) => `import { default as rule${i} } from './${f}';`).join('\n');
const exports = files.map((_, i) => `  rule${i},`).join('\n');

const content = `// Auto-generated by scripts/generate-rule-registry.ts. Do not edit manually.
import type { Rule } from '../types';
${imports}

export const builtinRules: Rule[] = [
${exports}
];
`;

writeFileSync(OUTPUT, content);
console.log(`Generated ${OUTPUT} with ${files.length} rules.`);
```

- [ ] **Step 2: Wire the generator into the build and test lifecycle**

In `package.json`:

```json
"scripts": {
  "generate-rules": "tsx scripts/generate-rule-registry.ts",
  "build": "pnpm generate-rules && tsup",
  "test": "pnpm generate-rules && vitest run",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 3: Run the generator once**

```bash
pnpm generate-rules
```

Verify that `src/rules/builtins.ts` is recreated with all current rules plus the new ones.

- [ ] **Step 4: Update registry import**

In `src/rules/registry.ts`, ensure it imports from `./builtins` (it already does). No change needed.

- [ ] **Step 5: Add a registry sync test**

Create `tests/rules/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { builtinRules } from '../../src/rules/builtins';
import { RuleRegistry } from '../../src/rules/registry';

describe('RuleRegistry', () => {
  it('loads all builtin rules without duplicate ids', () => {
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const ids = registry.getRules().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 6: Run tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-rule-registry.ts package.json src/rules/builtins.ts tests/rules/registry.test.ts
git commit -m "feat(rules): auto-discover rule registry from src/rules"
```

---

## Task 10: Quality gates and integration validation

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 2: Run build**

```bash
pnpm build
```

Expected: dist generated successfully.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Re-scan the two projects**

```bash
cd /Users/cheng/documents/lm && node /Users/cheng/BRICK/bin/slop-audit.js scan --format json --threads 4 > /tmp/lm-final.json
cd /Users/cheng/looped && rm -f .slop-audit/cache/baseline.json && node /Users/cheng/BRICK/bin/slop-audit.js scan --baseline --format json --threads 4
node /Users/cheng/BRICK/bin/slop-audit.js scan --format json --threads 4 > /tmp/looped-final.json
```

Check that `documents/lm` still flags heavily and `looped` passes after re-baselining.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: quality gates and integration validation"
```

---

## Self-review checklist

- [ ] Spec coverage: every rule, scoring change, and registry change in the spec has at least one task.
- [ ] Placeholder scan: no TODOs, TBDs, or vague steps remain.
- [ ] Type consistency: `RuleSeverity`, `categoryWeights`, and `'auto'` handling are used consistently across tasks.

Plan saved to `docs/superpowers/plans/2026-06-15-ai-detection-rules-and-scoring.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session, batching where possible.

Which approach do you want?
