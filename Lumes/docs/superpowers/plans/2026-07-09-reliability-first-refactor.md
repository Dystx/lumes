# Lumes reliability-first refactor

Approved local implementation record for the public-service refactor.

## Design decisions

- Trust and source freshness take precedence over dashboard density.
- Query state is distinct from map-display state; changing map layers cannot create a query chip.
- Desktop rails are reserved for `1280px` and up. Smaller viewports remain map-first.
- Blocking UI uses one keyboard/focus contract; mobile sheets provide explicit collapsed and expanded heights.
- Public pages share the Ember token system, reading measure, navigation, theme, and language behavior.
- Current Next.js, Prisma, SQLite, Caddy, Cloudflare, and MapLibre infrastructure is retained.

## Work packages

1. **Reliability and delivery:** normalize source state and freshness, avoid stale service-worker chunks, extend CI/browser validation, and add safe server diagnostics.
2. **Query and overlays:** implement filter/map/overlay contracts, shared selectors, selection reconciliation, and focus-safe overlays.
3. **Desktop:** reserve permanent rails for wide screens; make the primary rail a concise Situation view and separate Explore, Inspector, and Updates.
4. **Tablet and mobile:** use map-first drawers below desktop width, a 56px map summary, and predictable incident-sheet sizing.
5. **Public journeys:** use the public shell for status/newsletter/privacy and make newsletter/report/follow feedback explicit.
6. **Maintainability and performance:** extract focused presentation boundaries without changing map-data behavior; protect budgets with CI.

## Local delivery boundary

Changes remain local-only. Public read APIs and database schema remain compatible; commits, staging, deployment, and production configuration are outside this execution.
