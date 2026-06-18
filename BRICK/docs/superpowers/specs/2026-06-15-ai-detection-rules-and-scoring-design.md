# AI Detection Rules & Scoring Overhaul

## Goal

Make `slop-audit` better at detecting AI-generated frontend slop by:

1. Adding/refining rules that match the patterns we see in real AI-generated codebases.
2. Changing how file and project scores are computed so repeated, dense slop is weighted more heavily than one-off issues.
3. Making it trivial to add new rules in the future.

## Background

Two recent audits showed the same slop profile:

| Project | slopIndex | Top issue | Second issue |
|---|---|---|---|
| `documents/lm` (React Native / Expo) | 7.9 | `visual/inline-style` (885) | `visual/raw-style-values` (407) |
| `looped` (Next.js) without baseline | 3.0 | `visual/inline-style` (459) | `perf/css-bloat` (23) |

Both projects are dominated by inline styles, raw design values, leftover `console.log` calls, and placeholder text. The current scoring treats each issue linearly, so a file with 86 inline styles is capped at the same component score as a file with 20 — and the project mean is dragged up by many moderately sloppy files rather than by a few hotspots.

## Proposed rules

| Rule | Category | Severity | Description |
|---|---|---|---|
| `visual/inline-style` (refined) | visual | auto | Severity escalates per file: 1 occurrence = low, 2–5 = medium, 6+ = high. Keeps the per-instance issues so users see every location. |
| `visual/raw-style-values` (refined) | visual | low | Already flags raw numbers/colors in style props. No behavior change; benefits from the new density scoring. |
| `component/duplicated-component` | component | medium | Generalizes `layout/duplicated-screen`. Fingerprint the first N top-level element tags of any component file and flag groups of two or more files with identical fingerprints. |
| `logic/style-sheet-avoidance` | logic | medium | React Native / Expo only. Flags files that use inline `style=` props but never create or import a `StyleSheet`. |
| `visual/hardcoded-color` | visual | low | Flags hex/rgb/hsl color literals outside theme/token files. |

`layout/duplicated-screen` remains unchanged. The new `component/duplicated-component` rule covers the same pattern for non-screen components.

## Scoring changes

### Per-file scoring in `scoreFile`

1. **Category weights**: each issue contributes `SEVERITY_WEIGHTS[severity] * categoryWeights[category]`.
2. **Density multiplier**: group issues by `ruleId` within the file. For each group of count `N`, multiply that group’s weighted contribution by `1 + log10(N)`. Examples:
   - 1 occurrence → ×1.0
   - 10 occurrences → ×2.0
   - 100 occurrences → ×3.0
3. Sum the weighted, density-adjusted contributions.
4. Apply framework multiplier and context tax as today.
5. Cap `componentScore` at 100.
6. Subtract baseline score to produce `adjustedScore`.

### Project aggregation in `aggregateReport`

Replace the plain mean with a mean/p90 blend:

```ts
slopIndex = (mean + 0.5 * p90) / 1.5 * sizeNormalization
```

This lets heavily slopped files pull the project score up without letting a single file dominate.

`assemblyHealth`, `p90Score`, and `peakScore` stay unchanged.

## Auto-discovery registry

Today every new rule must be imported into `src/rules/builtins.ts`. This is error-prone and will not scale.

Change the registry to auto-discover bundled rules:

- Each rule lives in `src/rules/<category>/<rule-name>.ts` and exports a `Rule` as its default export.
- `src/rules/builtins.ts` is replaced by `src/rules/registry.ts`.
- At build time (or module load in tests), `registry.ts` globs `src/rules/**/*.ts`, dynamically imports each file, and collects the default exports into the `builtinRules` array.
- Rule order is deterministic (sorted by file path).
- The existing `createRule` helper and `Rule` interface do not change.

Benefits:
- Adding a rule is now: create file → implement `Rule` → export default → done.
- No manual registry edits.
- Category folders keep the rule taxonomy visible.

## Config changes

Add to `ResolvedConfig` and `DEFAULT_CONFIG`:

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

Add `categoryWeights` to `BASELINE_HASH_KEYS` in `src/engine/cache.ts` so that changing weights invalidates existing baselines.

Keep `thresholds` unchanged for now. After the new scoring lands, we can recalibrate defaults if real-world scores shift too far.

## Migration & baseline invalidation

This change intentionally invalidates existing baselines because `componentScore` values are computed differently. Users will see a message like:

```
Baseline invalid: config_hash mismatch; ignoring.
```

They must re-run:

```bash
slop-audit scan --baseline
```

## Testing plan

- Unit tests for `scoreFile`:
  - category weight application
  - density multiplier for repeated rule instances
  - cap at 100 still works
- Unit tests for `aggregateReport`:
  - new mean/p90 blend formula
  - empty scores still return 0
- Rule tests for refined `visual/inline-style` severity escalation.
- New rule tests for `component/duplicated-component`, `logic/style-sheet-avoidance`, and `visual/hardcoded-color`.
- Registry test: assert that every `.ts` file under `src/rules/` whose default export is a valid `Rule` appears in `builtinRules`.
- Integration smoke tests on `documents/lm` and `looped` to confirm:
  - The same sloppy files are still flagged.
  - The score ordering is reasonable.

## Out of scope

- Custom third-party rule plugins (not auto-discovered from user code).
- CLI output redesign.
- Automatic remediation/fixes for the new rules.
