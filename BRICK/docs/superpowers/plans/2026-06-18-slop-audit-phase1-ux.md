# slop-audit Phase 1 UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the default `slop-audit scan` output with plain-language summaries, clear threshold status, and reduced stderr noise.

**Architecture:** Extend `ProjectReport` with scan metadata and thresholds, enrich `formatPretty` with summary/header/footer helpers, and move status/success/timing logs from `logger.error` to `logger.info`.

**Tech Stack:** TypeScript, Vitest, Commander, chalk.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Add `fileCount` and `thresholds` to `ProjectReport`. |
| `src/index.ts` | Populate new report fields; route non-error messages to `logger.info`; improve final failure wording. |
| `src/report/pretty.ts` | Render summary header, score line, threshold footer, and formatted parse errors. |
| `src/engine/logger.ts` | Optionally add `success`/`status` helpers; mostly unchanged. |
| `tests/report/pretty.test.ts` | Verify new pretty output sections. |
| `tests/cli.test.ts` | Verify JSON output includes new fields and threshold messages. |

---

### Task 1: Add `fileCount` and `thresholds` to `ProjectReport`

**Files:**
- Modify: `src/types.ts:163-177`
- Modify: `src/index.ts:545-559`
- Test: `tests/report/pretty.test.ts`

- [ ] **Step 1: Update the `ProjectReport` interface**

```ts
export interface ProjectReport {
  version: string;
  generatedAt: string;
  configPath?: string;
  slopIndex: number;
  assemblyHealth: number;
  categoryScores: Record<Category, number>;
  p90Score: number;
  peakScore: number;
  componentCount: number;
  fileCount: number;
  components: ComponentScore[];
  issues: Issue[];
  parseErrors?: Array<{ filePath: string; error: string }>;
  baseline?: BaselineMeta;
  thresholds: {
    meanSlop: number;
    p90Slop: number;
    individualSlopThreshold: number;
  };
}
```

- [ ] **Step 2: Populate the new fields in `runScan`**

In `src/index.ts`, locate the `report` object inside `runScan` and update it:

```ts
  const report: ProjectReport = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    configPath,
    slopIndex: aggregated.slopIndex,
    assemblyHealth: aggregated.assemblyHealth,
    categoryScores: aggregated.categoryScores,
    p90Score: aggregated.p90Score,
    peakScore: aggregated.peakScore,
    componentCount: aggregated.componentCount,
    fileCount: results.length,
    components: aggregated.components,
    issues: allIssues,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    baseline: baselineMeta,
    thresholds: config.thresholds,
  };
```

- [ ] **Step 3: Add a type-level test**

In `tests/report/pretty.test.ts`, add a helper that constructs a minimal report and assert `fileCount` and `thresholds` exist:

```ts
function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    slopIndex: 10,
    assemblyHealth: 90,
    categoryScores: { visual: 10, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0 },
    p90Score: 20,
    peakScore: 30,
    componentCount: 5,
    fileCount: 12,
    components: [],
    issues: [],
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    ...overrides,
  };
}
```

Use this helper in all existing `formatPretty` tests to satisfy the new required fields.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/index.ts tests/report/pretty.test.ts
git commit -m "feat(report): add fileCount and thresholds to ProjectReport"
```

---

### Task 2: Build summary header and plain-language score line

**Files:**
- Modify: `src/report/pretty.ts:78-119`
- Test: `tests/report/pretty.test.ts`

- [ ] **Step 1: Add a severity-count helper**

```ts
function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}
```

- [ ] **Step 2: Add a summary formatter**

```ts
function formatSummary(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  return `Scanned ${report.fileCount} files, ${report.componentCount} components, ${report.issues.length} issues (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`;
}
```

- [ ] **Step 3: Update the score block in `formatPretty`**

Replace the existing score block:

```ts
  sections.push(formatSummary(report));

  const slopIndex = Math.round(report.slopIndex);
  const assemblyHealth = Math.round(report.assemblyHealth);

  sections.push(
    chalk.bold(`Slop Index: ${slopIndex}  |  Health: ${assemblyHealth}`),
  );
  sections.push(chalk.dim('(lower Slop Index is better; Health is the inverse)'));
```

- [ ] **Step 4: Write tests**

```ts
it('prints a scan summary', () => {
  const report = makeReport({
    fileCount: 12,
    componentCount: 5,
    issues: [
      { ruleId: 'a', category: 'visual', severity: 'high', aiSpecific: true, message: 'x', line: 1, column: 1 },
      { ruleId: 'b', category: 'visual', severity: 'medium', aiSpecific: true, message: 'y', line: 1, column: 1 },
      { ruleId: 'c', category: 'visual', severity: 'low', aiSpecific: true, message: 'z', line: 1, column: 1 },
    ],
  });
  const out = formatPretty(report);
  expect(out).toContain('Scanned 12 files, 5 components, 3 issues (high: 1, medium: 1, low: 1)');
});

it('prints a plain-language score line', () => {
  const report = makeReport({ slopIndex: 31, assemblyHealth: 69 });
  const out = formatPretty(report);
  expect(out).toContain('Slop Index: 31  |  Health: 69');
  expect(out).toContain('(lower Slop Index is better; Health is the inverse)');
});
```

- [ ] **Step 5: Run the pretty tests**

Run: `pnpm test -- tests/report/pretty.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/report/pretty.ts tests/report/pretty.test.ts
git commit -m "feat(report): add scan summary and plain-language score line"
```

---

### Task 3: Add threshold footer

**Files:**
- Modify: `src/report/pretty.ts:33-119`
- Test: `tests/report/pretty.test.ts`

- [ ] **Step 1: Add threshold labels and formatter**

```ts
const thresholdLabels: Record<keyof ProjectReport['thresholds'], string> = {
  meanSlop: 'Project average',
  p90Slop: 'Worst 10% of files',
  individualSlopThreshold: 'Highest single file',
};

function formatThresholds(report: ProjectReport): string[] {
  const rows: string[] = [];
  const checks: Array<{ key: keyof ProjectReport['thresholds']; value: number }> = [
    { key: 'meanSlop', value: report.slopIndex },
    { key: 'p90Slop', value: report.p90Score },
    { key: 'individualSlopThreshold', value: report.peakScore },
  ];

  let failedCount = 0;
  for (const { key, value } of checks) {
    const limit = report.thresholds[key];
    const failed = value > limit;
    if (failed) failedCount += 1;
    const label = thresholdLabels[key].padEnd(30, ' ');
    const valueText = `${value.toFixed(1)} / ${limit}`.padStart(12, ' ');
    const status = failed ? 'fail' : 'pass';
    rows.push(`  ${label}${valueText}  ${status}`);
  }

  const result: string[] = ['Thresholds', ...rows];
  if (failedCount > 0) {
    result.push('');
    result.push('Next step: run `slop-audit scan --suggest` to see fixes, or `slop-audit scan --baseline` to accept today\'s scores as the new baseline.');
  } else {
    result.push('');
    result.push('All thresholds passed.');
  }
  return result;
}
```

- [ ] **Step 2: Insert the footer into `formatPretty`**

After the top components section and before parse errors, add:

```ts
  sections.push(...formatThresholds(report));
```

- [ ] **Step 3: Write tests**

```ts
it('prints threshold status with plain labels', () => {
  const report = makeReport({
    slopIndex: 31.1,
    p90Score: 100,
    peakScore: 100,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  });
  const out = formatPretty(report);
  expect(out).toContain('Project average ............... 31.1 / 25  fail');
  expect(out).toContain('Worst 10% of files ............ 100.0 / 50  fail');
  expect(out).toContain('Highest single file ........... 100.0 / 50  fail');
  expect(out).toContain('Next step: run `slop-audit scan --suggest`');
});

it('prints all-passed message when thresholds pass', () => {
  const report = makeReport({
    slopIndex: 10,
    p90Score: 20,
    peakScore: 30,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  });
  const out = formatPretty(report);
  expect(out).toContain('All thresholds passed.');
});
```

- [ ] **Step 4: Run the pretty tests**

Run: `pnpm test -- tests/report/pretty.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/pretty.ts tests/report/pretty.test.ts
git commit -m "feat(report): add plain-language threshold footer"
```

---

### Task 4: Improve parse error formatting

**Files:**
- Modify: `src/report/pretty.ts:104-111`
- Test: `tests/report/pretty.test.ts`

- [ ] **Step 1: Update the parse error block**

Replace the existing block with:

```ts
  if (report.parseErrors && report.parseErrors.length > 0) {
    sections.push(
      chalk.yellow(`Parse errors (${report.parseErrors.length}) — these files were skipped:`),
    );
    for (const { filePath, error } of report.parseErrors) {
      const firstLine = error.split('\n')[0] ?? error;
      sections.push(`  ${filePath}: ${firstLine}`);
    }
    sections.push('');
    sections.push(chalk.dim('Tip: add a path to `exclude` in your config to skip files the parser can\'t handle.'));
  }
```

- [ ] **Step 2: Write a test**

```ts
it('formats parse errors concisely with a tip', () => {
  const report = makeReport({
    parseErrors: [
      { filePath: '/project/bad.tsx', error: 'Unexpected token\n  at line 5' },
    ],
  });
  const out = formatPretty(report);
  expect(out).toContain('Parse errors (1) — these files were skipped:');
  expect(out).toContain('/project/bad.tsx: Unexpected token');
  expect(out).not.toContain('at line 5');
  expect(out).toContain('Tip: add a path to `exclude`');
});
```

- [ ] **Step 3: Run the pretty tests**

Run: `pnpm test -- tests/report/pretty.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/report/pretty.ts tests/report/pretty.test.ts
git commit -m "feat(report): format parse errors concisely with a tip"
```

---

### Task 5: Improve small-project note wording

**Files:**
- Modify: `src/report/pretty.ts:89-95`
- Test: `tests/report/pretty.test.ts`

- [ ] **Step 1: Update the note**

```ts
  if (report.componentCount <= 10) {
    sections.push(
      chalk.yellow(
        'Small project (10 or fewer components). Averages can be jumpy at this size—focus on individual file scores.',
      ),
    );
  }
```

- [ ] **Step 2: Update the existing test**

Locate the small-project test in `tests/report/pretty.test.ts` and update the assertion:

```ts
expect(out).toContain('Small project (10 or fewer components). Averages can be jumpy at this size—focus on individual file scores.');
```

- [ ] **Step 3: Run the pretty tests**

Run: `pnpm test -- tests/report/pretty.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/report/pretty.ts tests/report/pretty.test.ts
git commit -m "feat(report): reword small-project note in plain language"
```

---

### Task 6: Route non-error messages to stdout

**Files:**
- Modify: `src/index.ts:635-1123`

- [ ] **Step 1: Change JSON write confirmation**

In `renderOutput`, change:

```ts
      logger.error(`Wrote JSON report to ${options.json}`);
```

to:

```ts
      logger.info(`Wrote JSON report to ${options.json}`);
```

- [ ] **Step 2: Change baseline and timing log calls in `scanAction`**

Replace the following `logger.error` calls with `logger.info`:

```ts
// Saved baseline
logger.info(`Saved baseline to ${baselinePath(cwd)}`);

// Tightened baseline
logger.info(`Tightened baseline saved (revision ${baseline.baseline_revision}).`);

// Doctor timing
logger.info(`Doctor: bootstrap ${totalElapsed - scanElapsed}ms, scan ${scanElapsed}ms`);

// Baseline status
logger.info(baselineStatusMessage(report.baseline));

// Final timing
logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
```

Keep these as `logger.error`:

```ts
logger.error('High-severity issues found with --strict.');
logger.error(`Gating failure: ${stagedGatingResult.reason}`);
```

- [ ] **Step 3: Watch mode status messages**

In `watchProject`, change `logger.error` for status messages to `logger.info`:

```ts
logger.info(`Baseline active since ${date}...`);
logger.info('Config changed; reloading...');
logger.info('Baseline changed; reloading...');
logger.info('Watching for changes...');
```

- [ ] **Step 4: Run CLI tests**

Run: `pnpm test -- tests/cli.test.ts tests/integration/cli.test.ts`
Expected: PASS. If tests assert stderr content for these messages, update them to assert stdout or remove the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "fix(cli): route status and success messages to stdout"
```

---

### Task 7: Improve final threshold failure wording

**Files:**
- Modify: `src/index.ts:1097-1123`

- [ ] **Step 1: Compute failed threshold count**

Before the exit-code block, add:

```ts
  function failedThresholdCount(report: ProjectReport, config: ResolvedConfig): number {
    let count = 0;
    if (report.slopIndex > config.thresholds.meanSlop) count += 1;
    if (report.p90Score > config.thresholds.p90Slop) count += 1;
    if (report.peakScore > config.thresholds.individualSlopThreshold) count += 1;
    return count;
  }
```

- [ ] **Step 2: Replace generic failure message**

Replace:

```ts
      } else {
        logger.error('Slop thresholds exceeded.');
      }
```

with:

```ts
      } else {
        const failed = failedThresholdCount(report, config);
        logger.error(`${failed} threshold${failed === 1 ? '' : 's'} failed. See details above.`);
      }
```

- [ ] **Step 3: Write a test**

In `tests/cli.test.ts`, add a test that runs a scan known to exceed thresholds and asserts the new message:

```ts
it('reports plain-language threshold failure count', async () => {
  const result = await runCli(['scan', 'tests/fixtures/sloppy.tsx']);
  expect(result.exitCode).toBe(1);
  expect(result.combined).toContain('threshold');
  expect(result.combined).toContain('failed. See details above.');
});
```

Use the project's existing CLI helper (`tests/helpers/cli.ts`) for `runCli`.

- [ ] **Step 4: Run CLI tests**

Run: `pnpm test -- tests/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/cli.test.ts
git commit -m "feat(cli): report how many thresholds failed"
```

---

### Task 8: Run full quality gates

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: dist generated successfully.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: 506+ tests pass.

- [ ] **Step 4: Run integration checks on the two baselined projects**

Run:

```bash
node bin/slop-audit.js --workspace /Users/cheng/looped scan --format json --json /tmp/looped-check.json
node bin/slop-audit.js --workspace /Users/cheng/documents/lm scan --format json --json /tmp/lm-check.json
```

Expected: both exit `1` because thresholds are exceeded (baseline is active), JSON reports contain `fileCount`, `thresholds`, and the plain-language threshold footer is visible in pretty mode.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: quality gates pass for phase 1 UX improvements"
```

---

## Self-review checklist

- [ ] Spec coverage: summary header, score line, thresholds, parse errors, small-project note, logger cleanup, failure wording — each has a task.
- [ ] Placeholder scan: no TBD/TODO/"implement later"/"similar to Task N".
- [ ] Type consistency: `ProjectReport` fields match usage in `src/index.ts` and `src/report/pretty.ts`; threshold keys match `thresholdLabels`.
