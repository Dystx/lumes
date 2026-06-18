# AI-Generated UI Detection

## Goal
Make `slop-audit` flag common AI-generated UI anti-patterns so a project full of AI-built screens no longer scores near zero.

## Rules

### 1. `visual/inline-style` (existing, unregistered)
- **What:** Any JSX `style={{...}}` prop.
- **Severity:** medium
- **Rationale:** AI routinely emits inline styles instead of design-system tokens or `StyleSheet.create`.

### 2. `visual/raw-style-values` (new)
- **What:** Numeric literals or hex/RGB colors inside a `style` prop when the file imports from a theme/token module.
- **Severity:** low
- **Rationale:** Hardcoded `16`, `24`, `#fff` are a strong AI signal when a `spacing`/`colors` token file is already imported.
- **Implementation:** Inspect each `facts.styleProps[].source`. If it contains `/\b\d+(\.\d+)?\b/` or a hex/RGB literal, and `facts.imports` includes a path matching `/theme|tokens|spacing|colors/i`, emit an issue.
- **Config:** none for v1.

### 3. `logic/console-log` (new)
- **What:** Calls to `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`.
- **Severity:** low
- **Rationale:** Common leftover from AI-generated debugging scaffolding.
- **Implementation:** Add `consoleCalls` to `ScanFacts`; visitor collects them during the AST walk.

### 4. `typo/placeholder-text` (new)
- **What:** String literals containing placeholder words.
- **Severity:** low
- **Rationale:** AI often leaves "Lorem ipsum", "TODO", "placeholder", "dummy", "sample text", "your text here".
- **Implementation:** Add `stringLiterals` to `ScanFacts`; rule matches a case-insensitive deny-list.
- **Config:** `placeholderDenylist?: string[]` merged with defaults.

### 5. `layout/duplicated-screen` (new, project-level)
- **What:** Screen files whose top-level JSX tag sequence is nearly identical.
- **Severity:** medium
- **Rationale:** AI copy-pastes screen boilerplate (header, scroll view, padding, empty state).
- **Implementation:** In `src/rules/project.ts`, compute a fingerprint per file from the ordered list of top-level JSX element tag names. Group files with identical fingerprints and emit one issue per cluster of size ≥ 2.
- **Scope:** Only files under `app/` or `screens/` (matched by path segment).

## Defaults

Add to `DEFAULT_CONFIG.rules`:

```ts
'visual/inline-style': 'medium',
'visual/raw-style-values': 'low',
'logic/console-log': 'low',
'typo/placeholder-text': 'low',
'layout/duplicated-screen': 'medium',
```

React Native / Expo preset keeps these enabled because they target AI UI patterns, not web DOM semantics.

## Architecture

- File-level rules live in `src/rules/visual/` and `src/rules/logic/` and follow the existing `Rule<Context>` interface.
- Project-level rule lives in `src/rules/project.ts` alongside `analyzeCssBloat` and `analyzeGapMonopoly`.
- Visitor additions:
  - `consoleCalls: ConsoleCallFact[]`
  - `stringLiterals: StringLiteralFact[]`
- Both facts are serializable and added to `ScanFacts`.

## Testing

- Unit tests for each new rule in `tests/rules/`.
- Visitor test verifying `consoleCalls` and `stringLiterals` extraction.
- Project-rule test for duplicated-screen fingerprinting.
- End-to-end scan of `documents/lm` to confirm slop index rises meaningfully.

## Risks

- `visual/raw-style-values` may be noisy on projects without a token file; we gate on theme/token imports.
- `layout/duplicated-screen` may flag legitimate design-system screens; tuning threshold/cluster size after first run.
- `typo/placeholder-text` can match legitimate strings (e.g., a real feature named "TODO list"); keep severity low.
