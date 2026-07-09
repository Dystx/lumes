# Lumes Follow-on Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the remaining map-integrity, data-trust, public-API, IA, compact-layout, localization, and maintainability gaps found after the reliability-first refactor.

**Architecture:** Keep Next.js, React, Prisma/SQLite, MapLibre, Caddy, Cloudflare, Ember tokens, Bricolage/Fraunces, and the existing translation catalog. Establish a single map/trust boundary first, then harden public APIs, then simplify the shells and extract page ownership. No schema migration or deployment is part of this plan.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Zustand, MapLibre GL, Tailwind v4, Vitest, Playwright/axe, Lighthouse CI, Prisma SQLite, Bun.

## Global Constraints

- Preserve all existing public read APIs and map/data-source behavior.
- Do not mount more than one MapLibre instance for a viewport.
- Use `--ember-*` tokens, existing icon wrappers, Bricolage/Fraunces, dark/light themes, and PT/EN support.
- Keep map-layer toggles separate from incident-query filters.
- Use TDD for behavior and browser tests for responsive interactions.
- Do not log secrets, email addresses, reporter names, exact confirmation links, or precise private coordinates.
- Do not modify generated files or unrelated dirty changes.
- No deployment or database migration.

---

### Task 1: Establish one map owner and resize contract

**Files:**
- Create: `src/components/map/map-scene.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/ember-map.tsx`
- Test: `tests/lib/map-scene-contract.test.ts`
- Test: `tests/e2e/responsive-interactions.test.ts`

- [ ] Write a failing contract test asserting the responsive map boundary exposes one `mapRef`, all layer feature props, `flyToIncidentId`, and `onFlyToCleared`, and that the page contains one `EmberMap` ownership path.
- [ ] Run `bunx vitest run tests/lib/map-scene-contract.test.ts`; verify it fails against the two current mount sites.
- [ ] Extract `MapScene` with a complete typed prop interface. Move the desktop/mobile `EmberMap` JSX under it and render only the active viewport branch.
- [ ] Add a `ResizeObserver`/layout effect in the owner that calls `map.resize()` after drawer, sheet, and breakpoint transitions; do not put resize logic in filter controls.
- [ ] Pass `fireRiskFeatures`, `fireStationsFeatures`, `satelliteFeatures`, `show*` flags, `visibleSources`, and `onFlyToCleared` to every viewport path.
- [ ] Run the contract test, `bun run typecheck`, and the responsive browser matrix. At 1280px opening Explore must leave at least 500px of rendered map and preserve tiles.

### Task 2: Normalize source freshness and compact trust feedback

**Files:**
- Create: `src/lib/data-trust.ts`
- Modify: `src/lib/data-state.ts`
- Modify: `src/lib/use-fetch.ts`
- Modify: `src/lib/use-app-data.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/mobile/mobile-view.tsx`
- Modify: `src/components/detail/IncidentDetailPanel.tsx`
- Test: `tests/lib/data-trust.test.ts`
- Test: `tests/lib/data-api-routes.test.ts`

- [ ] Write failing tests for source timestamp precedence (`fetchedAt`/`lastSuccess`), fallback/stale/error derivation, and safe localized reason labels.
- [ ] Run the focused tests and confirm metadata currently reports response time or loses `dataState` in client hooks.
- [ ] Implement `DataTrustState = { state: "fresh" | "updating" | "fallback" | "stale" | "empty" | "error"; source: string; sourceUpdatedAt: string | null; observedAt: string; reason: string | null }`.
- [ ] Preserve route-specific response shapes while adding the normalized trust envelope; use source timestamps for `updatedAt` and never infer freshness from response time alone.
- [ ] Make `useFetch` retain prior data without clearing the trust error and expose the envelope to all `use*New` wrappers.
- [ ] Create a fresh `AbortController` and timeout for each polling request, add an in-flight guard, and test timeout-then-retry behavior without remounting the hook.
- [ ] Render the same trust indicator beside desktop, tablet, and mobile incident counts and inside the selected-incident trust row; distinguish “updated”, “fallback”, “stale”, and “retry”.
- [ ] Verify dark/light × PT/EN × healthy/fallback/stale/empty/error screenshots and route tests.

### Task 3: Close public API abuse, privacy, and fan-out gaps

**Files:**
- Create: `src/lib/api/contracts.ts`
- Modify: `src/app/api/aerial/route.ts`
- Modify: `src/lib/aerial/merge.ts`
- Modify: `src/app/api/incidents/risks/route.ts`
- Modify: `src/app/api/risk/route.ts`
- Modify: `src/app/api/risk-fwi/[day]/route.ts`
- Modify: `src/app/api/region/[name]/route.ts`
- Modify: `src/app/api/realtime/route.ts`
- Modify: `src/app/api/fire-stations/route.ts`
- Modify: `src/app/api/source-health/route.ts`
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/api/history/route.ts`
- Modify: `src/app/api/alerts/route.ts`
- Test: `tests/lib/api-boundaries.test.ts`
- Test: `tests/lib/public-action-routes.test.ts`

- [ ] Add failing tests for `Infinity`, NaN, reversed/out-of-Portugal bbox, oversized history/report limits, negative offsets, report PII projection, and generic upstream errors.
- [ ] Add finite Portugal-bounded bbox validation, maximum area/subquery count, and rate limiting to aerial; verify malformed values return 400 without entering merge loops.
- [ ] Add finite coordinate validation, concurrency caps, caching, and a bounded request budget to incident risks/risk; return generic retryable errors and structured server logs.
- [ ] Derive realtime's internal incident URL from the request/validated runtime host instead of hardcoding port 3000; add a non-3000 smoke test.
- [ ] Mark curated fire-station fallback data as `fallback` and make source-health probe the fallback reason, not only HTTP status and non-zero count.
- [ ] Escape or DOM-construct all MapLibre popup content before rendering upstream incident fields; add an injection regression test for `src/components/ember-map.tsx`.
- [ ] Restrict public report GET to reviewed fields/statuses, clamp limits, require coordinates for POST or define an explicit privacy-safe no-coordinate schema; keep moderation disabled until staff identity exists.
- [ ] Replace alert global listing/deletion with an approved ownership/token model. Until that model is approved, return an explicit unavailable response rather than exposing shared subscriptions. Correct geofence coordinates and severity/event matching in the eventual contract.
- [ ] Apply the same ownership decision to followed incidents: use a browser-scoped signed token/session, or keep follow state local until identity exists; never expose or mutate a global visitor list.
- [ ] Normalize `dataState`, cache headers, and redacted error envelopes for history, stats, alerts, reports, risk, region, and related routes.
- [ ] Run focused route tests plus a bounded endpoint matrix covering status, cache, schema, redaction, and fan-out limits.
- [ ] Replace source-string-only service-worker/overlay assertions with runtime fake-cache/DOM event tests and add browser coverage for nested overlays, detail focus return, marker/list parity, follow/share, and action failure paths.

### Task 4: Make newsletter actions truthful and non-mutating on GET

**Files:**
- Modify: `src/app/api/newsletter/subscribe/route.ts`
- Modify: `src/app/api/newsletter/unsubscribe/route.ts`
- Modify: `src/app/api/newsletter/confirm/route.ts`
- Modify: `src/lib/email.ts`
- Modify: `src/components/public/newsletter-form.tsx`
- Test: `tests/lib/newsletter-route.test.ts`
- Test: `tests/lib/newsletter-unsubscribe.test.ts`

- [ ] Add failing tests for provider-not-configured, provider failure, DB failure, already-subscribed, invalid token, and GET unsubscribe non-mutation.
- [ ] Add an explicit provider readiness check. A stub must return a typed retryable error, never claim confirmation delivery.
- [ ] Wrap DB/provider failures in the normalized response envelope and ensure the client has pending, validation, confirmation, already-subscribed, and retry states.
- [ ] Replace email-in-query unsubscribe links with a one-time signed token. GET may render a confirmation page but must not mutate until the user confirms; POST must validate origin and token.
- [ ] Give confirmation/unsubscribe tokens a short signed expiry without a schema migration, rotate and invalidate them on unsubscribe/resubscribe, and reject expired/replayed tokens.
- [ ] Use the public shell or shared tokenized HTML for confirmation/unsubscribe responses and set no-store headers.
- [ ] Run newsletter route/client tests and browser happy/error flows without sending real email.

### Task 5: Simplify desktop IA and remove duplicate query controls

**Files:**
- Create: `src/components/shell/situation-panel.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/dashboard/DashboardPanel.tsx`
- Modify: `src/components/filters/filters-panel.tsx`
- Modify: `src/components/layout/right-sidebar.tsx`
- Modify: `src/components/detail/IncidentDetailPanel.tsx`
- Test: `tests/lib/incident-filters.test.ts`
- Test: `tests/e2e/responsive-interactions.test.ts`

- [ ] Add browser assertions that every query constraint has one owner and that legacy `Critical only`/duplicate Active controls do not render alongside Quick filter controls.
- [ ] Extract Situation presentation from `page.tsx`; keep only trust state, headline count, 3–5 priority incidents, and “all incidents”.
- [ ] Move district/resource/phase/distribution/history/diagnostics into Explore or progressive disclosure; filters and layers remain exclusively in Explore.
- [ ] Make priority rows and markers use the same selection callback and inspector; a hidden-by-query row must not open stale detail.
- [ ] Promote the right drawer to an accessible shared drawer contract with modal/non-modal mode, focus containment, focus return, topmost Escape, and MapLibre resize notification.
- [ ] Verify 1280×800 and 1440×900 dark/light screenshots with Explore open, inspector selected, empty results, degraded data, and reset baseline.

### Task 6: Design tablet and mobile as deliberate shells

**Files:**
- Modify: `src/components/mobile/mobile-view.tsx`
- Modify: `src/components/mobile/bottom-sheet.tsx`
- Modify: `src/components/mobile/map-peek.tsx`
- Modify: `src/components/mobile/mobile-map-controls.tsx`
- Modify: `src/components/dashboard/DashboardPanel.tsx`
- Modify: `src/app/page.tsx`
- Modify: `docs/DESIGN.md`
- Test: `tests/e2e/responsive-interactions.test.ts`
- Test: `tests/e2e/a11y.test.ts`

- [ ] Add interaction assertions for 320×568, 390×844, 768×1024, 1024×768 landscape, 1280×800, and 1440×900.
- [ ] At 768–1279px, use compact toolbar + contextual drawer + two-column incident list; do not expose phone-only bottom navigation as the sole shell.
- [ ] On phones, keep a 56px summary, a priority-only 52vh incident sheet, and a 92vh detail sheet with bottom-navigation safe-area padding and nested scroll ownership.
- [ ] Remove analytics from the phone Incidents destination; keep it behind Explore/More. Ensure long PT/EN labels wrap without clipping.
- [ ] Normalize all interactive controls to at least 44px and remove hardcoded mobile-only Portuguese labels.
- [ ] Verify drag, scroll, tab, dismissal, Escape, focus return, and no-overlap behavior under reduced motion.

### Task 7: Establish locale and public-page consistency

**Files:**
- Create or modify: `src/components/public/public-locale-control.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/public/public-page-shell.tsx`
- Modify: `src/app/status/page.tsx`
- Modify: `src/app/newsletter/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/api/newsletter/confirm/route.ts`
- Modify: `src/app/api/newsletter/unsubscribe/route.ts`
- Modify: `src/lib/i18n.ts`
- Test: `tests/e2e/a11y.test.ts`
- Test: `tests/e2e/public-pages.test.ts`

- [ ] Decide and test one locale contract: full PT/EN public pages with route persistence, or explicitly Portuguese-only public routes with no misleading toggle.
- [ ] Set `<html lang>` from the resolved locale and keep metadata locale aligned.
- [ ] Use the shared Ember shell, 65–75ch measure, responsive source rows, tokenized status indicators, and shared actions on all public pages.
- [ ] Make server-side status fetches use a guaranteed absolute base URL when `NEXT_PUBLIC_BASE_URL` is unset; add a test that an empty environment does not silently render all fallback values.
- [ ] Verify public page loading/error/empty/degraded states in both themes and supported locales.

### Task 8: Reduce orchestration debt and make CI reproducible

**Files:**
- Create: `src/components/shell/home-shell.tsx`
- Create: `src/components/map/map-data-adapter.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/use-app-data.ts`
- Remove only after call-site proof: `src/lib/use-live-data.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `lighthouserc.json`
- Modify: `deploy/deploy.sh`
- Modify: `next.config.ts`
- Modify: `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`, `docs/DESIGN.md`
- Test: `tests/lib/api-contract-matrix.test.ts`

- [ ] Inventory and type every `any` cast at the page/map/API boundaries; replace with domain DTOs or narrow adapters only after tests cover the path.
- [ ] Migrate remaining legacy `use-live-data` consumers, then prove zero runtime/static references before removal.
- [ ] In CI, pin Bun to the repository-supported version, create an isolated schema/database before health probing, and seed a deliberately empty healthy fixture.
- [ ] Make deployment build reproducible: run the build with the full build dependency set before any production-only pruning, or create an explicit builder/runtime split that still includes Prisma generation.
- [ ] Add security response headers (CSP with explicit map/feed origins, frame-ancestors, nosniff, referrer policy, and least-privilege permissions policy) and browser-check them without breaking MapLibre, geolocation, or RSS links.
- [ ] Make Lighthouse performance/accessibility/best-practice/SEO budgets blocking and keep the responsive/a11y browser matrix in the same job.
- [ ] Reconcile architecture/handoff/design docs with the actual local-only state; remove claims of production deployment unless independently verified.
- [ ] Run the complete gate: `bun run lint`, `bun run typecheck`, `bun run test`, build, a11y, responsive, Lighthouse, and targeted diff checks.

## Execution order and release gates

1. Tasks 1–2: map/trust integrity. Gate: no duplicate map, no black drawer state, degraded state visible at every viewport.
2. Tasks 3–4: public API and newsletter safety. Gate: bounded inputs, no PII overexposure, no mutation-by-GET, typed provider failure.
3. Tasks 5–6: IA and responsive shells. Gate: one query owner, tablet/phone flows, no clipping/overlap, focus/escape correctness.
4. Task 7: locale/public consistency. Gate: documented locale contract and matching `html lang`/copy.
5. Task 8: maintainability/CI. Gate: reproducible clean-runner verification and no unproved dead-code removal.

## Review matrix

| Surface | Viewports | Themes | States |
| --- | --- | --- | --- |
| Home map/situation | 390×844, 768×1024, 1024×768, 1280×800, 1440×900 | dark/light | fresh, updating, fallback, stale, empty, error, selected |
| Explore/filters | 390×844, 1024×768, 1280×800 | dark/light × PT/EN | baseline, each single chip, combined, zero results, reset |
| Detail/inspector | 390×844, 1280×800 | dark/light × PT/EN | selected, missing evidence, follow success/failure |
| Public pages | 320×568, 390×844, 768×1024 | dark/light × supported locale | loading, success, invalid, retry, degraded |
| API contracts | route matrix | n/a | healthy, stale, fallback, empty, retryable error, malformed/bounded input |
