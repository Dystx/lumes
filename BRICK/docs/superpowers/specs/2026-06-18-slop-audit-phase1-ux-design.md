# slop-audit Phase 1 UX Design

**Date:** 2026-06-18
**Scope:** Improve the default `slop-audit scan` output and related CLI messaging.

## Goals

Make the default scan experience immediately understandable:

1. Show what was scanned and how many issues were found.
2. Use plain-language labels for scores and thresholds.
3. State clearly which thresholds failed and by how much.
4. Give the user an obvious next step.
5. Reduce stderr noise so status/success output goes to stdout.

## Non-goals

- Interactive init wizard (Phase 2).
- Config validation / `--config` flag (Phase 2).
- Heatmap / SARIF / advice redesign (Phase 4).
- README rewrite (Phase 4).

## Proposed changes

### 1. Logger cleanup

- Status, success, and timing messages move from `logger.error` to `logger.info`.
- `logger.error` is reserved for actual failures: gating reasons, `--strict` high-severity issues, `--no-increase`, and the final threshold-exceeded message.
- `--quiet` suppresses `info`/`warn` but still emits the final failure reason so CI logs remain actionable.
- Files: `src/engine/logger.ts`, `src/index.ts`.

### 2. Scan summary header

Add a plain-language summary line at the top of pretty output:

```
Scanned 312 files, 501 components, 1381 issues (42 high, 289 medium, 1050 low)
```

Implementation:

- Add `fileCount: number` to `ProjectReport`.
- Populate `fileCount` in `runScan` from `results.length`.
- Derive severity counts from `report.issues` in `formatPretty`.

### 3. Score line

Replace the existing score line with a clearer version:

```
Slop Index: 31  |  Health: 69
(lower Slop Index is better; Health is the inverse)
```

### 4. Threshold status footer

Add a `Thresholds` section after the category/components table. Use human labels instead of config keys:

```
Thresholds
  Project average ............... 31.1 / 25  fail
  Worst 10% of files ............ 100.0 / 50  fail
  Highest single file ........... 100.0 / 50  fail
```

Mapping from config keys to labels:

| Config key | Label |
|------------|-------|
| `meanSlop` | Project average |
| `p90Slop` | Worst 10% of files |
| `individualSlopThreshold` | Highest single file |

When thresholds fail, append:

```
Next step: run `slop-audit scan --suggest` to see fixes, or `slop-audit scan --baseline` to accept today's scores as the new baseline.
```

When all pass:

```
All thresholds passed.
```

### 5. Small-project note

Change the `<=10 components` note to:

```
Small project (10 or fewer components). Averages can be jumpy at this size—focus on individual file scores.
```

### 6. Parse error formatting

Present parse errors concisely:

```
Parse errors (3) — these files were skipped:
  src/app/malformed.tsx: Unexpected token...
  src/legacy/file.js: ...

Tip: add a path to `exclude` in your config to skip files the parser can't handle.
```

Implementation:

- Truncate each error to its first line.
- Add a tip line when parse errors exist.

### 7. Final failure reason

Replace the generic `Slop thresholds exceeded.` with:

```
1 threshold failed. See details above.
```

or for multiple failures:

```
3 thresholds failed. See details above.
```

## Files touched

- `src/types.ts` — add `fileCount` to `ProjectReport`.
- `src/index.ts` — populate `fileCount`; route output correctly; improve threshold/gating messages.
- `src/report/pretty.ts` — summary header, score line, threshold footer, parse error formatting.
- `src/engine/logger.ts` — optionally add `status`/`success` helpers (or just use `info`).

## Testing

- Update `tests/report/pretty.test.ts` for summary, score line, thresholds, and parse errors.
- Add/update `tests/cli.test.ts` cases for stdout/stderr routing and threshold wording.
- Run full quality gates: `pnpm typecheck && pnpm build && pnpm test`.

## Example output

```
Scanned 312 files, 501 components, 1381 issues (42 high, 289 medium, 1050 low)
Slop Index: 31  |  Health: 69
(lower Slop Index is better; Health is the inverse)

Category breakdown
  Visual          12.2
  ...

Top offending components
  100.0  src/app/(tabs)/keepsakes.tsx
  ...

Thresholds
  Project average ............... 31.1 / 25  fail
  Worst 10% of files ............ 100.0 / 50  fail
  Highest single file ........... 100.0 / 50  fail

Next step: run `slop-audit scan --suggest` to see fixes, or `slop-audit scan --baseline` to accept today's scores as the new baseline.
(scan took 153ms, total 179ms)
```
