# slop-audit

> Detect AI-generated frontend slop. Get a single Slop Index for any React / Vue / Svelte / Solid / Qwik / Astro project.

AI writes logic well, but it hallucinates UI. `slop-audit` reads your frontend code, extracts the design tokens and conventions it finds, and flags deviations that signal slop: arbitrary Tailwind values, ghost `useEffect`s, `<div onClick>`, inline styles, hardcoded colors, broken type scales, duplicated components, and more.

It answers one question brutally well:

> **Is this frontend built with tokens, semantics, and components, or hacked together with magic values and divs?**

---

## Installation

Run once without installing:

```bash
npx slop-audit
```

Add to a project as a dev dependency:

```bash
pnpm add -D slop-audit
```

---

## Quick start

Initialize a config in the project root:

```bash
npx slop-audit init
```

Scan the current workspace:

```bash
npx slop-audit scan
```

Or scan specific paths:

```bash
npx slop-audit scan src app
```

On first run, `slop-audit` auto-detects your framework, styling solution, and base spacing grid.

---

## Configuration

Config lives at `slop-audit.config.mjs` in the project root. It is an ES module that exports a default object.

```js
export default {
  include: ['src/**/*', 'app/**/*', 'pages/**/*', 'components/**/*'],
  exclude: [
    '**/node_modules/**',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.stories.{ts,tsx}',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
  ],

  // Per-category weight multiplier
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

  // CI thresholds
  thresholds: {
    meanSlop: 25,
    p90Slop: 50,
    individualSlopThreshold: 50,
  },

  // Rule severity overrides.
  // 'auto' keeps the rule's natural severity; 'off' disables it.
  rules: {
    'visual/inline-style': 'auto',
    'visual/hardcoded-color': 'low',
    'logic/style-sheet-avoidance': 'medium',
  },

  // Boost or reduce scores for specific frameworks
  frameworkMultipliers: {
    astro: 0.8,
  },
};
```

### Key options

| Option | Description |
|--------|-------------|
| `include` | Glob patterns for files to scan |
| `exclude` | Glob patterns for files to ignore |
| `categoryWeights` | Multipliers applied to each issue category when scoring |
| `thresholds` | `meanSlop`, `p90Slop`, and `individualSlopThreshold` CI gates |
| `rules` | Map rule IDs to `'auto'`, `'low'`, `'medium'`, `'high'`, or `'off'` |
| `frameworkMultipliers` | Adjust scores for specific frameworks |
| `contextTaxCaps` | Per-context slop caps for clean vs. standard components |
| `arbitraryValueAllowlist` | Tailwind arbitrary values that are acceptable |
| `wcag` | WCAG-specific settings such as target-size exemptions |

---

## CLI reference

```text
Usage: slop-audit [options] [command]

Options:
  -V, --version                 output the version number
  --framework <name>            framework multiplier to apply
  --include <glob>              include pattern (repeatable)
  --exclude <glob>              exclude pattern (repeatable)
  --ai-only                     only report AI-specific issues
  --human-only                  only report human-facing issues
  --ignore-wcag22               ignore WCAG 2.2 related issues
  --format <pretty|json|sarif>  output format (default: "pretty")
  --threads <n>                 number of worker threads
  --since <ref>                 only scan files changed since git ref
  --workspace <path>            workspace/project path
  --tighten                     tighten baseline allowances
  --fix                         apply auto-fixes
  --doctor                      run diagnostics
  --watch                       watch files and re-run
  --suggest                     print remediation advice
  --heatmap                     print migration ROI heatmap
  --quiet                       suppress non-error output
  --strict                      exit 2 if any high-severity issue remains
  --no-increase                 exit 2 if slop index increased since last run
  --baseline                    save a baseline after this scan
  --trend [n]                   print a sparkline of the last n runs
  --json [path]                 write JSON report to path or stdout
  --staged                      scan only staged files
  --cache                       cache parsed AST results locally
  -h, --help                    display help for command

Commands:
  init [options]                create a slop-audit config file
  install                       install the git pre-commit hook
  uninstall                     uninstall the git pre-commit hook
  badge                         print a shields.io slop-index badge
  suggest                       print remediation advice
  flywheel [options]            summarize aggregated scan telemetry
  scan [paths...]               scan files for slop
  help [command]                display help for command
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All thresholds passed and no regression |
| `1` | One or more thresholds failed |
| `2` | High-severity issues with `--strict`, score regression with `--no-increase`, scan error, or hook install failure |

---

## Example terminal output

```text
$ npx slop-audit scan
Scanned 312 files, 501 components, 1381 issues (high: 42, medium: 289, low: 1050)
Slop Index: 31  |  Health: 69
(lower Slop Index is better; Health is the inverse)

Category breakdown
  Visual          12.2
  Logic            0.8
  Typography       0.0
  Accessibility    0.0
  Layout           0.0
  Component        0.0
  Architecture     0.0
  Performance      0.0

Top offending components
  100.0  src/app/(tabs)/keepsakes.tsx
  100.0  src/app/(tabs)/search.tsx
  100.0  src/app/child/[id]/edit.tsx
  ...

Thresholds
  Project average ............... 31.1 / 25  fail
  Worst 10% of files ............ 100.0 / 50  fail
  Highest single file ........... 100.0 / 50  fail

Next step: run `slop-audit scan --suggest` to see fixes, or `slop-audit scan --baseline` to accept today's scores as the new baseline.

Issues (1381)

[HIGH  ] visual/inline-style · src/app/(tabs)/keepsakes.tsx:91:22
  Inline style prop detected
  → Move the style to a class or design-system token.
```

---

## Baselines

Save the current score as a baseline so CI only fails on new slop:

```bash
npx slop-audit scan --baseline
```

Tighten the baseline by 10%:

```bash
npx slop-audit scan --tighten
```

The baseline is stored in `.slop-audit/cache/baseline.json` and keyed to your current git HEAD and config hash.

---

## README badge

Generate a shields.io badge for your README:

```bash
npx slop-audit badge
```

Example output:

```markdown
[![AI-Slop: 31](https://img.shields.io/badge/AI--Slop-31-indigo)](https://slop-audit.dev)
```

---

## How scoring works

Each issue has a severity weight:

| Severity | Weight |
|----------|--------|
| high | 5 |
| medium | 2 |
| low | 1 |

Per-file scoring:

- Each issue is weighted by its category (`categoryWeights`).
- Repeated instances of the same rule in a single file are penalized with a density multiplier: `1 + log10(count)`.

Project scoring:

- `meanSlop` is the average of all file scores.
- `p90Slop` is the 90th percentile file score.
- `peakSlop` is the highest single file score.
- The final project Slop Index blends the mean and p90: `(mean + 0.5 × p90) / 1.5`.

Lower Slop Index is better. Health is the inverse.

---

## Adding new rules

Rule modules live in `src/rules/<category>/<rule>.ts`. Each module must export a const ending in `Rule` and a matching default export:

```ts
import { createRule } from '../rule';

export const myRule = createRule({
  id: 'category/my-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create: (ctx) => ({ ... }),
  analyze: (facts, ctx) => [...issues],
});

export default myRule;
```

Run `pnpm generate:rules` to regenerate the rule registry. This runs automatically before `pnpm build` and `pnpm test`.

---

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

---

## License

[MIT](./LICENSE)
