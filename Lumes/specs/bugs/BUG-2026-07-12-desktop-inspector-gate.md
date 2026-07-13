# BUG-2026-07-12 — Desktop marker-to-Inspector browser gate

## Reproduce

- Environment: local Lumes dev server on `127.0.0.1:3000`, Playwright Chromium,
  1280×800 and 1440×900 contexts, reduced motion.
- Command: `LUMES_URL=http://127.0.0.1:3000 bun tests/e2e/responsive-interactions.test.ts`
- Result: mobile and tablet contexts pass; both desktop contexts time out while
  waiting for the Inspector after the projected map-marker click.

## Isolate

- The map advertises `data-map-ready="true"` and
  `data-incident-source-ready="true"` before the click.
- Direct list-row selection opens the Inspector at 1280×800.
- A focused Playwright reproduction using the same projected coordinate and
  reduced-motion setting opens the Inspector, so the component callback and
  dialog are functional.
- No production code change has been made for this failure yet.

## Hypothesize

1. **Timing/data race in the gate's projected marker coordinate** — plausible;
   falsify by repeating the exact gate sequence with additional post-ready
   stabilization and logging the selected coordinate.
2. **A stale dashboard priority ID is rendered as a clickable row** — likely;
   the shared selection guard rejects IDs absent from the current live/query
   visible set, leaving no Inspector to open.
3. **Desktop-only dialog accessibility/name issue** — falsify by selecting a
   current live row and querying the same `getByRole("dialog", { name: /Inspector/ })`.

## Verify

- The stale-priority hypothesis is confirmed: `topPriority` can be older than
  the live feed, while `handleSelectIncidentFromMap` intentionally rejects IDs
  not present in `visibleIncidentIds`. The row therefore looked actionable but
  selected nothing.
- The fix reconciles dashboard priority IDs against `visibleIncidents`, fills
  missing rows from the current live ranking, and keeps the shared selection
  guard intact. `tests/lib/incident-presentation.test.ts` covers the stale-ID
  case.
- The focused marker reproduction and the full six-viewport responsive gate
  now pass, including 1280×800 and 1440×900.

## Resolution

Closed. The stale dashboard-priority hypothesis was confirmed and fixed: the
dashboard now reconciles priority IDs against the current visible incident set
before rendering actionable rows, while the shared selection guard remains
strict. The focused marker reproduction and the full six-viewport responsive
gate pass, including 1280×800 and 1440×900. No further diagnostic
synchronization or map-wrapper change is pending for this bug.
