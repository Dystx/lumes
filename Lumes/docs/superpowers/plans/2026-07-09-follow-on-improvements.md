# Lumes Follow-on Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the remaining map-integrity, data-trust, public-API, IA, compact-layout, localization, and maintainability gaps found after the reliability-first refactor.

**Architecture:** Keep Next.js, React, Prisma/SQLite, MapLibre, Caddy, Cloudflare, Ember tokens, IBM Plex Sans/Mono with Fraunces brand-only, dark/light themes, and the existing translation catalog. Establish a single map/trust boundary first, then harden public APIs, then simplify the shells and extract page ownership. No schema migration or deployment is part of this plan.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Zustand, MapLibre GL, Tailwind v4, Vitest, Playwright/axe, Lighthouse CI, Prisma SQLite, Bun.

## Global Constraints

- Preserve all existing public read APIs and map/data-source behavior.
- Do not mount more than one MapLibre instance for a viewport.
- Use `--ember-*` tokens, existing icon wrappers, IBM Plex Sans/Mono with Fraunces brand-only, dark/light themes, and PT/EN support.
- Keep map-layer toggles separate from incident-query filters.
- Use TDD for behavior and browser tests for responsive interactions.
- Do not log secrets, email addresses, reporter names, exact confirmation links, or precise private coordinates.
- Do not modify generated files or unrelated dirty changes.
- No deployment or database migration.

## Reconciliation with the current execution tranche (2026-07-12)

The reliability-first execution plan at
`docs/superpowers/plans/2026-07-10-full-frontend-improvement.md` supersedes
the overlapping UI work here. Current evidence proves the single `MapScene`
owner, trust envelope/polling guards, newsletter token/GET safety, shared
shell extraction, responsive/a11y/public matrices, cache/service-worker
contracts, and standalone packaging. This document remains open for the
gaps below rather than being marked complete by inference:

- public API fan-out, coordinate/date/region bounds, and redacted errors;
- full reduced-motion/drag/scroll/44px interaction evidence;
- continued cleanup of any newly discovered legacy data-hook imports or
  boundary casts (the current source tree has no `use-live-data` imports and
  no remaining `as any` boundary casts);
- CI/header compatibility and production-only deployment verification.

The current tranche has added bounded checks for incident-risk batches,
history queries, regional queries, mappable community reports, pinned Bun,
and isolated CI databases. The remaining bullets are still tracked below.

---

### Task 1: Establish one map owner and resize contract

**Files:**
- Create: `src/components/map/map-scene.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/ember-map.tsx`
- Test: `tests/lib/map-scene-contract.test.ts`
- Test: `tests/e2e/responsive-interactions.test.ts`

- [x] Write a failing contract test asserting the responsive map boundary exposes one `mapRef`, all layer feature props, `flyToIncidentId`, and `onFlyToCleared`, and that the page contains one `EmberMap` ownership path.
- [x] Run `bunx vitest run tests/lib/map-scene-contract.test.ts`; verify it fails against the two current mount sites.
- [x] Extract `MapScene` with a complete typed prop interface. Move the desktop/mobile `EmberMap` JSX under it and render only the active viewport branch.
- [x] Add a `ResizeObserver`/layout effect in the owner that calls `map.resize()` after drawer, sheet, and breakpoint transitions; do not put resize logic in filter controls.
- [x] Pass `fireRiskFeatures`, `fireStationsFeatures`, `satelliteFeatures`, `show*` flags, `visibleSources`, and `onFlyToCleared` to every viewport path.
- [x] Run the contract test, `bun run typecheck`, and the responsive browser matrix. At 1280px opening Explore must leave at least 500px of rendered map and preserve tiles.

**Task 1 evidence (2026-07-12):** `MapScene` is the only page-level MapLibre mount and owns `ResizeObserver`/window resize forwarding. `tests/lib/map-scene-contract.test.ts` now also rejects the former `as any` incident/source boundary casts and requires an explicit `data-incident-source-ready` signal. The live-to-UI adapter returns the typed `Incident` shape, including safe defaults for upstream fields. TypeScript, lint, unit tests, and the six-viewport responsive matrix pass; the desktop matrix now waits for the incident source to publish before exercising marker-to-Inspector and Explore geometry.

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

- [x] Write failing tests for source timestamp precedence (`fetchedAt`/`lastSuccess`), fallback/stale/error derivation, and safe localized reason labels.
- [x] Run the focused tests and confirm metadata currently reports response time or loses `dataState` in client hooks.
- [x] Implement `DataTrustState = { state: "fresh" | "updating" | "fallback" | "stale" | "empty" | "error"; source: string; sourceUpdatedAt: string | null; observedAt: string; reason: string | null }`.
- [x] Preserve route-specific response shapes while adding the normalized trust envelope; use source timestamps for `updatedAt` and never infer freshness from response time alone.
- [x] Make `useFetch` retain prior data without clearing the trust error and expose the envelope to all `use*New` wrappers.
- [x] Create a fresh `AbortController` and timeout for each polling request, add an in-flight guard, and test timeout-then-retry behavior without remounting the hook.
- [x] Render the same trust indicator beside desktop, tablet, and mobile incident counts and inside the selected-incident trust row; distinguish “updated”, “fallback”, “stale”, and “retry”.
- [x] Verify dark/light × PT/EN × healthy/fallback/stale/empty/error screenshots and route tests.

**Task 2 progress (2026-07-12):** `DataTrustState`, source-timestamp
precedence, retained-data error visibility, and bounded polling/abort guards
are implemented. `tests/lib/data-trust.test.ts` now covers fresh, updating,
fallback, stale, empty, and retryable states. The full theme/locale/state
matrix is now exercised by `tests/e2e/data-trust-matrix.test.ts` at both
desktop sizes, with screenshots written to `/tmp/lumes-data-trust-matrix`.

The request attempt is now isolated as `fetchJsonWithTimeout`, preserving
caller-owned abort cancellation while allocating fresh controller/timeout
state for each retry. `tests/lib/use-fetch-request.test.ts` proves a timed-out
attempt is followed by a successful fresh attempt (2 files / 5 focused tests,
typecheck, and lint green).

The shared `DataTrustIndicator` is now used by the desktop Situation panel,
tablet/mobile count surfaces, and the selected-incident trust row. Its
localized labels and state normalization are covered by
`tests/lib/data-trust-indicator.test.ts`; live incident fallback/stale/empty
states now take precedence over healthy auxiliary source probes. The desktop
Explore browser path asserts one visible quick-filter owner and rejects the
retired `Critical only` control. The full unit suite is now green at **66
files / 178 tests**. The matrix run covers PT/EN, dark/light,
healthy/fallback/stale/empty/error, map-ready baseline, Explore, Inspector,
reset-view, and horizontal-overflow states at 1280×800 and 1440×900. The
six-viewport reduced-motion responsive gate also passes sheet drag dismissal,
the single incident-sheet scroll owner, tabs, Escape, focus return, and
map-chrome collision checks. The full 24-route/viewport axe matrix passes with
zero violations.

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

- [x] Add failing tests for `Infinity`, NaN, reversed/out-of-Portugal bbox, oversized history/report limits, negative offsets, report PII projection, and generic upstream errors.
- [x] Add finite Portugal-bounded bbox validation, maximum area/subquery count, and rate limiting to aerial; verify malformed values return 400 without entering merge loops.
- [x] Add finite coordinate validation, concurrency caps, caching, and a bounded request budget to incident risks/risk; return generic retryable errors and structured server logs.
- [x] Derive realtime's internal incident URL from the request/validated runtime host instead of hardcoding port 3000; add a non-3000 smoke test.
- [x] Mark curated fire-station fallback data as `fallback` and make source-health probe the fallback reason, not only HTTP status and non-zero count.
- [x] Escape or DOM-construct all MapLibre popup content before rendering upstream incident fields; add an injection regression test for `src/components/ember-map.tsx`.
- [x] Restrict public report GET to reviewed fields/statuses, clamp limits, require coordinates for POST or define an explicit privacy-safe no-coordinate schema; keep moderation disabled until staff identity exists.
- [x] Replace alert global listing/deletion with an approved ownership/token model. Until that model is approved, return an explicit unavailable response rather than exposing shared subscriptions. Correct geofence coordinates and severity/event matching in the eventual contract.
- [x] Apply the same ownership decision to followed incidents: use a browser-scoped signed token/session, or keep follow state local until identity exists; never expose or mutate a global visitor list.
- [x] Normalize `dataState`, cache headers, and redacted error envelopes for history, stats, alerts, reports, risk, region, and related routes.
- [x] Run focused route tests plus a bounded endpoint matrix covering status, cache, schema, redaction, and fan-out limits.
- [x] Replace source-string-only service-worker/overlay assertions with runtime fake-cache/DOM event tests and add browser coverage for nested overlays, detail focus return, marker/list parity, follow/share, and action failure paths.

**Task 3 progress (2026-07-12):** aerial altitude and Portugal-bounded
coordinates are finite/bounded; incident-risk batches now reject oversized
input, rate-limit callers, cap weather concurrency, and return redacted
retryable errors; history and region routes reject invalid bounds and no
longer expose upstream error text; reports require a mappable Portugal
coordinate and only reviewed fields are public; realtime now rate-limits
coordinate, only reviewed fields are public, and report acknowledgements now
return an identifier/status without echoing private fields; realtime now
rate-limits connections and parses incident payloads without `any`. The broader endpoint
rate-limits connections, bounds each poll with an abort controller, and
parses incident payloads without `any`; alert trigger evaluation now fails
closed without querying shared subscriptions, and rate-limit responses use a
no-store retryable envelope on the hardened routes. The broader endpoint
matrix and full response-schema normalization remain open. MapLibre popup
feature handling now uses typed source features and escaped properties rather
than `any`; touch handlers now use MapLibre's `MapTouchEvent` type as well;
`tests/lib/map-popup.test.ts` guards the popup boundary.
Persistence stats now return explicit `healthy`/`empty`/`retryable-error`
states, redacted failures, and cache headers; `tests/lib/stats-route.test.ts`
covers the three states. The remaining route matrix and ownership work remain
open. Realtime now exposes a small `incidentFeedUrl()` helper and a non-3000
unit assertion so internal polling follows the request origin rather than a
hardcoded development port.

The curated fire-station fallback now carries its source note through
`/api/source-health`, so optional fallback state is visible with an actionable
reason instead of being reported as an unexplained stale source;
`tests/lib/source-health.test.ts` covers that contract. Malformed and
retryable responses on the aerial, risk, region, reports, follow, and
newsletter paths now explicitly use `Cache-Control: no-store`, with the
boundary suite asserting the risk/aerial/region cases. The bounded endpoint
matrix in `tests/lib/api-contract-matrix.test.ts` now covers empty/healthy,
retryable, fail-closed ownership, malformed input, cache policy, and redacted
error envelopes. Satellite, fire-risk forecast, biomass, and incident-timeline
routes now use the same additive state metadata, generic retryable messages,
and no-store error responses; focused route tests cover those boundaries.
`tests/lib/service-worker-runtime.test.ts` now executes the service worker with
fake caches to verify API/cross-origin bypass and navigation/static strategies;
the responsive browser gate now closes the remaining runtime DOM-overlay proof.

**Continuation evidence (2026-07-12, runtime overlay focus):** the shared
drawer/dialog primitives now focus their container synchronously before the
animation-frame fallback, eliminating the notification-drawer race where the
opener could still be focused after the drawer became visible. The focused
overlay contract, typecheck, and lint pass. The six-viewport
`tests/e2e/responsive-interactions.test.ts` matrix passes against a correctly
materialized standalone runtime with nested `.next/static` and `public`
assets; it covers reduced motion, mobile sheet ownership, report and
notification focus/escape/restore behavior, marker Inspector focus return,
drawer/chrome geometry, and desktop map readiness. Temporary browser/server
processes were stopped. The bounded full unit suite now passes **103 test
files / 314 tests**; production deployment remains unchanged.

**Continuation evidence (2026-07-12, satellite provider matrix):** the NASA
FIRMS route now has configured-key coverage for valid CSV parsing and malformed
row skipping, plus redacted non-OK, timeout, cache-failure, and rate-limit
contracts. Successful payloads now expose a typed healthy/empty `dataState`
instead of relying on client inference. The focused six-test satellite matrix,
typecheck, lint, diff check, and bounded full suite pass (**103 test files /
319 tests**); no provider key or production deployment was changed.

**Continuation evidence (2026-07-12, news geomatching matrix):** the curated
news route now preserves structured municipality matches when an incident
display label is longer than the municipality name. Its local matrix covers
fire-keyword filtering, matched-place output, partial RSS failure,
malformed/non-OK internal incidents, and the redacted cache-failure boundary.
Focused news contracts, typecheck, lint, diff check, full bounded suite, and a
post-change production build pass (**103 test files / 322 tests**).

**Continuation evidence (2026-07-12, dashboard fallback matrix):** the
dashboard matrix now covers malformed live payload fallback, explicit empty
state when both live and stored sources are empty, optional persistence count
failure without poisoning the core 200 response, and an outer cache failure
with a redacted no-store retryable envelope. Focused dashboard contracts,
typecheck, lint, diff check, bounded suite, and post-change production build
pass (**104 test files / 326 tests**).

**Historical checkpoint (2026-07-12, history/timeline DTO matrix):** history
and incident-timeline routes now have explicit persistence-state coverage for
redacted non-cacheable failures, nullable history fields, and non-empty
snapshot date serialization. Focused route contracts and the bounded suite
passed (**104 test files / 328 tests**) at that checkpoint. The later timeline
cache-contract continuation changed successful response headers while keeping
failures non-cacheable; see the current cache-policy entry below.

**Continuation evidence (2026-07-12, aerial partial-source matrix):** the
aerial route now has explicit coverage that non-empty aircraft features remain
visible when one ADS-B provider reports an error, while the response exposes a
healthy state with an actionable partial-source reason. The focused aerial
contract and bounded suite pass (**104 test files / 329 tests**); no provider
behavior changed.

**Continuation evidence (2026-07-12, biomass-grid state matrix):** the
biomass-grid route now has explicit healthy-empty and populated-cell
serialization coverage in addition to its redacted loader-failure contract.
The focused grid contract and bounded suite pass (**104 test files / 331
tests**); the source remains clearly labeled synthetic and no provider was
wired.

### Task 4: Make newsletter actions truthful and non-mutating on GET

**Files:**
- Modify: `src/app/api/newsletter/subscribe/route.ts`
- Modify: `src/app/api/newsletter/unsubscribe/route.ts`
- Modify: `src/app/api/newsletter/confirm/route.ts`
- Modify: `src/lib/email.ts`
- Modify: `src/components/public/newsletter-form.tsx`
- Test: `tests/lib/newsletter-route.test.ts`
- Test: `tests/lib/newsletter-subscribe-failure.test.ts`
- Test: `tests/lib/newsletter-unsubscribe.test.ts`

- [x] Add failing tests for provider-not-configured, provider failure, DB failure, already-subscribed, invalid token, and GET unsubscribe non-mutation.
- [x] Add an explicit provider readiness check. A stub must return a typed retryable error, never claim confirmation delivery.
- [x] Wrap DB/provider failures in the normalized response envelope and ensure the client has pending, validation, confirmation, already-subscribed, and retry states.
- [x] Replace email-in-query unsubscribe links with a one-time signed token. GET may render a confirmation page but must not mutate until the user confirms; POST must validate origin and token.
- [x] Give confirmation/unsubscribe tokens a short signed expiry without a schema migration, rotate and invalidate them on unsubscribe/resubscribe, and reject expired/replayed tokens.
- [x] Use the public shell or shared tokenized HTML for confirmation/unsubscribe responses and set no-store headers.
- [x] Run newsletter route/client tests and browser happy/error flows without sending real email.

**Task 4 progress (2026-07-12):** unsubscribe GET remains non-mutating with
one-time signed expiry tokens; confirmation/unsubscribe HTML responses now
carry `Cache-Control: no-store`, and focused route contracts cover invalid,
pending, provider-unavailable, database failure, non-mutating GET, and typed
retryable paths. Confirmation tokens now rotate after successful use and
replayed confirmation links return 410; `tests/lib/newsletter-confirm.test.ts`
covers the single-use lifecycle. Unsubscribe tokens now carry signed issuance
and expiry timestamps; replayed or pre-resubscribe tokens return 410, and the
existing confirmation token rotates on unsubscribe. Real provider delivery
and the complete DB/provider failure matrix remain open.
The 320px/390px public-pages browser matrix also remains green without sending
real email.

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

- [x] Add browser assertions that every query constraint has one owner and that legacy `Critical only`/duplicate Active controls do not render alongside Quick filter controls.
- [x] Extract Situation presentation from `page.tsx`; keep only trust state, headline count, 3–5 priority incidents, and “all incidents”.
- [x] Move district/resource/phase/distribution/history/diagnostics into Explore or progressive disclosure; filters and layers remain exclusively in Explore.
- [x] Make priority rows and markers use the same selection callback and inspector; a hidden-by-query row must not open stale detail.
- [x] Promote the right drawer to an accessible shared drawer contract with modal/non-modal mode, focus containment, focus return, topmost Escape, and MapLibre resize notification.
- [x] Verify 1280×800 and 1440×900 dark/light screenshots with Explore open, inspector selected, empty results, degraded data, and reset baseline.

**Task 5 progress (2026-07-12):** the focused IA contract now also enforces a
44px close target on the desktop drawer. Browser duplicate-owner and full
dark/light state evidence are now closed by the matrix run. Marker-to-Inspector browser coverage
now waits for the explicit map-ready state and preserves cluster fallback;
the six-viewport responsive matrix passes with the added map-sheet drag test.
Dashboard priority rows are now reconciled against the current visible live
set before rendering, so stale aggregate IDs cannot render as dead clickable
rows; `tests/lib/incident-presentation.test.ts` covers that fallback and the
desktop marker/list Inspector gate passes at 1280×800 and 1440×900. The
1280px path also verifies a dark→light→dark theme swap keeps the map ready and
does not introduce horizontal overflow; the full screenshot/state matrix is
recorded by `tests/e2e/data-trust-matrix.test.ts`.

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

- [x] Add interaction assertions for 320×568, 390×844, 768×1024, 1024×768 landscape, 1280×800, and 1440×900.
- [x] At 768–1279px, use compact toolbar + contextual drawer + two-column incident list; do not expose phone-only bottom navigation as the sole shell.
- [x] On phones, keep a 56px summary, a priority-only 52vh incident sheet, and a 92vh detail sheet with bottom-navigation safe-area padding and nested scroll ownership.
- [x] Remove analytics from the phone Incidents destination; keep it behind Explore/More. Ensure long PT/EN labels wrap without clipping.
- [x] Normalize all interactive controls to at least 44px and remove hardcoded mobile-only Portuguese labels.
- [x] Verify drag, scroll, tab, dismissal, Escape, focus return, and no-overlap behavior under reduced motion.

**Task 6 progress (2026-07-12):** compact chrome now derives sheet-safe
insets, mobile controls enforce 44px targets, labels are localized, and the
responsive matrix exercises reduced motion plus sheet collision geometry; an
expanded map sheet now collapses on a downward drag dismissal instead of
remaining expanded.
Full drag/scroll and both-theme interaction evidence is now closed by the
responsive gate and the desktop trust-state screenshot matrix; the 24-route
axe run also reports zero violations.

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

- [x] Decide and test one locale contract: full PT/EN public pages with route persistence, or explicitly Portuguese-only public routes with no misleading toggle.
- [x] Set `<html lang>` from the resolved locale and keep metadata locale aligned.
- [x] Use the shared Ember shell, 65–75ch measure, responsive source rows, tokenized status indicators, and shared actions on all public pages.
- [x] Make server-side status fetches use a guaranteed absolute base URL when `NEXT_PUBLIC_BASE_URL` is unset; add a test that an empty environment does not silently render all fallback values.
- [x] Verify public page loading/error/empty/degraded states in both themes and supported locales.

**Task 7 progress (2026-07-12):** public status server fetches now default to
the canonical `https://lumes.pt` origin in production when no base URL is
configured, with a regression contract for empty environments. Public routes
remain explicitly PT-PT; the shared shell and metadata contract are covered by
`tests/lib/public-locale-contract.test.ts`, and the 320px/390px public-pages
browser matrix is green. The home-map theme/locale/state matrix is now closed
by `tests/e2e/data-trust-matrix.test.ts`; `buildStatusViewModel()` and
`tests/lib/status-page-contract.test.ts` now cover operational, degraded,
healthy-empty-source, degraded-empty-source, and loading presentation states.
`tests/e2e/public-pages.test.ts` passes both themes at 320px and 390px and
waits through the visible loading banner to the server result. Public routes
remain intentionally Portuguese-only.

**Continuation evidence (2026-07-12):** `loadStatusPageData()` now exposes a
typed, injectable server-fetch boundary. Focused tests prove absolute URLs,
`cache: "no-store"`, healthy data, non-OK responses, thrown upstream errors,
and deterministic fallback envelopes without requiring a second Next server.
This strengthens the server-side evidence; the fixture-backed browser matrix
was subsequently run in `start` mode against the current build and is green.

**Continuation evidence (2026-07-12, rendered-state boundary):** status
presentation now lives in the typed `StatusPageView` component, separate from
the server loader. `tests/lib/status-page-render.test.ts` renders healthy and
degraded/empty-source states to static markup and verifies the visible state
markers and messages. This closes deterministic server-rendered presentation
coverage while preserving the separate fixture-backed browser evidence.

**Continuation evidence (2026-07-12, fixture-browser harness):** added the
opt-in `test:e2e:status-fixtures` command. It owns a temporary mock upstream
and isolated Next process, then exercises healthy, degraded, empty-source, and
upstream-fallback states across both themes and 320/390px viewports before
shutting down. It remains opt-in because it starts an additional Next process,
but the matrix is now verified in `start` mode against the current build with
all 28 fixture/theme/viewport combinations passing.

**Controlled-run note (2026-07-12):** the earlier machine snapshot showed
approximately 59% free memory, about 4 GB swap in use, and the existing Lumes
Next process at roughly 913 MB RSS. The harness was deferred at that point and
was later run in a controlled window after the competing browser job cleared.

**Continuation evidence (2026-07-12, memory-safer fixture mode):** the status
loader accepts the server-only `LUMES_STATUS_BASE_URL`, and the fixture harness
uses `bun run test:e2e:status-fixtures:start` to run `next start` against a
current `.next` build instead of starting a development compiler. The fresh
build and all 28 fixture/theme/viewport combinations pass; no fixture process
remains afterward. The added malformed-success and invalid-source fixtures
prove fail-closed health, invalid-date, and nullable-latency rendering in the
browser.

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
- Test: `tests/lib/health-route.test.ts`
- Test: `tests/e2e/security-headers.test.ts`

- [x] Inventory and type every `any` cast at the page/map/API boundaries; replace with domain DTOs or narrow adapters only after tests cover the path.
- [x] Migrate remaining legacy data-hook consumers, then prove zero runtime/static references before removal.
- [x] In CI, pin Bun to the repository-supported version, create an isolated schema/database before health probing, and seed a deliberately empty healthy fixture.
- [x] Make deployment build reproducible: run the build with the full build dependency set before any production-only pruning, or create an explicit builder/runtime split that still includes Prisma generation.
- [x] Add security response headers (CSP with explicit map/feed origins, frame-ancestors, nosniff, referrer policy, and least-privilege permissions policy) and browser-check them without breaking MapLibre, geolocation, or RSS links.
- [x] Make Lighthouse performance/accessibility/best-practice/SEO budgets blocking and keep the responsive/a11y browser matrix in the same job.
- [x] Reconcile architecture/handoff/design docs with the actual local-only state; remove claims of production deployment unless independently verified.
- [x] Run the complete local gate: `bun run lint`, `bun run typecheck`, `bun run test`, build, a11y, responsive, public/header browser checks, Lighthouse, and targeted diff checks.

**Task 8 progress (2026-07-12):** the page no longer imports the removed
`use-live-data` module; realtime, follow state, and nearest-context helpers
now have focused modules with typed boundaries. Remote CI execution and
production-only proof remain open; the executable `any` inventory is empty.
The browser header/MapLibre compatibility check is now wired into CI, and an
empty reachable database is explicitly treated as healthy by `/api/health` so
the clean-runner fixture can pass without fabricated incidents. The current
map boundary slice removes page-level incident/source `as any` casts, types the
live-to-UI adapter, and adds explicit incident-source readiness before browser
marker assertions; popup and touch-event boundaries are typed as well. The
remaining page/API hook inventory and full endpoint contract matrix remain
open.

**Continuation evidence (2026-07-12, unused home poll removal):** the
unused `useWeatherWarningsNew()` invocation has been removed from
`src/app/page.tsx`, eliminating an avoidable background request while leaving
the warning hook available to its dedicated consumers. The page contract,
typecheck, lint, and single-worker full refresh pass (**98 test files / 298
tests**).

**Continuation evidence (2026-07-12, page orchestration cleanup):** unused
page-local aliases/state for source toggles, auto-selection, and fire-risk
distribution are removed after confirming no runtime call sites. URL share-link
selection is unchanged; focused page contracts, typecheck, lint, and the
single-worker full refresh remain green (**98 test files / 298 tests**).

**Continuation evidence (2026-07-12, page binding cleanup):** unused page
bindings for incident-news ownership, mobile-sidebar state, and the fire-risk
setter are removed while the active filter derivation remains unchanged. The
page contract, typecheck, lint, and single-worker full refresh pass (**98 test
files / 299 tests**).

**Continuation evidence (2026-07-12, local SQLite path resilience):** the
database URL boundary now recovers from the stale local `.env` path to the
project database while preserving valid configured URLs. Fresh dev probes for
stats and incident timeline returned HTTP 200; the responsive ownership browser
gate passed at 390px and 1280px. Focused database/route contracts, typecheck,
lint, and the single-worker suite pass (**99 test files / 303 tests**).

**Continuation evidence (2026-07-12, warning-notice contrast):** the source-
health and optional-source warning notices now use an explicit `--type-secondary`
size token so the warning foreground is not overridden by Tailwind's
`text-secondary` color utility. The focused warning contract passes, and the
full six-viewport/four-route axe matrix reports **0 violations**. Typecheck,
lint, `git diff --check`, and the bounded single-worker suite pass (**100 test
files / 304 tests**); the temporary browser server was stopped.

**Continuation evidence (2026-07-12, mobile refresh/timeline browser proof):**
the active mobile Incidents sheet now surfaces a localized trust warning when
the live refresh fails. A focused Playwright flow at 390×844 performs the real
pointer pull, holds incident and dashboard responses until both settle, checks
the failure notice, and verifies timeline loading, retryable failure, and
recovery after retry. Typecheck, lint, full axe (0 violations), and the
single-worker suite pass (**100 test files / 307 tests**); the temporary server
was stopped.

**Continuation evidence (2026-07-12, incident timeline localization):** the
timeline loading, heading, event-count, empty, retry-error, retry-action, and
source-breakdown copy now comes from the shared PT/EN catalog. The focused UI
contract, mobile refresh/timeline browser flow, typecheck, lint, and the
single-worker suite pass (**100 test files / 307 tests**).

**Continuation reconciliation (2026-07-12):** the older timeline paragraphs
above predate the completed browser proof. The current mobile refresh/timeline
flow verifies delayed loading, retryable failure, and successful recovery at
390×844; the **100 test files / 308 tests** figure is the checkpoint recorded
at that point, not the current baseline. The current bounded baseline is
**111 test files / 347 tests**. The remaining open API work is deeper
route-state/provider coverage, not the timeline browser gate.

**Continuation evidence (2026-07-12, aerial provider failure boundary):**
`/api/aerial` now catches cache/merge rejections and returns a redacted
`502`/`no-store` retryable FeatureCollection envelope. The focused route tests,
typecheck, lint, diff check, and bounded full suite are green.

**Continuation evidence (2026-07-12, biomass-grid provider failure boundary):**
the lazy biomass-grid route now catches synthetic-grid/cache failures and
returns a redacted `502`/`no-store` retryable FeatureCollection envelope. Its
focused contract, typecheck, lint, diff check, and bounded full suite are
green (**101 test files / 309 tests**).

**Continuation evidence (2026-07-12, curated-news failure boundary):**
`/api/news` now catches unexpected aggregation/cache failures, keeps the
official source directory available, and returns a redacted `502`/`no-store`
retryable envelope. Healthy/failure news contracts, typecheck, lint, diff
check, and the bounded full suite are green (**102 test files / 310 tests**).

**Continuation evidence (2026-07-12, source-health aggregation boundary):**
`/api/source-health` now catches unexpected cache/probe aggregation failures
and returns a redacted `502`/`no-store` core retryable envelope. Healthy
fallback provenance, the focused source-health contracts, typecheck, lint,
diff check, and bounded suite are green (**102 test files / 311 tests**).

**Continuation evidence (2026-07-12, health-cache failure boundary):**
`/api/health` now catches unexpected cache failures and returns a redacted
`503`/`no-store` degraded response with an explicit failed cache check. Empty,
stale, persistence-failure, and cache-failure contracts plus all bounded gates
are green (**102 test files / 312 tests**).

**Continuation evidence (2026-07-12, fire-stations optional-layer boundary):**
`/api/fire-stations` now catches unexpected cache/serialization failures and
returns a redacted `502`/`no-store` retryable envelope while retaining the
curated fallback for Overpass outages. Healthy/fallback/failure contracts and
all bounded gates are green (**103 test files / 313 tests**).

All client data hooks now use explicit response DTOs rather than
`useFetch<any>`: dashboard, weather, fire risk, fire stations, warnings,
persistence stats, lazy satellite detections, persisted history, curated news,
aerial ADS-B, and regional commands.
Dashboard live/DB inputs are normalized before aggregation; history dates are
serialized at the route boundary; news and aerial expose explicit health
envelopes; the aerial layer normalizes nullable altitude coordinates safely;
and the map adapter accepts both the upstream satellite detection shape and its
rendered feature shape. Regional ArcGIS input is parsed from `unknown`, and
geometry remains opt-in. IPMA fire-risk and weather parsers now narrow
malformed upstream values to safe defaults, and the OSM fire-stations parser
does the same for malformed Overpass nodes while preserving the curated
fallback. Weather warnings now reject unknown levels and redact upstream
failure messages. ANEPC parsing is now shared between the live incidents route
and ingest pipeline, with malformed-feature coverage in `tests/lib/anepc.test.ts`.
The focused route, client, satellite, news, history, aerial, regional-command,
fire-stations, weather-warning, ANEPC, and adapter contracts pass. The direct
`useFetch<any>` inventory is now empty. Page-level incident, weather,
dashboard-priority, and severity casts are gone, and dashboard/detail-panel
props, timeline responses, and notification boundaries are typed. The broader
API response matrix remains open; the executable `any` inventory is empty,
with remaining matches limited to comments and translated copy.

**Continuation evidence (2026-07-12, OG route coverage):** the per-incident
Open Graph route is now represented in the contract inventory through
`tests/lib/og-incident-route.test.ts`, covering healthy, missing, and
persistence-failure image responses. The full route/state matrix is still
tracked separately from this entry-point coverage.

**Continuation evidence (2026-07-12, active-filter extraction):** localized
active-filter chip labels now cross a dedicated pure adapter rather than a
nested page ternary. The focused tests cover PT/EN quick, severity, resolved,
resource, search, phase, empty-severity, deterministic ordering, and unknown
filter fallback behavior; a static page contract verifies that query ownership
and callback wiring remain in `page.tsx`. Browser proof for long labels remains
part of the deferred screenshot/browser gate.

**Continuation evidence (2026-07-12, visible-incident extraction):** playback
and live incident-pool selection now crosses a pure `deriveVisibleIncidents`
boundary. The page supplies the existing live/sample collections and playback
frames, so no fallback behavior was changed; focused tests prove cutoff,
nearest-frame, tie, and filter-order semantics. Browser proof remains part of
the deferred interaction gate.

**Continuation evidence (2026-07-12, source-health presentation):** the
page-level source-health state, reason, and optional-layer warning composition
now uses a pure tested view-model boundary. Existing core/optional precedence
and raw-source warning semantics are preserved; the browser trust matrix
remains the integration gate.

**Continuation evidence (2026-07-12, risk forecast route coverage):** the
`/api/risk-fwi/[day]` route now has healthy, invalid-day, and redacted upstream
failure contracts, including cache-header assertions. The broader API matrix
remains open for routes requiring deeper provider-state or browser evidence.

**Continuation evidence (2026-07-12, status response normalization):** the
server-rendered `/status` page now validates successful health, statistics, and
source-health envelopes through pure typed normalizers. Malformed success
payloads degrade safely, non-OK/throw fallbacks remain unchanged, and disabled
sources retain nullable latency in the rendered status table, reject malformed
required health fields, and render invalid timestamps as `—`. Focused tests
and the full local suite pass at **92 test files / 282 tests**; the fixture-backed
browser matrix for seven final-state fixtures, including malformed success and
invalid source fields, is green. Loading remains covered by unit/contract tests
rather than this browser harness.

**Continuation evidence (2026-07-12, DTO and overlay follow-up):** the
persistence statistics boundary now uses shared `PersistenceStatsCounts` and
`PersistenceStatsResponse` types across the persistence service, API route,
client hook, and dashboard prop; the focused DTO/stats/persistence suite is
green (4 files / 13 tests), with typecheck and lint passing. The responsive
browser gate now proves report-dialog and notification-drawer focus return,
follow/share interactions, and a mocked report-submission failure path at
the mobile viewport. It passes all six viewports. Phone map controls,
filter-pill, and legend are not mounted while the full-width Explore drawer
is open, preventing them from being covered by that drawer. Optional-layer
legend availability now derives fallback/error/empty states from the fetch
envelopes instead of collapsing all non-success states to healthy/disabled.
The remaining strict gaps are the complete theme/state screenshot matrix,
the non-modal rail's final shared-drawer contract, and authorized production
verification.

Blocking dialogs, drawers, mobile sheets, Explore, and long-press actions now
register with `src/lib/blocking-overlay.ts`; Escape and Tab are dispatched only
to the newest blocking entry. The non-modal desktop RightSidebar now uses the
same stack for Escape without trapping Tab focus, while retaining its focus
return and MapLibre resize/layout contract. The runtime stack has focused
unit tests and the six-viewport responsive gate remains green. The desktop
Explore browser path now asserts one visible quick-filter owner and rejects
the retired `Critical only` control.

**Continuation evidence (2026-07-12, provider/liveness matrix):** the
regional-command ArcGIS route now times out external requests and returns a
redacted `502`/`no-store` retryable envelope for network, non-OK, and cache
failures; malformed successful payloads remain explicit empty state. The
health route now has empty, stale, and persistence-failure contracts. Direct
ANEPC/IPMA fetches in the incident, weather, fire-risk, and warning routes are
also explicitly timeout-bounded. The single-worker full suite passes **93
test files / 285 tests**, with typecheck, lint, and diff checks green.

**Continuation evidence (2026-07-12, MapLibre source safety):** the map
wrapper's eight GeoJSON source updates now use a typed fail-closed helper;
missing or wrong-type sources no longer trigger unchecked casts during style
transitions. Focused map contracts, typecheck, lint, and the single-worker
full suite pass (**94 test files / 288 tests**).

**Continuation evidence (2026-07-12, responsive incident-detail ownership):**
the mobile incident `BottomSheet` and desktop `RightSidebar` now have
exclusive viewport ownership at the `xl` breakpoint, with a hydration-neutral
match-media hook preventing either hidden surface from mounting first. This
removes duplicate detail effects and hidden overlay/focus ownership while
preserving the existing CSS layout. The detail root now carries explicit
surface/test identifiers. Focused contracts, typecheck, lint, and the
single-worker full refresh pass (**96 test files / 292 tests**); browser
request-count proof now passes at 390px and 1280px against a fresh Lumes dev
server.

The new `tests/e2e/incident-ownership.test.ts` script covers one mounted
surface plus one timeline/news request at mobile and desktop widths; execution
against a fresh server is green.

**Continuation evidence (2026-07-12, awaitable mobile refresh):** the shared
fetch contract now has an explicit `refetchAsync()` promise for callers that
must keep UI pending state until a request generation settles. Effect-local
cancellation prevents an aborted older request from clearing newer loading
state. The mobile page uses the promise for both live incidents and dashboard
data; existing desktop callers retain the non-awaiting `refetch()` path.
Focused contracts, typecheck, lint, and the single-worker full refresh pass
(**98 test files / 298 tests**).

**Historical checkpoint (2026-07-12, incident timeline resilience):** the
client timeline request shares the 10-second timeout/non-OK boundary and
renders a localized retry action while preserving inline incident events. The
focused timeline contracts and the then-current single-worker refresh passed
(**98 test files / 297 tests**). The browser delayed/error-state proof was
subsequently closed by the mobile refresh/timeline flow documented above.

**Continuation evidence (2026-07-12, incident timeline cache contract):** the
timeline route now applies `public, s-maxage=60,
stale-while-revalidate=300` to successful empty and populated responses while
keeping persistence failures `no-store`. The focused route contract asserts
both success headers and the redacted failure envelope, and verifies
`dataState.sourceUpdatedAt` comes from the newest persisted snapshot. The
current bounded baseline remains **106 test files / 336 tests**.

The post-change bounded suite, typecheck, lint, diff check, and capped-heap
production build are green; no temporary Lumes/test/build process remains.

**Continuation evidence (2026-07-12, aerial optional-layer feedback):** the
typed aerial status model now distinguishes loading, healthy, partial, empty,
and error responses. The lazy MapLibre layer propagates provider state through
`AdvancedMapLayers` into the existing PT/EN advanced-layer warning surface;
partial aircraft data remains usable and retry/toggle recovery remains
available. Focused status/UI/API contracts, typecheck, lint, the six-viewport
responsive browser matrix, and the bounded suite are green (**106 test files /
336 tests**).

**Continuation evidence (2026-07-12, composite-risk optional-layer boundary):**
the viewport `/api/risk` route now has healthy/cacheable and redacted
upstream-failure contracts, while `src/lib/risk/overlay.ts` rejects malformed
payloads and bounds numeric values before rendering. The lazy risk layer now
uses abort-bounded fetching, clears stale map data on failure, and performs
fail-closed source updates below incident symbols. The rebuilt-standalone
browser flow proves localized failure and toggle recovery; the bounded suite
now passes **109 test files / 343 tests**.

**Continuation evidence (2026-07-12, biomass optional-layer boundary):**
the synthetic biomass GeoJSON response now has a typed normalizer, and the
lazy layer uses abort-bounded fetching, explicit empty/error status, and the
fail-closed GeoJSON source helper. Rebuilt-standalone browser proof covers
failure and toggle recovery; the bounded suite now passes **111 test files /
347 tests**. No biomass provider was introduced.

**Continuation evidence (2026-07-12, aerial client boundary):**
the aerial client now validates the FeatureCollection and aircraft feature
shape before rendering, bounds the request with the shared 10-second timeout,
aborts on cleanup, avoids duplicate in-flight loads, clears stale map state on
failure/empty/invalid responses, and updates sources through the typed
fail-closed helper. Focused aerial contracts, typecheck, lint, and the bounded
single-worker suite pass at **112 test files / 350 tests**; no provider behavior
changed.

**Continuation evidence (2026-07-12, follow DELETE rate limit):**
the public unfollow boundary now enforces the documented 30-request/minute
per-IP budget after CSRF validation, preserving its fail-closed `503` state for
allowed requests and returning a redacted `429`/`Retry-After`/`no-store`
envelope when exhausted. Focused public-action/API contracts, typecheck, lint,
capped build, and the bounded suite pass at **112 test files / 351 tests**.

**Continuation evidence (2026-07-12, regional response matrix):**
the API contract matrix now covers populated regional responses, the default
active-status filter, explicit `resolved=1` inclusion, and blank-name input in
addition to the existing empty and persistence-failure states. The bounded
suite passes **112 test files / 354 tests** and verifies dates after JSON
serialization.

**Continuation evidence (2026-07-12, fire-risk provider normalization):**
the IPMA fire-risk parser now rejects malformed/out-of-mainland coordinates,
empty municipality identifiers, and non-integer RCM values instead of creating
false `0,0` records. All-invalid responses are explicit cacheable empty state;
valid mixed data remains healthy, and the map adapter applies the same finite
Portugal guard. Focused route/adapter contracts, typecheck, lint, capped
build, and the bounded suite pass at **112 test files / 360 tests**.

**Continuation evidence (2026-07-12, CSRF error normalization):**
the shared origin guard now emits the standard `403`/`dataState.empty`/
`no-store` envelope. Direct helper coverage and alerts/follow mutation tests
prove the boundary without exposing origin details or changing ownership
behavior; the bounded suite passes **113 test files / 362 tests**.

**Continuation evidence (2026-07-12, weather station geometry):**
the IPMA weather parser now treats station latitude/longitude as an atomic
mainland-Portugal pair, preventing partial coordinates from reaching nearest-
station context while preserving valid weather metrics. Focused route/context
contracts, typecheck, lint, capped build, and the bounded suite pass at **113
test files / 362 tests**.

**Continuation evidence (2026-07-12, realtime initial poll):**
the realtime SSE stream now performs one bounded poll immediately after the
`connected` event, preserving the existing 30-second interval and abort
cleanup. Focused transport coverage proves heartbeat/new-incident delivery;
the bounded suite passes **113 test files / 363 tests**.

**Continuation evidence (2026-07-12, Overpass station geometry):**
the fire-station provider parser now rejects finite-but-out-of-envelope nodes,
including `0,0`, against the existing mainland Overpass query bounds before
publishing provider data. The curated fallback remains unchanged so island
coverage is preserved when Overpass mirrors fail. Focused station
healthy/fallback/failure contracts, typecheck, lint, capped build, and the
bounded suite pass at **113 test files / 364 tests**.

**Continuation evidence (2026-07-12, ANEPC geometry):**
the shared ANEPC adapter now rejects finite-but-out-of-Portugal coordinates
before either the live incidents route or ingest pipeline can publish them.
Mainland, Madeira, and Azores envelopes remain accepted. Focused ANEPC/data
route contracts, typecheck, lint, capped build, and the bounded suite pass at
**113 test files / 364 tests**.

**Continuation evidence (2026-07-12, regional-command geometry):**
the opt-in ArcGIS geometry serializer now fails closed for malformed coordinate
leaves instead of coercing them to zero. Compact command metadata and valid
geometry remain unchanged. Focused regional-command contracts, typecheck, lint,
capped build, and the bounded suite pass at **113 test files / 365 tests**.

**Continuation evidence (2026-07-12, FIRMS geometry):**
NASA FIRMS requests now use the corrected western Portugal bound (`-9.5`,
including Lisbon) and the CSV parser drops finite detections outside that
envelope. Configured/malformed, failure, timeout, cache, and rate-limit
contracts remain green; the bounded suite stays at **113 test files / 365
tests**.

**Continuation evidence (2026-07-12, aerial bbox clipping):**
the ADS-B merge now clips radius-provider and OpenSky results to the caller's
bbox before deduplication and GeoJSON publication. Focused merge/route
contracts, typecheck, lint, capped build, and the bounded suite pass at **114
test files / 366 tests**.

**Continuation evidence (2026-07-12, strict FIRMS parsing):**
FIRMS coordinate parsing now uses strict finite-number conversion, rejecting
partial strings such as `38.72foo` before the Portugal-envelope check. Valid
detections and configured/failure/rate-limit contracts remain green; the
bounded suite remains **114 test files / 366 tests**.

**Continuation evidence (2026-07-12, core response matrix):**
the data-route matrix now covers malformed-success ANEPC data as cacheable empty
state and redacted/no-store IPMA weather failures. Focused matrix contracts,
typecheck, lint, capped build, and the bounded suite pass at **114 test files /
368 tests**.

**Continuation evidence (2026-07-12, public report/municipality matrix):**
the public response matrix now covers populated municipality aggregation and
ordering, reviewed-report projection with a clamped public limit, and redacted
non-cacheable report-storage failure. `/api/reports` now projects its public DTO
explicitly at the route boundary instead of relying only on ORM `select`.
Focused matrix contracts, typecheck, lint, capped build, diff check, and the
bounded suite pass at **114 test files / 371 tests**.

**Continuation evidence (2026-07-12, Open-Meteo risk boundary):**
`fetchOpenMeteoWeather()` now validates untrusted JSON at runtime, requiring
finite requested metrics, humidity in `0..100`, non-negative wind and
precipitation, and a wind direction in `0..360`; missing precipitation retains
the existing zero default. Direct `/api/risk` rejects malformed successful
provider payloads with a redacted `502`/`no-store` envelope, while batch
`/api/incidents/risks` preserves per-incident `no_weather` semantics with finite
zeroed risk fields. Focused unit/route contracts, typecheck, lint, capped build,
diff check, and the bounded suite pass at **115 test files / 380 tests**.

**Continuation evidence (2026-07-12, dashboard geometry boundary):**
dashboard live responses and DB fallback rows now reuse the Portugal-region
coordinate validator before publishing geometry or priority-card coordinates.
Finite-but-invalid values such as `0,0` are omitted rather than reaching the
map or nearest-context consumers. Focused dashboard/ANEPC/data-route contracts,
typecheck, lint, capped build, diff check, and the bounded suite pass at **115
test files / 382 tests**.

**Continuation evidence (2026-07-12, IPMA forecast envelope):**
`/api/risk-fwi/[day]` now normalizes known forecast identifiers, RCM, and date
fields through `src/lib/fire-risk/forecast-normalizer.ts`. Malformed successful
top-level payloads return a redacted `502`/`no-store` retryable envelope;
valid envelopes with no usable rows return a cacheable explicit empty state.
Focused normalizer/route contracts, typecheck, lint, capped build, diff check,
and the bounded suite pass at **116 test files / 387 tests**.

**Continuation evidence (2026-07-12, aerial overlay bbox defense):**
the client aerial normalizer now validates the response bbox and drops finite
aircraft points outside that envelope before MapLibre publication. Malformed
bbox metadata invalidates the response; the existing Portugal bbox remains the
compatibility fallback for older envelopes. Focused aerial contracts,
typecheck, lint, capped build, diff check, and the bounded suite pass at **116
test files / 389 tests**.

**Continuation evidence (2026-07-12, IPMA weather metrics):**
`/api/weather` now normalizes required temperature, humidity, wind-speed, and
direction metrics instead of converting malformed values to fabricated zeros.
Invalid rows are dropped, valid mixed rows remain, and all-invalid timestamps
produce a cacheable explicit empty state. Focused weather/incident-context
contracts, typecheck, lint, capped build, diff check, and the bounded suite
pass at **117 test files / 396 tests**.

**Continuation evidence (2026-07-12, strict FIRMS scalar metrics):**
NASA FIRMS `frp` and `bright_ti4` values now require strict finite,
non-negative numeric tokens before a detection reaches the satellite DTO.
Malformed, infinite, and negative scalar rows are dropped; valid mixed rows
remain, and all-invalid payloads retain the cacheable explicit empty state.
Focused satellite/adapter contracts, typecheck, lint, capped build, diff
check, and the bounded suite pass at **117 test files / 398 tests**.

**Continuation evidence (2026-07-12, strict ANEPC operational scalars):**
the shared ANEPC adapter now rejects missing, partial, non-finite, negative, and
non-integer status-code, personnel, asset, and duration values before core
incident or persistence publication. Valid mixed rows remain, valid zero values
remain valid, and all-invalid successful responses retain the cacheable empty
state. Adapter, incidents-route, and ingest regressions, typecheck, lint,
capped build, diff check, and the bounded suite pass at **117 test files / 402
tests**.

**Continuation evidence (2026-07-12, ANEPC ingest fail-closed):**
`runIngest()` now skips persistence when the provider collection is empty, all
features are malformed, or no valid fire incidents remain. A non-empty
all-invalid response records `ANEPC response contained no valid features`, so
persistence's stale-incident auto-resolution cannot run on corrupted input.
Added empty/all-invalid ingest regressions; the bounded suite, typecheck, lint,
capped build, and diff check pass at **117 test files / 404 tests**.

**Continuation evidence (2026-07-12, ANEPC timestamp integrity):**
`ptDateToISO()` now accepts complete Portuguese and ArcGIS-style timestamps,
validates calendar/time ranges, and returns no value for missing or malformed
dates instead of substituting the current time. Invalid timestamps are dropped
before freshness/confidence scoring; adapter, incidents-route, and ingest
regressions plus typecheck, lint, capped build, diff check, and the bounded
suite pass at **117 test files / 407 tests**.

**Continuation evidence (2026-07-12, ANEPC trust/completeness refinements):**
Lisbon-local timestamps now convert through `Europe/Lisbon` with seasonal
offsets; future freshness is capped at `1`, incident IDs require non-negative
integers, and partial provider corruption preserves valid upserts while
disabling stale-incident cleanup. Added DST, future-clock, ID, persistence,
and partial-corruption regressions; the bounded suite, typecheck, lint, capped
build, and diff check pass at **117 test files / 410 tests**.

**Continuation evidence (2026-07-12, ANEPC schema-drift diagnostic):**
`runIngest()` now records `ANEPC response contained no fire incidents after
normalization` when a non-empty, structurally valid provider response produces
no fire event types. Persistence remains skipped, so a query/schema drift
cannot trigger stale-incident auto-resolution while the cron/health result
still exposes an actionable diagnostic. Added the regression; the focused
ingest suite passes at **10 tests**. The full single-worker suite passes at
**117 test files / 411 tests**; typecheck, lint, capped build, diff check, and
asset preflight also pass.

**Continuation evidence (2026-07-12, ANEPC geometry-shape boundary):**
the shared adapter now rejects an explicitly non-`Point` GeoJSON geometry
before using property-coordinate fallback. Missing geometry type remains
compatible with the existing fallback contract, while `LineString`/polygon
shapes cannot be silently canonicalized into incident points. Added the
adapter regression; the full quality gates are rerun below.

**Geometry boundary verification (2026-07-12):** the focused adapter/data/
ingest/persistence suite passes **41 tests**, the full single-worker suite
passes **117 test files / 411 tests**, and typecheck, lint, capped build, diff
check, and asset preflight pass. The adapter test also explicitly preserves
the missing-geometry property-coordinate fallback.

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

## Follow UI continuation outcome (2026-07-12)

The browser-local follow state is now isolated in
`src/lib/use-followed-incidents.ts`. Pending IDs and persistence rollback stay
with the hook; `page.tsx` keeps the existing storage preflight and localized
toast copy. Same-task duplicate calls are blocked by a synchronous ref through
an async persistence boundary, while a latest-set ref prevents overlapping
different-ID calls from losing a transition. The hook returns whether a
transition was applied so ignored duplicates cannot emit duplicate toasts.

`tests/lib/followed-incidents.test.ts` covers immutable state and ownership
contracts. The focused gate passes **4 files / 9 tests**; the full single-worker
suite passes **118 test files / 413 tests**. Lint, typecheck, and the capped
production build pass. Browser persistence/reload and storage-failure E2E
coverage now pass through `tests/e2e/follow-state.test.ts` against a fresh
local server. The browser gate covers persistence across reload, same-task
duplicate clicks, and localized `localStorage.setItem` rollback; the temporary
server was stopped afterward.

## Notification state continuation outcome (2026-07-12)

The local notification state is now owned by `src/lib/use-notifications.ts`
instead of `page.tsx`. `markNotificationsRead()` is a pure immutable helper;
existing drawer unread counts and incident-selection callbacks remain wired
unchanged. Focused notification/page contracts, lint, typecheck, the full
single-worker suite (**119 test files / 414 tests**), and the capped build pass.

## Refresh lifecycle continuation outcome (2026-07-12)

`src/lib/refresh-state.ts` now owns the pure decision about whether a desktop
refresh is pending, successful, or failed. The page still owns the actual
refetch and localized toast side effects, and mobile refresh behavior remains
covered by its awaitable-generation contract. Manual and awaitable refetches
clear stale error/loading state before the new request generation is scheduled;
the `previousRefetchedAt` identity guard prevents a stale `Date` object from
settling a retry. Focused refresh/mobile contracts, lint, typecheck, the full
suite (**120 test files / 419 tests**), the mobile refresh retry browser flow,
and the capped build pass.

## Keyboard shortcut continuation outcome (2026-07-12)

`src/lib/keyboard-shortcuts.ts` now owns pure intent routing and
`src/lib/use-keyboard-shortcuts.ts` owns the two global listener lifecycles,
focus trap, and opener restoration. `page.tsx` injects action callbacks and
continues to own incident/map state. Select/contenteditable guards, container
Shift+Tab focus entry, and latest-action refs now protect the listener and
dialog lifecycle. Focused routing/ownership contracts, the fresh keyboard
browser flow, lint, typecheck, the full suite (**122 test files / 425 tests**),
and the capped build pass.

## Live fallback-status continuation outcome (2026-07-12)

The fallback transition decision now lives in the pure typed
`src/lib/live-status.ts` helper. The page retains the previous-status ref and
localized toast side effects; the helper preserves one-time fallback entry,
silent repeated fallback, recovery only when live incidents are present, and
silent recovery with an empty live set. `tests/lib/live-status.test.ts` covers
all four branches. The focused contract passes 4 tests, the full single-worker
suite passes **123 test files / 429 tests**, and lint, typecheck, and the capped
production build pass.

## Map theme boundary continuation outcome (2026-07-12)

`src/lib/map/map-style.ts` now exports the typed `normalizeMapTheme()`
boundary used by `MapScene`. It preserves the previous defensive behavior:
only `"light"` is light, while `"dark"`, `"system"`, unknown values, and
`undefined` resolve to dark. The page no longer casts the `next-themes` string
at the component boundary. The focused map-style/map-scene gate passes 3 files
/ 10 tests; the full suite passes **123 test files / 430 tests**; lint,
typecheck, and the capped production build pass. Independent review approved
the change with no findings.

## Follow callback ownership continuation outcome (2026-07-12)

The redundant `toggleFollow` forwarding function is removed from
`src/app/page.tsx`. Inspector and long-press follow/alert actions now invoke
the page-owned `handleToggleFollow` directly, preserving browser-local
persistence, pending guards, rollback, and localized toast behavior. The
ownership contract passes; the fresh follow browser flow passes all three
scenarios; the full suite passes **123 test files / 431 tests**; lint,
typecheck, and the capped production build pass. Independent review approved
the cleanup with no changes.

## Filter reset ownership continuation outcome (2026-07-12)

The dead page-level filter reset adapter is removed. `FiltersPanel` now
receives phase/resource filter setters and clears those values alongside
search, quick, severity, and resolved-state filters; phase/resource values also
keep the panel reset affordance active. The focused contracts pass 2 files / 11
tests, the six-viewport responsive browser flow passes, the full suite passes
**123 test files / 433 tests**, and lint, typecheck, and the capped production
build pass.

## Incident selection ownership continuation outcome (2026-07-12)

List-driven surfaces now call `handleSelectIncident`, which updates the
selected incident without requesting a map flight. MapLibre map clicks and
marker-menu detail actions continue to call `handleSelectIncidentFromMap`, so
the camera moves only when the interaction originates from the map. The
source contract asserts two list `onSelectIncident` owners, one mobile
`onTapIncident` owner, one MapScene map handler, and one marker-menu map call.
The focused contract passes 2 files / 6 tests; the reviewer approved the
ownership correction; all six responsive browser viewports pass; the full
suite passes **123 test files / 434 tests**; lint, typecheck, and the capped
production build pass.

## Notification selection continuation outcome (2026-07-12)

Notification drawer selections now pass through the guarded list-selection
handler before the drawer closes. Visible notification targets select without
moving the map; stale, filtered, or hidden targets clear selection/fly state
through the existing fail-closed semantics. The focused selection contract
passes 2 files / 7 tests; independent review approved the change; lint and
typecheck pass.

## ANEPC request coalescing continuation outcome (2026-07-12)

`/api/incidents` now replaces its boolean lock and five-second wait loop with
a route-local shared in-flight promise around the completed-value cache. The
promise is cleared on both resolve and reject with identity protection, so a
slow concurrent request cannot start a second ANEPC fetch and a failed load
does not poison the next retry. The focused route contract passes 20 tests,
including slow concurrency and rejection/retry races; independent review
approved the implementation; all six responsive browser viewports pass
against the correctly materialized standalone runtime; the full suite passes
**123 test files / 437 tests**; lint, typecheck, capped build, and diff check
pass.

## Realtime client lifecycle continuation outcome (2026-07-12)

The browser SSE lifecycle now lives in typed `src/lib/realtime-client.ts`;
`useRealtimeIncidents` remains a thin React state/callback boundary. The
client coalesces repeated errors into one reconnect timer, retries constructor
failures, ignores stale source callbacks, drops malformed frames, and cancels
the active source/timer on disposal. Focused client/server realtime tests pass
2 files / 7 tests; independent review approved the lifecycle; the full suite
passes **124 test files / 440 tests**; lint, typecheck, capped build, diff
check, and the correctly materialized standalone six-viewport browser matrix
pass.

## Source-health probe continuation outcome (2026-07-12)

The `/api/source-health` probe now parses provider responses through the typed
`src/lib/source-health-probe.ts` boundary. Invalid JSON/envelopes, non-200
responses, invalid counts, states, and timestamps fail closed with redacted
source errors. Explicit stale, fallback, disabled, and retryable states remain
distinct; `dataState.reason` and fallback notes remain visible to trust
consumers. Source freshness only uses explicit provider timestamps, and the
aggregate no longer substitutes response time when a provider omits one.

The focused source-health/trust/API gate passes **4 files / 39 tests**;
independent review approved the slice. The full single-worker suite passes
**124 test files / 448 tests** with a 2 GB heap cap; typecheck, lint, diff
check, and the capped production build pass. The build emits the existing
multiple-lockfile workspace-root warning but completes successfully.

## IPMA warning payload continuation outcome (2026-07-12)

The `/api/weather-warnings` route now uses the typed
`src/lib/weather/warnings.ts` normalizer. Non-array provider payloads fail
closed instead of becoming a misleading empty state; recognized warning rows
with missing, whitespace-only, invalid, or impossible timestamps are dropped,
and an array containing no valid recognized rows is retryable. IPMA's actual
timezone-less local ISO timestamps and zoned ISO timestamps are both accepted.
Unknown/green rows remain safely filtered, and valid empty arrays preserve the
cacheable empty response.

The final focused weather-warning/source-health/API gate passes **4 files / 58
tests**; independent review approved the corrected validator. The full
single-worker suite passes **124 test files / 454 tests** with a 2 GB heap cap;
typecheck, lint, diff check, and the capped production build pass. The build
emits the existing multiple-lockfile workspace-root warning but completes.

## Dashboard normalization continuation outcome (2026-07-13)

The dashboard live and database paths now share the typed
`src/lib/dashboard/normalizer.ts` boundary. Unknown severity/status values,
negative or fractional personnel/asset counts, invalid timestamps, contradictory
status fields, and declared non-Point geometries are rejected before they can
distort aggregates or priority rankings. A retryable live envelope is not
treated as healthy, and a database fallback query failure now propagates as a
redacted `500`/`no-store` response instead of being mistaken for an empty
dashboard.

The focused dashboard/API gate passes **3 files / 33 tests**; independent
review approved the slice. The full single-worker suite passes **124 test files
/ 460 tests** with a 2 GB heap cap; typecheck, lint, diff check, and the capped
production build pass. The build emits the existing multiple-lockfile
workspace-root warning but completes successfully.

## IPMA observation freshness continuation outcome (2026-07-13)

The `/api/weather` boundary now validates observation bucket keys through
`src/lib/weather/observations.ts`. The selector ignores malformed or impossible
keys and chooses the newest valid instant rather than relying on lexical key
order. IPMA's timezone-less local timestamps resolve against
`Europe/Lisbon` (including DST) independently of the host timezone; the public
observation timestamp remains unchanged, while `dataState.sourceUpdatedAt` is
canonicalized to UTC for cross-host freshness checks. No valid timestamp now
produces a cacheable explicit empty state, and normalized rows reject invalid
timestamps instead of publishing them.

The focused weather/source-health/API gate passes **5 files / 63 tests**;
independent review approved the corrected timezone handling. The full
single-worker suite passes **124 test files / 468 tests** with a 2 GB heap cap;
typecheck, lint, diff check, and the capped production build pass. The build
emits the existing multiple-lockfile workspace-root warning but completes.

## Batch incident-risk result continuation outcome (2026-07-13)

`/api/incidents/risks` now distinguishes a successful query with no usable
results from a healthy populated response. Unknown IDs and persistence rows
outside Portugal return a cacheable explicit `empty` state without provider
work; mixed valid/invalid rows retain the valid risks. Existing per-incident
`no_weather` semantics remain explicit with finite zeroed metrics. The local
Open-Meteo cache now stores in-flight promises, preventing same-coordinate
incidents in one batch from duplicating upstream calls.

The focused risk/API gate passes **4 files / 25 tests**; independent review
approved the bounded change. The full single-worker suite passes **124 test
files / 472 tests** with a 2 GB heap cap; typecheck, lint, diff check, and the
capped production build pass. The build emits the existing multiple-lockfile
workspace-root warning but completes.

## Shared client trust continuation outcome (2026-07-13)

The shared `useFetch` boundary now resolves response metadata through strict
`DataStateMeta` normalization. Known states, valid calendar timestamps, source
freshness, and bounded optional text are preserved; unknown states, impossible
dates, invalid source timestamps, and malformed fields become a generic
retryable/error trust state instead of silently becoming fresh. A missing
`dataState` keeps the legacy healthy compatibility path. `deriveDataTrust()`
does not infer provider freshness from client `updatedAt`, and existing E2E
fixtures were brought up to the metadata contract.

The focused trust/client gate passes **6 files / 32 tests**; independent review
approved the boundary. The full single-worker suite passes **124 test files /
485 tests** with a 2 GB heap cap; typecheck, lint, diff check, and the capped
production build pass. The build emits the existing multiple-lockfile
workspace-root warning but completes.

## Shared client trust precedence correction (2026-07-13)

The independent review found that a non-fallback refresh error could still be
reported as `fresh` when a response carried valid `healthy` metadata. The
`deriveDataTrust()` precedence is now explicit: invalid metadata and refresh
errors win over ordinary metadata states, while an explicit retained fallback
continues to remain `fallback`. A red-first regression test protects this
contract.

The focused trust gate passes **5 files / 20 tests**; the full suite passes
**125 test files / 506 tests** with a 1.5 GB heap cap; typecheck, lint, diff
check, and the capped production build pass. The build emits the existing
multiple-lockfile workspace-root warning.

## Client incident payload boundary continuation outcome (2026-07-13)

The core live incident response now crosses a strict client DTO boundary in
`src/lib/incident-client.ts` before `presentIncident` or the map adapter can
consume it. Required identifiers, ISO timestamps, known source/event/status/
severity/trust enums, nested properties, bounded trust/resource scalars, and
Portugal Point coordinates are validated. Invalid rows are discarded while
valid rows in the same successful payload remain usable; the isolated adapter
keeps the existing fallback and map/detail model shape.

The focused incident-client gate passes **5 files / 41 tests**; full ESLint,
TypeScript, and `git diff --check` pass. The full single-worker suite passes
**125 test files / 506 tests** with a 1.5 GB heap cap, and the capped
production build passes. The build still reports the existing multiple-lockfile
workspace-root warning.

## Service-worker cache correctness continuation outcome (2026-07-13)

`public/sw.js` now caches navigation responses only when `response.ok` is true,
so origin 4xx/5xx pages cannot poison the offline cache. Static cache entries
with an expired, missing, or malformed `Date` header are served as
last-known-good while a refresh is attached to `event.waitUntil`; refresh
network and cache-write failures are caught without evicting the stale asset.
Uncached non-OK static responses return a deterministic 503 body, and the
existing activation cleanup is now runtime-tested. API, cross-origin, and
Next static bypass behavior remains unchanged.

The focused service-worker gate passes **2 files / 11 tests**; full ESLint,
TypeScript, and `git diff --check` pass. The full single-worker suite passes
**127 test files / 550 tests** with a 1.5 GB heap cap, and the capped
production build passes with the existing multiple-lockfile workspace-root
warning. Navigation writes are now joined to `waitUntil`, and activation
deletes only Lumes-owned runtime caches.

## MapLibre style restoration lifecycle continuation (2026-07-13)

The central map now owns a generation-guarded style transition boundary.
Obsolete core/satellite `style.load` callbacks no-op, only the latest style
can restore readiness and emit `MAP_STYLE_RESTORED_EVENT`, and unmount
invalidates pending work. A dedicated transition-start event cancels pending
advanced-layer remounts; initial-load prop changes reconcile after load;
satellite tint updates include theme changes; default 2D rotation/pitch
controls remain unchanged.

The focused gate passes **4 files / 12 tests**, the complete map contract
suite passes **15 files / 44 tests**, and the full single-worker suite passes
**127 test files / 523 tests** with a 1.5 GB heap cap. TypeScript, ESLint, and
`git diff --check` pass. The current production build was intentionally not
run while unrelated heavy workspace processes were active; remaining low-risk
follow-ups are a true MapLibre event-order integration test and explicit
`setStyle` error/timeout handling.

## MapLibre style-load recovery continuation (2026-07-13)

Style replacement now has a bounded runtime: target `style.load` commits once,
style-propagated errors and timeouts perform one rollback to the last committed
style, stale callbacks are generation-guarded, and rollback failure exposes a
`retryable-error` map-style state without looping. Initial style loading has a
separate watchdog and narrow style-error listener, and successful fallback is
reported as `recovered` while keeping the known-good 2D map operational.

The focused map/style gate passes **4 files / 17 tests**; the complete map
contract suite passes **15 files / 50 tests**; the full single-worker suite
passes **127 test files / 528 tests** with a 1.5 GB heap cap. TypeScript,
ESLint, and `git diff --check` pass. Low-risk follow-up: MapLibre style URL
errors without a propagated `style` payload now trigger immediate rollback when
their URL matches the active target/fallback; unrelated tile/source errors
remain timeout-bounded and ignored.

## MapLibre style URL-error classification continuation (2026-07-13)

Diff-mode `AJAXError` events without a propagated `style` payload now match
`error.url` against the active target or fallback URL. Genuine basemap URL
failures therefore roll back immediately; unrelated source/tile and unknown
errors remain excluded from immediate rollback.

The focused map/style gate remains **4 files / 17 tests**; typecheck, ESLint,
`git diff --check`, and the full single-worker suite (**127 files / 528 tests**)
pass.

## Client incident response envelope continuation outcome (2026-07-13)

The live `/api/incidents` hook now passes a stable module-level transform into
`useFetch`. The transform validates source metadata, timestamp and raw/count
totals, optional cache/latency fields, distribution maps, and nested incident
rows before `adaptLiveToUI()` runs. Count/distribution totals must match the
normalized rows; mixed valid rows remain visible, all-invalid non-empty
payloads become retryable errors, and true empty responses remain explicit.
Synthetic sample incidents are now selected only when the response is null,
preventing a malformed refresh from fabricating fires after a valid empty or
retained response.

The focused client/hook gate passes **2 files / 42 tests**; the full suite
passes **127 test files / 550 tests** with a 1.5 GB heap cap. Full ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The
build retains the existing multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-13, history boundary and historical selection)

The history modal no longer fetches an oversized raw `limit=500` response. A
shared `useHistoryNew()` transform now validates persisted rows and envelope
counts before they enter the UI, retains valid rows from mixed responses,
preserves true empty results, and exposes malformed non-empty payloads as
retryable errors. `SectionError` keeps retained rows visible while making the
failure actionable.

Historical rows now have an explicit selection path: the modal and the mobile
recent-history list return the validated row to the page owner, which adapts it
to the existing `IncidentDetailPanel` model. The live priority list remains
connected only to live incident selection. Focused history contracts pass **4
files / 30 tests**; the full single-worker suite passes **128 files / 573 tests**
with the 1.5 GB heap cap; lint, typecheck, diff check, and the capped build are
green. The dashboard now has history before opening the modal, the modal reuses
the shared all-history request and exposes its trust state, and status filters
remain scoped. True empty history has dedicated copy, and historical detail no
longer presents a fabricated IPMA risk. The isolated Playwright
`tests/e2e/history-lifecycle.test.ts` passes empty, retryable-error, retry, and
historical selection flows against a local production server. No remaining
P1/P2 history implementation blocker is known.

## Dashboard-local Following filter continuation outcome (2026-07-13)

The mobile/tablet dashboard now exposes a localized `Following` activity tab.
It filters only the currently visible dashboard incident rows against the
browser-local followed-ID set, so stale IDs disappear naturally and global
map visibility, URL filter state, and selection ownership remain unchanged.
The tab publishes its current count and a dedicated PT/EN empty state when
there are no followed incidents in the visible set. A tablet browser gate
proves both a followed row and the cleared-storage empty state.

The focused unit/contract gate passes **4 files / 18 tests**; the focused
tablet Playwright gate passes; ESLint, TypeScript, and `git diff --check` pass.
No full suite or production build was started in this slice because an
unrelated Rota Playwright/build workload was already active. The later
Following read-state continuation added per-incident provider timestamps and
mark-seen-on-entry behavior without changing the followed-ID ownership.

## MapLibre style event-order browser outcome (2026-07-13)

`tests/e2e/map-style-lifecycle.test.ts` now runs against the real MapLibre
instance at 1280×800 with reduced motion. It switches dark→light and back to
dark, waits for the latest style to settle as `ready` or `recovered`, and
fails if the map remains retryable or unready. The temporary dev server was
stopped after the gate; no production build or deployment was performed.

## Following truthfulness and historical follow guard (2026-07-13)

The dashboard-local Following view now distinguishes an empty browser-local
follow set from followed incidents hidden by the active query filters. The
second state has separate PT/EN copy and an explicit clear-filters action;
selecting Following itself still does not mutate map or URL filter state.

Historical detail records are explicitly non-live (`isLive: false`) and no
longer expose the live follow badge, toggle, or local-alert persistence copy.
This prevents a historical ID from being saved successfully while never
appearing in the live-only Following view.

Focused unit/contract checks pass; the tablet/phone Following browser gate and
the history lifecycle browser gate pass against isolated local servers. Full
suite/build and deployment remain intentionally outside this bounded slice.

## Incident-news client boundary (2026-07-13)

`useMatchedIncidentNews()` now supplies a stable
`transformIncidentNewsResponse()` to `useFetch`. The new client normalizer
validates the incident ID, bounded article fields, HTTP(S) source URL,
published timestamp, category, matched fields, count invariants, and optional
`dataState` metadata before `IncidentDetailPanel` consumes `items`.
Malformed rows/envelopes fail closed; valid mixed rows remain usable when the
declared count matches. Focused client, hook-contract, and route tests pass,
along with ESLint, TypeScript, and `git diff --check`.

## Following read state (2026-07-13)

The browser-local Following flow now persists a separate per-incident read
timestamp keyed to the provider `lastUpdated` value. Following an incident
establishes its baseline; an older local baseline exposes an unread count on
tablet and phone; entering Following marks the currently visible followed rows
read and persists the new timestamps. Invalid entries fail closed, and the
feature does not add server, map-filter, or URL ownership.

The pure read-state tests, Following contracts, typecheck, lint, diff check,
and the tablet/phone Playwright gate pass. Full suite/build and deployment
remain separately gated.

## Bounded screenshot/accessibility review (2026-07-13)

Desktop and phone dark/light captures were inspected with reduced motion. The
map-first hierarchy and both theme token sets remained readable; visible
interactive elements exposed accessible names; the mobile report dialog
received focus and closed on Escape. The review found one concrete copy defect
in the compact map peek (`0 incidents · N visible` while the first value was
the active count). `mapPeekActiveLabel()` now uses `active/ativos` consistently
in compact and expanded summaries.

The focused map-peek unit test, ESLint, TypeScript, diff check, screenshot
recapture, and bounded report-dialog keyboard check pass. No broader browser
matrix or production check was started under current memory pressure.

## News client response boundary (2026-07-13)

The public `/api/news` hook now supplies a stable `transformNewsResponse()`
to `useFetch` before `NewsSection` reads arrays, counts, links, or timestamps.
The client boundary validates the required aggregate envelope, bounded article
fields, ISO timestamps, absolute HTTP(S) source URLs, safe relative incident
links, categories, producer severities, place arrays, duplicate IDs, and
`dataState` metadata. It preserves the route’s deliberate distinction between
the total RSS press pool (`counts.press`) and the filtered/truncated `press`
display array. Mixed valid rows remain usable when declared counts match;
all-invalid non-empty arrays and malformed envelopes become retryable failures.

The focused news route/client/hook gate passes **4 files / 21 tests**;
ESLint, TypeScript, and `git diff --check` pass. Full suite/build, provider
access, and deployment checks remain separately gated under current memory
pressure and authorization constraints.

## Weather client response boundary (2026-07-13)

`useWeatherNew()` now supplies a stable `transformWeatherResponse()` before
weather summaries and incident context consume the successful `/api/weather`
payload. The normalizer validates the IPMA envelope, provider timestamp
shape, count/row consistency, observation metrics, optional station
coordinates, freshness metadata, and the non-authoritative `cached` flag.
It preserves missing station coordinates, the explicit empty `timestamp: ""`
state, and valid rows from mixed payloads; malformed metadata and all-invalid
non-empty rows fail closed.

The focused weather/client/API/source-health gate passes **4 files / 48
tests**; ESLint, TypeScript, and `git diff --check` pass. Full suite/build,
provider access, and deployment checks remain separately gated.

## Fire-risk client response boundary (2026-07-13)

`useFireRiskNew()` now supplies a stable `transformFireRiskResponse()` before
the risk overlay and nearest-risk incident context consume `/api/fire-risk`.
The client boundary validates the IPMA envelope, bounded municipality keys,
Portugal coordinates, RCM values, count/distribution totals, risk labels,
freshness metadata, and the non-authoritative `cached` flag. It preserves
explicit empty data and valid rows from mixed payloads while rejecting
all-invalid, duplicate, or semantically inconsistent successful responses.

The focused fire-risk/client/API gate passes **5 files / 47 tests**;
ESLint, TypeScript, and `git diff --check` pass. Full suite/build, provider
access, and deployment checks remain separately gated.

## Dashboard client response boundary (2026-07-13)

`useDashboardNew()` now supplies a stable `transformDashboardResponse()` before
page metrics and priority reconciliation consume the aggregate. The client
boundary validates summary counters, status/type distributions, priority
rows, Portugal coordinates, persistence counters, timestamps, duplicate IDs,
and `dataState`. It preserves explicit empty/fallback aggregates and valid
priority rows from mixed payloads while failing closed on semantically invalid
successful JSON.

The focused dashboard/client/API gate passes **5 files / 49 tests**; ESLint,
TypeScript, and `git diff --check` pass. Full suite/build, provider access,
and deployment checks remain separately gated.

## Fire-stations client response boundary (2026-07-13)

`useFireStationsNew()` now supplies a stable `transformFireStationsResponse()`
before the lazy OSM layer reaches MapLibre. The boundary validates source,
freshness, station IDs/coordinates (including curated Madeira/Azores fallback
rows), count consistency, bounded metadata, duplicate IDs, and trust state.
It preserves explicit empty data and valid mixed rows without changing the
lazy toggle or source-health semantics.

The focused station/client/source-health gate passes **4 files / 25 tests**;
ESLint, TypeScript, and `git diff --check` pass. Full suite/build, provider
access, and deployment checks remain separately gated.

## Persistence-stats client response boundary (2026-07-13)

`usePersistenceStatsNew()` now supplies a stable
`transformPersistenceStatsResponse()` before dashboard persistence counters
reach page metrics. The normalizer validates bounded non-negative totals,
active/resolved relationships, snapshot counts, ISO freshness, and optional
`dataState` metadata. Explicit empty state remains cache-compatible; malformed
successful envelopes fail closed through `useFetch`.

The focused stats/client/API/hook gate passes **4 files / 34 tests**. Targeted
ESLint, TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain separately tracked.

## Notification trigger parity (2026-07-13)

The browser-local notification state now reaches the phone bottom navigation
and tablet toolbar as an exact unread badge. The drawer uses the shared PT/EN
catalog for title, unread count, empty state, and quiet-hours footer; its
mark-all action is disabled when no unread items exist. No provider, server
history, or desktop bell ownership changed.

Focused notification unit/contract tests pass (**3 files / 5 tests**).
The reduced-motion responsive browser run passes small-mobile, mobile, tablet,
and landscape-tablet scenarios, including the unread badge and mark-all
transition. Its desktop scenario remains incomplete because the existing
15-second `situation-incident` readiness wait timed out; this is recorded as a
data-readiness gate failure, not as a product pass.

## Full continuation verification (2026-07-13)

After the news, weather, fire-risk, dashboard, and fire-stations boundaries,
the capped single-worker full suite passes **136 files / 655 tests**. A stale
filter-ownership assertion was updated to cover the Following clear-filters
callback without reintroducing page-level reset aggregation. Repository-wide
ESLint, TypeScript, `git diff --check`, and the capped production build pass.
The build keeps the existing multiple-lockfile workspace-root warning; the
test setup keeps the known Prisma engine fallback. Deployment, provider
access, and production HTTPS/cache/restart checks remain open.

## Community-report submission boundary (2026-07-13)

The public report form now delegates its `/api/reports` POST acknowledgement
to `community-report-client.ts`. Successful responses require a bounded report
ID, the expected `pending_review` status, a bounded message, and valid trust
metadata; bounded non-OK responses remain failures and malformed bodies fail
closed. The modal now uses a `finally` path for submitting state and no longer
casts arbitrary JSON into a success shape.

Focused report-client/modal/action tests pass (**3 files / 9 tests**); targeted
ESLint, TypeScript, and `git diff --check` pass. Media upload/storage,
retention, moderation identity, and provider selection remain explicitly open.

## Continuation verification after notification/report slices (2026-07-13)

The capped single-worker suite passes **146 files / 702 tests**. Repository
ESLint, TypeScript, `git diff --check`, and the capped production build pass.
The six-viewport responsive browser matrix also passes after adding a scoped,
deterministic incident fixture and an explicit healthy-empty Situation marker.
The build retains the multiple-lockfile workspace warning and the test setup
retains the known Prisma engine fallback.

## Optional-source client boundaries (2026-07-13)

The weather-warnings, satellite, regional-commands, and source-health hooks now
normalize successful response envelopes before their map, page, and source
status consumers use them. The boundaries validate provenance, timestamps,
counts, geometry, Portugal bounds, duplicates, optional `dataState` metadata,
and explicit empty/fallback semantics. Malformed successful responses fail
closed while valid mixed rows remain usable. Focused client/API/hook gates,
repository lint, TypeScript, diff validation, the six-viewport responsive
matrix, and the full capped suite pass.

## Deterministic responsive readiness fixture (2026-07-13)

The responsive browser test now installs a test-only `/api/incidents` fixture
for its own context before navigation. It uses strict Portuguese coordinates,
matching envelope counts/distributions, and official trust metadata; all other
API routes continue through their normal behavior. The healthy empty Situation
branch exposes an explicit test ID, so desktop and wide-desktop assertions no
longer depend on live provider timing.

## Incident-timeline client boundary (2026-07-13)

The persisted `/api/incidents/:id/timeline` response now passes through
`transformIncidentTimelineResponse()` before the detail panel merges it with
inline live events. The boundary validates requested incident identity,
counts, ISO timestamps, status/severity enums, bounded resources/area,
duplicate IDs, and optional data-state metadata. Malformed successful bodies
fail into the existing localized retry state; empty and valid mixed rows remain
usable. The focused client/route/UI gate passes **3 files / 11 tests**, and the
mobile refresh/timeline browser recovery flow passes.

## Newsletter client boundary (2026-07-13)

The public newsletter form now submits through `newsletter-client.ts`, which
normalizes success status, bounded errors, and optional data-state metadata
before changing UI state. Malformed JSON fails closed, while the redacted
non-OK route envelope retains its safe error reason. The focused client gate
passes **4 tests**; targeted lint, TypeScript, and diff validation pass.

## Aerial data-state consistency (2026-07-13)

The active AerialLayer response normalizer now validates present `dataState`
metadata and rejects 200 responses whose state conflicts with the number of
renderable features. Missing metadata remains a compatibility path, and the
existing provider partial/empty/error and retry behavior is unchanged. The
focused aerial/API gate passes **4 files / 20 tests**.

## Latest continuation verification (2026-07-13)

The capped single-worker suite passes **148 files / 712 tests**. The latest
timeline browser flow passes; prior repository lint, TypeScript, diff, capped
build, and six-viewport responsive evidence remain green. Provider access,
deployment/restart/HTTPS verification, media storage, and production flag
enablement remain separately authorized gates.

## Standalone asset materialization (2026-07-13)

The production flatten helper now copies `.next/static` and `public/` beside
the nested standalone server, including an idempotent rerun path when the
stable server link already exists. The fresh standalone artifact passes the
public newsletter/status browser gate in all **4/4** 320/390px dark/light
scenarios; the earlier client-chunk 404/MIME failure is resolved at the
artifact layer.

## Current verification (2026-07-13)

Clean capped verification remains **148 files / 712 tests**, with repository
ESLint, TypeScript, `git diff --check`, and capped production build green.
The multiple-lockfile warning and Prisma fallback remain known environment
notes. Provider access, deployment/restart, production HTTPS/cache checks,
community attachment storage/moderation, and 3D provider/building/terrain
work remain open.

## Dead aerial hook cleanup (2026-07-13)

The unused raw `useAerialNew()` wrapper and `AerialClientResponse` alias were
removed from `src/lib/use-app-data.ts`. `AerialLayer` remains the sole runtime
consumer of `/api/aerial`, so no second polling or output-shape path was
introduced. The focused six-file aerial/data-hook gate passes **17 tests**;
TypeScript, targeted lint, and `git diff --check` pass.

## Read-only production verifier rerun (2026-07-13)

The live site still serves all hashed CSS/JS assets, `/sw.js`, `/api/health`
(`ok`), and seven source-health entries. It still fails the root `no-store`
expectation because the response carries `s-maxage=31536000`, and
`/manifest.json` remains HTTP 404 with an HTML content type. No deploy or
restart was performed; local standalone packaging and browser verification are
green, so the remaining failures are external deployment state.

## Service-worker documentation reconciliation (2026-07-13)

The current worker bypasses hashed Next chunks and network-owns APIs, so a
normal application build does not require a runtime cache-name bump. The
deployment checklist and handoff now say to bump `CACHE_NAME` only when the
worker's own precache/static-cache contract changes; historical incident notes
remain unchanged.

## Standalone packaging regression contract (2026-07-13)

The deployment contract suite now runs `deploy/flatten-standalone.js` against
an isolated nested standalone fixture. It proves the stable server symlink,
`.next/static`, and `public/` are materialized and that rerunning the helper is
idempotent. The focused deployment gate passes **14 tests**; TypeScript,
targeted ESLint, and `git diff --check` pass. The serialized full suite now
passes **148 files / 713 tests**. Deployment and restart remain
authorization-gated.

## Dead server-follow client cleanup (2026-07-13)

The unused `persistFollowChange()` wrapper and its raw JSON cast were removed
from `src/lib/public-actions.ts`. Browser-local `useFollowedIncidents` remains
the sole client follow owner; the intentionally fail-closed `/api/follow` route
was not changed. The focused action/route/hook gate passes **3 files / 16
tests**; TypeScript, targeted ESLint, and `git diff --check` pass. The
serialized full suite now passes **148 files / 712 tests**.

## Post-cleanup production build (2026-07-13)

The capped `bun run build` passes after removing the orphaned follow wrapper.
Next compiles, typechecks, prerenders all 21 static pages, and the flatten
helper recreates the stable server link while copying `.next/static` and
`public/`. The multiple-lockfile workspace warning remains known; no deploy or
restart was performed.

## Shared fetch and filter orchestration boundaries (2026-07-13)

`fetchJsonWithTimeout()` now returns `unknown` without a generic response
escape hatch; production callers explicitly normalize or narrow bodies. The
duplicated desktop/mobile `FiltersPanel` prop bags now use a typed local
`sharedFilters` adapter while retaining separate panel instances and the
desktop-only search ref. Two audited dead page bindings were removed. Focused
boundary/UI contracts pass; the full suite passes **148 files / 712 tests**;
repository ESLint, TypeScript, diff validation, capped build, and the
six-viewport responsive matrix pass.

## Shared incident-detail orchestration boundary (2026-07-13)

`IncidentDetailPanelProps` is now exported as the shared contract for the
selected incident panel. `page.tsx` builds one typed
`sharedIncidentDetailProps` adapter, including enrichment, follow state,
source-health context, and optional Incident Focus controls, then spreads it
into the independently owned mobile BottomSheet and desktop RightSidebar
instances. Only the layout-specific `isMobile` and `hideHeader` overrides
remain at each call site, preserving the existing responsive ownership and
panel keys. Focused contracts pass; the full suite passes **148 files / 713
tests**, repository ESLint, TypeScript, `git diff --check`, capped build, and
the six-viewport responsive matrix pass.

## Dead page-import cleanup (2026-07-13)

The page import surface was audited after the shell/component extractions.
Unused legacy dashboard leaves, old incident ranking/status helpers, overlay
wrappers, and unused type imports were removed without changing runtime
ownership or rendered behavior. The full suite passes **148 files / 713 tests**;
repository ESLint, TypeScript, `git diff --check`, and the capped production
build pass. The known multiple-lockfile warning and Prisma test fallback remain
environment notes.

## Right-sidebar dead prop cleanup (2026-07-13)

The unused `unreadCount` prop and default destructuring were removed from
`RightSidebarProps`. Notification badges remain owned by notification
surfaces, while the rail retains its active-filter and selected-incident
indicators. The focused desktop IA and overlay contracts pass; the full suite
passes **148 files / 714 tests**, repository lint, TypeScript, diff validation,
and the capped build pass. No deployment or restart was performed.

## Canonical current-state reconciliation (2026-07-13)

The checkpoint notes above are historical snapshots from the same refactor
sequence. The current canonical state is recorded in
`docs/superpowers/plans/2026-07-10-full-frontend-improvement.md`: the
serialized suite passes **148 files / 721 tests**, the authorized HTTPS release
verifier and fresh production browser checks pass, and the ingest timer/service
is healthy. Community attachments and 3D provider/building/terrain work remain
separate approval gates; this follow-on plan does not authorize upload or
provider implementation.

## Tile-cache evidence correction (2026-07-13)

`docs/TILES.md` now reflects the current R2 operation classes: 1 M free Class A
(writes) and 10 M free Class B (reads), rather than the reversed counts. The
viral-cost table now treats Worker requests, cache misses, origin reads/writes,
and storage as usage-dependent. The tile-cache worker remains a proposal; no
bucket, provider binding, or production tile proxy was enabled.

## Ongoing-plan continuation audit (2026-07-13)

The current checkout was audited against this follow-on plan and the canonical
full-frontend plan. No unchecked non-provider runtime task remains. The only
open work is the separately gated 3D provider/building/terrain path and the
community-attachment storage, moderation, privacy, retention, and provider
approval path.

The current local quality gate was rerun after the audit: lint, TypeScript,
serialized Vitest (**148 files / 721 tests**), production build, and
`git diff --check` all passed before the subsequent Phase 1 corrective slice.

The audit then identified and closed two provider-independent Phase 1 gaps:
compact/tablet Incident Focus now preserves the map surface and restores the
previous mobile tab, and invalid same-ID incident geometry exits/restores the
camera instead of leaving a pitched map without controls. The follow-up suite
now passes **148 files / 723 tests**; feature-enabled standalone browser proof
passes the phone/tablet non-map entry path. Provider and attachment gates are
unchanged.

## Provider-independent reliability continuation (2026-07-13)

The next bounded slice closed three additional implementation/verification
gaps without opening the provider or attachment gates: fixed-wing aircraft now
register their image before symbol rendering; biomass and composite-risk
layers insert below the canonical incident fill layer; and Incident Focus
collapses an already-expanded mobile map peek before taking map ownership.
The CI workflow also now runs the feature-enabled Incident Focus flow in both
normal-motion and reduced-motion modes while retaining the default-off smoke.
The current serialized suite passes **149 files / 725 tests**; responsive and
axe browser checks, focused contracts, lint, TypeScript, standalone build/E2E,
and diff validation pass.

## Incident Focus desktop chrome collision continuation (2026-07-13)

The feature-enabled desktop browser flow exposed a real collision between the
focus status and the map attribution card. `MapChrome` now accepts a bounded
`topOffset`, and only the desktop Incident Focus status uses a 48px offset;
mobile status and global map controls retain their existing positions. The
normal and reduced-motion feature-enabled standalone flows now pass, including
the explicit non-overlap assertion. The current serialized suite passes
**149 files / 726 tests**; lint, TypeScript, both default-off and
feature-enabled production builds, and diff validation pass. Provider,
attachment, terrain, and deployment gates remain unchanged.

## Incident Focus style-restoration continuity (2026-07-13)

The feature-enabled browser flow now exercises dark↔light style transitions
while Incident Focus is active and asserts that the status/exit controls stay
visible while the existing MapLibre style restoration runs. `useIncidentFocus`
now treats capability as an entry gate and preserves the active mode during
transient `mapReady=false` states. Normal and reduced-motion flows pass; the
current serialized suite contains **149 files / 727 tests**. No provider,
attachment, terrain, or deployment gate changed.

## Incident Focus edge-viewport proof (2026-07-13)

The feature-enabled Incident Focus browser gate now covers the remaining
1280×800 and 320×568 edge viewports. Compact layouts may intentionally hide
the global map-controls box, so the test asserts the focus status and checks
only controls/attribution that are actually rendered. Reduced-motion checks
wait for the asynchronous focus/tab restoration state. CI sets
`LUMES_3D_FIXTURE=1` so the proof is deterministic and does not depend on a
live ANEPC occurrence; default-off 2D smoke and provider/attachment gates are
unchanged. The serialized suite was rerun afterward: **149 files / 727 tests
passed**.

## Desktop marker-to-Inspector bug-spec reconciliation (2026-07-13)

`specs/bugs/BUG-2026-07-12-desktop-inspector-gate.md` now records the
stale-priority-ID fix as resolved rather than retaining an obsolete diagnostic
next action. The responsive marker reproduction and six-viewport gate remain
the verification source; no additional map-wrapper work is pending.

## Plan-state reconciliation (2026-07-13)

Several earlier continuation paragraphs in this document describe the state at
the time they were written, including deferred screenshot/browser proof,
shared-drawer verification, and authorized production verification. They are
historical checkpoints, not current blockers. The later continuation entries,
the canonical full-frontend plan, and `docs/HANDOFF.md` are authoritative for
the current state: the responsive/axe matrices, standalone and authorized
production release checks, and Incident Focus Phase 1 proof are green. The
only remaining open work is the separately gated 3D provider/building/terrain
path and the community-attachment provider, moderation, privacy, retention,
and deletion decisions.

## Read-only production freshness refresh (2026-07-13)

The live release verifier passes its HTTP/cache/assets/manifest/service-worker
checks, `/api/health`, and the nine-entry source-health envelope. The default-
off production browser smoke confirms the 2D map remains unchanged. The live
payload still exposes `ipma-warnings` as a core `stale`/empty source and
`nasa-firms-viirs` as an optional configuration error (`FIRMS_MAP_KEY` absent),
while the other core sources are healthy. This is recorded as an operational
freshness/configuration risk rather than hidden behind a generic green release
claim; no deployment or production mutation was performed.

## Production verifier refresh (2026-07-13, continuation)

The read-only verifier was rerun against `https://lumes.pt` after the gate
artifacts were added. Root HTML, immutable emitted assets, manifest, service
worker, `/api/health`, and all nine source-health entries passed. The payload
still reports healthy ANEPC/IPMA core sources, valid-empty IPMA warnings as
conservative `stale`, optional NASA FIRMS as configuration `error`, and
aerial/biomass as intentionally disabled. No deployment or production
mutation was performed.

## Source-health empty-state audit (2026-07-13)

The source-health contract was re-audited after the production refresh. The
server intentionally maps `dataState === "empty"`, zero-record probes, and
fallback/stale probes to `status: "stale"`; the weather empty case is covered
by the existing source-health tests. This is deliberately conservative and
should not be replaced by a generic `empty` status without a source-specific
policy: no active ANEPC incidents or no IPMA warnings can be valid, whereas
empty IPMA weather or fire-risk/regional data may represent provider failure.

This tranche therefore makes **no runtime change**. If the product later needs
distinct empty semantics, the next plan must define and test a per-source
matrix across server classification, trust types, client normalisation,
headline/status presentation, dashboard/filter warnings, and browser coverage.
The decision packet is now recorded in
[`docs/providers/source-health-empty-state-policy.md`](../../providers/source-health-empty-state-policy.md).
The current freshness risk is explicit in the handoff and is not treated as an
unchecked implementation blocker.

## Continuation baseline verification (2026-07-13)

After the source-health audit, the current worktree was rechecked with the
bounded serialized command:

```bash
NODE_OPTIONS=--max-old-space-size=1536 bunx vitest run \
  --no-file-parallelism --maxWorkers=1 --reporter=dot
```

The suite passes **149 files / 727 tests**. The remaining unchecked items in
the canonical 3D plan are all provider-gated Phase 2/3 work; no additional
provider-independent implementation was opened by this verification.

## Read-only production freshness refresh (2026-07-13, latest)

`bash deploy/verify-production.sh https://lumes.pt` passes the root/cache/
asset/manifest/service-worker checks, `/api/health`, and the nine-entry
source-health envelope. The live payload is unchanged: healthy ANEPC, IPMA
fire-risk/weather, regional-command, and OSM-station sources; valid-empty IPMA
warnings conservatively surfaced as `stale`; optional NASA FIRMS as a
configuration error because `FIRMS_MAP_KEY` is absent; aerial and biomass
disabled by design. No deployment or runtime mutation occurred.
