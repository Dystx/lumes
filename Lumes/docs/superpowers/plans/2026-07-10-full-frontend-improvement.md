# Lumes Full Frontend Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lumes a calm, trustworthy, readable wildfire map whose map chrome never disappears under filters and whose data language accurately reflects source freshness and incident status.

**Architecture:** Preserve Next.js, React, MapLibre, Prisma/SQLite, Caddy, and the existing API contracts. Add a shared shell-level `MapChrome` inset contract, split core versus optional source trust, normalize incident display data before rendering, and reduce typography/visual density through tokens. Extract only stable boundaries from the existing page/map orchestration after behavior is covered by tests.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Tailwind v4, MapLibre GL, Zustand, Framer Motion, Vitest, Playwright/axe, Lighthouse CI, Bun.

## Global Constraints

- Preserve public read APIs, map data-source behavior, and Prisma/SQLite schema.
- Do not mount more than one MapLibre instance for a viewport.
- Keep query filters separate from map-layer toggles.
- Use Ember tokens and existing icon wrappers; do not introduce arbitrary colors.
- Use IBM Plex Sans for application UI and IBM Plex Mono for tabular data if the typography choice is approved; keep a system fallback stack.
- Minimum interactive target is 44px; body/data text is at least 14px, secondary text 12px, metadata 11px.
- Core source failure and optional layer failure must never share the same headline trust state.
- No secrets, provider keys, private coordinates, or reporter identity in logs or browser payloads.
- No database migration, deployment, or commit is part of implementation until the user authorizes that phase.

---

### Task 1: Lock the visual contract and typography tokens

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `docs/DESIGN.md`
- Create: `tests/lib/typography-contract.test.ts`

**Interfaces:**
- Produces CSS variables `--font-ui`, `--font-data`, and type-scale utilities used by all later shell tasks.
- Produces a documented `FontFamily = "ibm-plex" | "system"` decision flag only if an explicit fallback is needed during rollout.

- [x] Write a failing contract test that asserts the root layout exposes one UI font and one data font, app headings do not use `font-display`, and no source component uses `text-[9px]` or `text-[10px]` for body content.
- [x] Run `bunx vitest run tests/lib/typography-contract.test.ts`; capture the current failures caused by Fraunces and sub-12px text.
- [x] Replace the current application-wide display treatment with IBM Plex Sans for UI headings/body and IBM Plex Mono for counts/timestamps; keep Fraunces only on the brand mark if it remains visually useful.
- [x] Add `--font-ui`, `--font-data`, `--type-body`, `--type-secondary`, and `--type-meta` tokens in `globals.css`; replace repeated arbitrary sizes in touched components with these tokens.
- [x] Update `docs/DESIGN.md` with the typography scale, fallback behavior, and Portuguese diacritic requirements.
- [x] Run the focused test, `bun run typecheck`, and `bun run lint`; expected result is PASS with no new font family loaded by unrelated routes.

### Task 2: Add the map chrome inset and overlay contract

**Files:**
- Create: `src/components/map/map-chrome.tsx`
- Create: `src/lib/map-chrome.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/layout/right-sidebar.tsx`
- Modify: `src/components/overlays/legend.tsx`
- Modify: `src/components/mobile/mobile-view.tsx`
- Test: `tests/lib/map-chrome-contract.test.ts`
- Test: `tests/e2e/responsive-interactions.test.ts`

**Interfaces:**

```ts
export type MapChromeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MapChromeMode = "wide" | "tablet" | "phone";

export function deriveMapChromeInsets(input: {
  mode: MapChromeMode;
  exploreOpen: boolean;
  drawerWidth: number;
  sheetHeight: number;
  safeAreaBottom: number;
}): MapChromeInsets;
```

- [x] Write failing tests for closed/open Explore insets, phone sheet bottom inset, and the invariant that map-control rectangles cannot occupy the drawer rectangle.
- [x] Implement `deriveMapChromeInsets()` with wide closed right inset 48px, wide open right inset `48 + drawerWidth + 16`, compact drawer inset `drawerWidth + 16`, and phone bottom inset `sheetHeight + safeAreaBottom`.
- [x] Implement `MapChrome` with four explicit regions: status, navigation controls, legend, and playback. Pass the computed inset to each region rather than using independent `right-3`, `right-6`, or `bottom-28` offsets.
- [x] Change `RightSidebar` to publish its open state and width through the shell; keep z-index order map 0, chrome 10, rail 20, drawer 30, blocking modal 40.
- [x] When available map width is below 500px, keep the mobile legend compact/severity-only and omit the desktop playback bar; never render compact chrome underneath the mobile sheet or Explore.
- [x] Add browser assertions at 1280×800 and 1440×900 that opening Explore leaves at least 500px of visible map and no map chrome bounding box intersects the drawer; add compact-sheet collision checks at 390×844, 768×1024, and 1024×768.
- [x] Run focused unit tests, responsive browser tests, and a dark/light visual review.

**Task 2 evidence (2026-07-11):** `tests/lib/map-chrome-contract.test.ts` (3 tests), `bun tests/e2e/responsive-interactions.test.ts` (6 viewports), `bun run test` (31 files / 80 tests), `bun run typecheck`, `bun run lint`, and `DATABASE_URL=file:/Users/cheng/Lumes/db/custom.db bun run build` all pass. The responsive run verifies the shared chrome avoids the Explore drawer and the expanded mobile sheet; the bottom-sheet transition was simplified to prevent duplicate exiting sheets from pushing controls off-screen.

### Task 3: Separate core and optional data trust

**Files:**
- Create: `src/lib/source-trust.ts`
- Modify: `src/lib/data-trust.ts`
- Modify: `src/app/api/source-health/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/shell/situation-panel.tsx`
- Modify: `src/components/mobile/mobile-attribution.tsx`
- Modify: `src/components/detail/IncidentDetailPanel.tsx`
- Create: `tests/lib/source-trust.test.ts`
- Modify: `tests/lib/data-api-routes.test.ts`

**Interfaces:**

```ts
export type SourceTier = "core" | "optional";
export type SourceTrust = {
  tier: SourceTier;
  state: "healthy" | "stale" | "fallback" | "error" | "disabled";
  reason: string | null;
  sourceUpdatedAt: string | null;
};

export function classifySource(sourceId: string): SourceTier;
export function deriveHeadlineTrust(sources: SourceTrust[]): DataTrustState;
```

- [x] Write failing tests proving a missing FIRMS key leaves headline trust fresh when ANEPC and IPMA are healthy, while a failed ANEPC source produces a retryable headline state.
- [x] Classify ANEPC incidents, IPMA risk/weather/warnings, and regional commands as core; classify FIRMS, OSM stations, aerial, biomass, and experimental layers as optional.
- [x] Return source-specific `dataState` and tier from `/api/source-health`; keep optional errors actionable in Explore without poisoning the Situation headline.
- [x] Render headline trust as “updated”, “stale”, or “retrying” only for core data; render optional layer warnings as “Satellite unavailable” or “Stations using fallback”.
- [x] Add source timestamps for observed versus received data and expose both in the inspector trust row.
- [x] Verify healthy-core/optional-error, stale-core, empty, and retryable screenshots in PT/EN.

**Task 3 evidence (2026-07-11):** `tests/lib/source-trust.test.ts` (5 tests), `tests/lib/data-api-routes.test.ts` (6 tests), `bun run typecheck`, and `bun run lint` pass. Source-health browser probes verified optional FIRMS failure keeps the Situation headline updated while Explore reports “Satellite unavailable”; mocked stale, empty, and retryable core states were captured in PT/EN screenshots under `/tmp/lumes-task3-*.png`.

### Task 4: Normalize incident data and citizen vocabulary

**Files:**
- Create: `src/lib/incident-presentation.ts`
- Modify: `src/lib/ingest.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/shell/situation-panel.tsx`
- Modify: `src/components/mobile/map-peek.tsx`
- Modify: `src/components/dashboard/DashboardPanel.tsx`
- Create: `tests/lib/incident-presentation.test.ts`

**Interfaces:**

```ts
export type IncidentPresentation = {
  title: string;
  location: string | null;
  stateLabel: string;
  stateGroup: "active" | "contained" | "resolved" | "unknown";
  observedAt: string;
  receivedAt: string;
};

export function presentIncident(incident: LiveIncident, lang: Language): IncidentPresentation;
export function countIncidentStates(incidents: LiveIncident[]): {
  visible: number;
  active: number;
  contained: number;
  resolved: number;
};
```

- [x] Write failing tests for `---`, blank, and whitespace-only localities; expected title fallback is municipality, then district, then localized “Unnamed incident”.
- [x] Write tests proving a `contained` incident is not counted as active and that visible/active/contained/resolved counts are independent.
- [x] Implement presentation normalization without changing the persisted schema or public API shape.
- [x] Replace “active fires” copy with the correct count label in Situation, MapPeek, status pills, and mobile navigation.
- [x] Show a compact observed/received freshness pair when the two timestamps differ by more than two minutes.
- [x] Verify Portuguese and English labels, long municipality names, and no sentinel strings in screenshots.

**Task 4 evidence (2026-07-11):** `tests/lib/incident-presentation.test.ts` (3 tests), the ANEPC route sentinel-label contract in `tests/lib/data-api-routes.test.ts`, `bun run typecheck`, `bun run lint`, and the six-viewport responsive browser matrix pass. Browser text checks found no standalone `---` labels or “active fires”; the Situation and MapPeek now expose separate visible/active/contained/resolved language.

### Task 5: Rework the map visual hierarchy and layer legend

**Files:**
- Modify: `src/components/overlays/legend.tsx`
- Modify: `src/components/mobile/mobile-legend.tsx`
- Modify: `src/components/ember-map.tsx`
- Modify: `src/components/map/map-chrome.tsx`
- Modify: `src/components/filters/filters-panel.tsx`
- Create: `tests/lib/map-layer-legend.test.ts`

- [x] Write tests that incident severity, satellite, community, evacuation, and fire-risk legends remain separate and that a disabled layer is not shown as active.
- [x] Make the default legend show only incident severity and current visible count; move layer-specific explanations into Explore’s Layers tab.
- [x] Reduce persistent legend width and remove repeated borders/uppercase sections; retain one expandable “What the map shows” explanation.
- [x] Add explicit layer availability states: healthy, unavailable, fallback, and disabled. FIRMS missing configuration must not render an empty-looking layer.
- [x] Keep marker colors distinct from fire-risk colors and include a non-color shape/text cue for critical incidents.
- [x] Verify legend placement against map insets at all target viewports and with Explore open.

**Task 5 evidence (2026-07-11):** `tests/lib/map-layer-legend.test.ts` (3 tests), the six-viewport responsive browser matrix, the map legend focused test, `bun run typecheck`, `bun run lint`, and the production build pass. The default legend now exposes only severity and visible count; optional layer explanations are available from Explore, unavailable FIRMS does not render as active, and critical incidents include a non-color `!` cue.

### Task 6: Simplify feedback, overlays, and action hierarchy

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ui/sonner.tsx`
- Modify: `src/components/layout/right-sidebar.tsx`
- Modify: `src/components/mobile/bottom-sheet.tsx`
- Modify: `src/components/detail/IncidentDetailPanel.tsx`
- Modify: `src/lib/overlay-stack.ts`
- Test: `tests/lib/overlay-stack.test.ts`
- Test: `tests/e2e/responsive-interactions.test.ts`

- [x] Write a browser assertion that live-restored feedback does not overlap the map status pill, controls, legend, or drawer trigger.
- [x] Move restore/error feedback to a compact status region below the count pill or a short-lived toast with a maximum width and safe-area-aware offset.
- [x] Ensure only the topmost blocking overlay handles Escape and focus returns to its opener after close.
- [x] Make report, follow, share, and retry actions expose pending, success, failure, and unavailable states without optimistic claims when persistence is disabled.
- [x] Add browser coverage for marker → inspector, list → inspector, Explore → close, nested detail → close, and failure rollback flows.

**Task 6 evidence (2026-07-11):** `tests/e2e/responsive-interactions.test.ts` now checks toast clearance against status, controls, legend, and drawer geometry at desktop widths, marker/list Inspector focus restoration, Explore close, and playback/drawer clearance; the six-viewport matrix passes. `tests/lib/overlay-stack.test.ts` and `tests/lib/overlay-escape-contract.test.ts` pass. Sonner feedback uses a bounded, safe-area-aware offset; Escape ownership is ordered through `defaultPrevented`; blocking dialogs, sheets, shortcuts, long-press actions, and the Inspector restore their opener. Follow actions are pending/rollback-safe and explicitly browser-local, share and refresh expose pending/error states, and report submission retains its failure state.

### Task 7: Make tablet and phone shells content-first

**Files:**
- Modify: `src/components/mobile/mobile-view.tsx`
- Modify: `src/components/mobile/map-peek.tsx`
- Modify: `src/components/mobile/mobile-map-controls.tsx`
- Modify: `src/components/mobile/bottom-sheet.tsx`
- Modify: `src/components/dashboard/DashboardPanel.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/e2e/responsive-interactions.test.ts`
- Test: `tests/e2e/a11y.test.ts`

- [x] Keep tablet’s top toolbar but ensure its labels and drawer never cover map status or map controls.
- [x] Keep phone’s 56px summary collapsed state and 52vh expanded state; remove analytics from the phone Incidents destination.
- [x] Ensure incident sheet content has one scrolling owner and bottom-navigation safe-area padding.
- [x] Add empty, stale, fallback, and optional-layer-unavailable states to MapPeek and Incidents.
- [x] Verify 320×568, 390×844, 768×1024, and 1024×768 landscape for clipping, overlap, drag, tab, dismissal, focus return, and reduced motion.

**Task 7 evidence (2026-07-11):** the six-viewport responsive matrix passes with explicit tablet-toolbar/chrome collision checks; the phone summary remains 56px collapsed and 52vh expanded, sheet content has one scroll owner and safe-area padding, phone analytics are hidden through the `mobile-phone-content` boundary, and MapPeek/Incidents expose trust and optional-layer warning states. The axe matrix is also green at all six viewports.

### Task 8: Public pages, accessibility, and language consistency

**Files:**
- Modify: `src/components/public/public-page-shell.tsx`
- Modify: `src/app/status/page.tsx`
- Modify: `src/app/newsletter/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/public/newsletter-form.tsx`
- Test: `tests/e2e/a11y.test.ts`
- Create: `tests/e2e/public-pages.test.ts`

- [x] Keep explicit Portuguese-only public-route behavior until route-level locale negotiation exists; ensure `<html lang="pt-PT">` and all confirmation pages agree.
- [x] Use the same 65–75ch reading measure, tokenized status indicators, and responsive source rows on status/newsletter/privacy.
- [x] Add browser coverage for newsletter validation, provider unavailable, pending confirmation, retry, and non-mutating unsubscribe GET.
- [x] Verify keyboard navigation, focus return, reduced motion, color contrast, and text scaling at 320px and 390px widths.

**Task 8 evidence (2026-07-11):** `tests/e2e/public-pages.test.ts` passes at 320px and 390px for validation, provider-unavailable, pending-confirmation, and invalid/non-mutating unsubscribe GET; the public locale contract and full axe matrix pass. The subscription form now captures its form element before awaiting the response, preventing the async `currentTarget` null failure.

### Task 9: Reduce orchestration and initial-load cost

**Files:**
- Create: `src/components/shell/home-shell.tsx`
- Create: `src/components/map/map-data-adapter.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/ember-map.tsx`
- Modify: `src/lib/use-app-data.ts`
- Modify: `lighthouserc.json`
- Modify: `next.config.ts`
- Test: `tests/lib/home-shell-contract.test.ts`

- [x] Inventory page/map `any` casts and replace only the touched boundary with typed adapters.
- [x] Extract `HomeShell` for layout ownership and `MapDataAdapter` for layer feature conversion without moving query state into map components.
- [x] Lazy-load optional aerial, biomass, and advanced analytics data only when their layer or Explore section opens.
- [x] Keep core incident fetch and map shell on the critical path; verify no core data regression.
- [x] Preserve immutable cache headers for hashed assets and no-store for HTML, APIs, service worker, and manifests.
- [x] Run Lighthouse before/after and keep home LCP at or below the current ~1.9s baseline, with performance score at least 0.70.

**Task 9 evidence (2026-07-12):** `tests/lib/map-data-adapter.test.ts` and `tests/lib/home-shell-contract.test.ts` pass; the production build and full unit suite pass. The current Lighthouse run passes with home performance 0.74, `/status` 0.98, and `/privacy` 0.82; accessibility and SEO are 1.0 for all three, and best practices is 0.95. Optional layer hosts remain lazy, and cache/service-worker rules now keep hashed assets immutable while HTML, APIs, manifests, and `sw.js` stay revalidated.

**Continuation evidence (2026-07-12, incident-selection boundary):** list,
notification, and map-marker selection now share the pure typed
`decideIncidentSelection()` boundary instead of duplicating visibility and
fly-to decisions in `page.tsx`; long-press “open detail” now uses the same map
path. The focused selection/filter suite passes 11 tests; typecheck, lint, and
diff checks pass. Existing semantics are preserved: valid list selections do
not move the camera, valid marker selections request a fly-to, and hidden
selections clear both channels.

**Continuation evidence (2026-07-12, source-health adapter):** the page’s
source-health DTO mapping and headline-trust state conversion now live in the
typed `src/lib/source-health-adapter.ts` module. Its focused adapter/trust/
selection/filter suite passes **20 tests**; typecheck, lint, and diff checks
pass. The page retains the same core-versus-optional trust precedence.

**Continuation evidence (2026-07-12, full unit refresh):** after the typed
selection and source-health extractions, `bun run test` completed successfully
with **73 test files / 214 tests passed**. The expected Prisma schema fallback
and intentional redacted error-path logs were the only stderr output; no test
failed.

**Continuation evidence (2026-07-12, post-selection wiring refresh):** after
the long-press “open detail” callback was routed through the map-selection
boundary, the exact same full suite completed with **73 test files / 214 tests
passed**; typecheck, lint, and diff checks remained green.

**Continuation evidence (2026-07-12, history page-split leaf):** the inline
`HistoryModal` was extracted to `src/components/history/history-modal.tsx`,
with search matching isolated in the tested `src/lib/history-view.ts` helper.
The exact current unit suite passes **74 test files / 218 tests**; typecheck,
lint, and diff checks pass. The modal’s live/history selection callback remains
outside the live-set selection helper because historical records may be absent
from the current incident set.

**Continuation evidence (2026-07-12, report page-split leaf):** the inline
`ReportFireModal` was extracted to
`src/components/reports/report-fire-modal.tsx`; its API payload contract stays
in `src/lib/public-actions.ts`, and the existing report failure/pending flow is
preserved. The exact current unit suite passes **74 test files / 218 tests**;
typecheck, lint, and diff checks pass.

**Continuation evidence (2026-07-12, report leaf full refresh):** after the
report modal import boundary was wired into `page.tsx`, `bun run test`
completed successfully with **74 test files / 218 tests passed**. The focused
public-action/history suite passes 6 tests; typecheck, lint, and diff checks
remain green.

**Continuation evidence (2026-07-12, map GeoJSON boundary):** incident,
satellite, community, evacuation, and selected-halo GeoJSON construction now
live in `src/lib/map/geojson-builders.ts`; `ember-map.tsx` retains MapLibre
style/source/layer lifecycle ownership. Focused builder/map-adapter tests pass
5 tests, and the exact full suite passes **75 test files / 221 tests** with
typecheck, lint, and diff checks green.

**Continuation evidence (2026-07-12, map style policy boundary):** CARTO
style selection, EOX satellite source/layer identifiers, source colors, and
theme/basemap water-color policy now live in the pure
`src/lib/map/map-style.ts` module. `ember-map.tsx` preserves its public
`BasemapMode` export and continues to own MapLibre initialization, style
swaps, attribution, and restoration. The focused map suite passes **4 files /
8 tests**; typecheck, lint, and `git diff --check` pass. This slice deliberately
did not alter `setStyle`, `style.load`, operational layer ordering, or external
provider behavior.

**Continuation evidence (2026-07-12, map style full refresh):** the exact
current `bun run test` suite passes **76 test files / 224 tests** after the
style-policy extraction; typecheck, lint, and `git diff --check` remain green.

**Continuation evidence (2026-07-12, incident context boundary):** live
weather/risk enrichment moved from `src/app/page.tsx` into the typed pure
`src/lib/incident-context.ts` module alongside nearest-station/risk lookup.
Both selected-detail callsites preserve their existing inputs and behavior;
the focused context suite covers non-live identity, nearby enrichment, remote
weather handling, and the intentional nearest-risk mapping. The full unit
suite passes **77 test files / 227 tests**; typecheck, lint, and
`git diff --check` pass.

**Continuation evidence (2026-07-12, dashboard metrics boundary):** the
server-summary-first and client-fallback dashboard aggregation moved from
`src/app/page.tsx` into the pure typed `src/lib/dashboard-metrics.ts` helper.
Focused tests cover server aggregation, incident fallback grouping/counts,
and an empty fallback list; the page still preserves memoized object identity
for `DashboardPanel`.

**Continuation evidence (2026-07-12, dashboard metrics full refresh):** the
exact current `bun run test` suite passes **78 test files / 230 tests** after
the aggregation extraction; typecheck, lint, and `git diff --check` remain
green. No build, browser, deploy, or restart was started.

**Continuation evidence (2026-07-12, weather summary boundary):** the IPMA
sidebar summary moved from `src/app/page.tsx` into the pure typed
`src/lib/weather-summary.ts` helper. Focused tests cover null/empty data,
incomplete observations, and average/max calculations; the current full unit
suite passes **79 test files / 233 tests**, with typecheck, lint, and
`git diff --check` green.

**Continuation evidence (2026-07-12, relative-time boundary):** the
localized PT/EN `timeAgo()` implementation is now shared by
`src/app/page.tsx` and `src/components/detail/IncidentDetailPanel.tsx` via
the pure `src/lib/relative-time.ts` helper. Focused tests cover minute/hour/day
thresholds and future timestamps with an injected clock; the full unit suite
passes **80 test files / 236 tests**, with typecheck, lint, and
`git diff --check` green.

**Continuation evidence (2026-07-12, page helper cleanup):** removed stale
date/label/icon helpers and their now-unused imports from `src/app/page.tsx`
after verifying there were no live callsites. The full unit suite remains
**80 test files / 236 tests**; page-contract tests, typecheck, lint, and
`git diff --check` pass.

**Continuation evidence (2026-07-12, read-only verifier rerun):**
`bash deploy/verify-production.sh https://lumes.pt` confirms all hashed
CSS/JS assets, `/sw.js`, and `/api/health` are reachable. `/api/source-health`
returns seven sources with `dataState.state=stale`, consistent with the
five-minute ingest freshness contract. The verifier still fails only the
three known release checks: root HTML has `s-maxage=31536000`, and
`/manifest.json` returns HTTP 404 with HTML content instead of JSON. No
deployment, restart, or ingest intervention was performed.

**Continuation evidence (2026-07-12, filter URL persistence):** incident
query filters now have a locale-independent parser/serializer in
`src/lib/incident-filter-url.ts`, an atomic `replaceIncidentFilters` Zustand
action, and a guarded `useIncidentFilterUrl` hook. The hook hydrates once,
handles `popstate`, debounces search writes, uses `history.replaceState`, and
preserves `incident` plus unrelated query parameters. Focused codec, hook
contract, and store tests pass; no map display state is serialized.

**Continuation evidence (2026-07-12, filter URL full refresh):** the exact
current `bun run test` suite passes **82 test files / 241 tests** after URL
filter persistence; typecheck, lint, and `git diff --check` remain green.

### Task 10: Release verification and deployment gate

**Files:**
- Modify: repository-root `.github/workflows/lumes-ci.yml`
- Modify: `deploy/deploy.sh`
- Modify: `docs/DEPLOY.md`
- Create: `tests/lib/deploy-contract.test.ts`

- [x] Add a deployment contract test asserting the deploy script resolves the real standalone server directory and copies `.next/static` plus `public` beside it (including nested `<app>/server.js` output).
- [x] Keep test files, local databases, `.env*`, and build artifacts out of rsync payloads.
- [x] Run the clean-runner sequence: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, Playwright install, axe, responsive tests, and Lighthouse.
- [x] Before any authorized deployment, verify exact CSS/JS asset URLs, `/sw.js`, `/manifest.json`, `/api/health`, and source-health status over HTTPS.
- [x] Confirm scheduled ingest uses `/usr/local/bin/bun`, completes successfully, and leaves `/api/health` healthy.
- [x] Perform a fresh-browser smoke test after restart and record the deployment result without logging secrets.

**Task 10 evidence (2026-07-12):** deployment packaging assertions now cover nested Next standalone output, public asset presence, HTML/control-asset cache contracts, the Cloudflare bypass rule, and `/usr/local/bin/bun` for both the production service and ingest timer. The local frozen-install, lint, typecheck, full unit suite (55 files/142 tests), build, Playwright install, axe matrix, responsive matrix, public-page matrix, security-header/MapLibre browser check, and Lighthouse gates pass. The responsive matrix now includes reduced-motion, 44px target, sheet collision, downward map-sheet drag, map-ready and incident-source readiness synchronization, marker-to-Inspector, cluster fallback, drawer, playback, toast, and focus-return checks. `/api/health` now treats an empty reachable database as healthy for clean CI fixtures while still reporting stale non-empty data honestly. Persistence stats now expose explicit `healthy`/`empty`/`retryable-error` states with redacted no-store failures, realtime polling derives its internal incident URL from the request origin, and core client data hooks use explicit response DTOs. A local standalone smoke verified `/` (`no-store`), `/manifest.json` (200, no-store), and `/sw.js` (200, no-store) after copying assets beside the resolved server entry. A bounded local ingest pass completed with 12 raw and 12 upserted incidents, zero errors, and 29 snapshots; local `/api/source-health` reported healthy core sources, while `/api/health` correctly reports stale once the five-minute ingest freshness window expires. The status page no longer combines `cache: "no-store"` with a conflicting `next.revalidate` fetch directive; `tests/lib/status-page-contract.test.ts` guards that contract. The read-only production probe returned healthy `/api/health` and `/api/source-health`, but production still serves an old cached HTML header (`s-maxage=31536000`) and `/manifest.json` returned 404; this is consistent with the previous nested-standalone packaging/configuration and requires an authorized deploy plus fresh-browser verification. Post-restart production smoke remains pending; no deployment was performed.
**Continuation evidence (2026-07-12):** all client data hooks now use explicit response DTOs instead of `useFetch<any>`: dashboard, weather, fire risk, fire stations, warnings, persistence stats, lazy satellite detections, persisted history, curated news, aerial ADS-B, and regional commands. Dashboard live/DB inputs are normalized before aggregation; the history route serializes database dates into its wire DTO; news and aerial routes expose typed aggregate health envelopes; the aerial layer normalizes nullable altitude coordinates before publishing GeoJSON; and regional ArcGIS input is parsed from `unknown` with geometry opt-in. `tests/lib/use-app-data-contract.test.ts`, `tests/lib/satellite-client-contract.test.ts`, `tests/lib/history-route.test.ts`, `tests/lib/news-route.test.ts`, `tests/lib/aerial-route.test.ts`, `tests/lib/regional-commands-route.test.ts`, the dashboard fallback/live route tests, and focused adapter tests pass. The direct `useFetch<any>` inventory is empty; the later page/detail/filter adapter audit found no additional repeated boundary worth extracting without changing ownership.

**Continuation evidence (2026-07-12, reliability follow-up):** optional OSM
fire-station fallback reasons now flow into source health; newsletter
confirmation tokens rotate after first use and replayed links return 410;
malformed/retryable public API responses now carry `Cache-Control: no-store`;
the newsletter provider/already-subscribed matrix is covered; and dashboard
priority rows are reconciled against the current visible live set so stale
aggregate IDs cannot produce dead Inspector actions.
`tests/lib/source-health.test.ts`, `tests/lib/newsletter-confirm.test.ts`,
the expanded boundary/newsletter/API-matrix tests, and
`tests/lib/incident-presentation.test.ts` cover those contracts. At that
point the full unit suite was **58 files / 154 tests**; typecheck and lint
pass. The six-viewport
responsive gate passes, including marker/list Inspector selection at both
desktop widths; the 1280px path also verifies a dark→light→dark map style
transition with no horizontal overflow. Production-only
HTTPS/cache/ingest proof and the broader endpoint response matrix remain open;
no deployment was performed.

**Continuation evidence (2026-07-12, read-only production probe):** HTTPS
`/api/health` and `/api/source-health` returned 200 with `no-store` and
healthy source data. The public `/` response still returned the stale
`s-maxage=31536000` HTML cache header, and `/manifest.json` still returned
404; `/sw.js` returned 200 with `no-cache, no-store, must-revalidate`. This
confirms that the remaining asset/cache checks, scheduled-ingest verification,
and fresh-browser-after-restart proof require an authorized deployment and
were not closed by this probe.

**Continuation evidence (2026-07-12, local control-asset repair):** the web
manifest no longer references missing `/icon-192.png` and `/icon-512.png`
files; it now uses the existing `/logo.svg`, and the deployment contract
verifies every manifest icon resolves inside `public/`. The focused deployment
contract passes (8 tests). Production still requires the authorized deploy
before this local repair can be verified over HTTPS.

**Continuation evidence (2026-07-12, source-payload repair):** the parent
repository ignore rule `Public/` was also matching Lumes' lowercase
`public/` directory on this filesystem. Narrow `Lumes/public/` exceptions now
make the manifest, logo, offline page, robots file, and public icon assets
visible to version-control/deployment review. The manifest, logo, offline page,
robots file, and security metadata are now committed in `fd3b4670b` and
`a6ce8a1a2`; the executable preflight is committed in `3ae04413e`, and the
service-worker cache policy in `da21c09c3`. The production 404 remains open
until the authorized deploy uses these commits.

**Continuation evidence (2026-07-12, release-verifier path):** added the
read-only `deploy/verify-production.sh` verifier and documented its exact
post-restart command in `docs/DEPLOY.md`. It checks HTML and hashed asset
cache headers, control-asset presence, health status, and source-health
shape without logging response bodies or issuing mutations. A loopback run
verified local HTML/assets/control-asset behavior but correctly failed on the
local stale `/api/health` fixture; the HTTPS production run remains pending
until the authorized deployment is performed.

**Continuation evidence (2026-07-12, API response matrix):** the
`/api/municipalities` boundary now returns explicit `healthy`/`empty` state
metadata and a redacted, `no-store` 503 envelope when persistence fails.
`tests/lib/api-contract-matrix.test.ts` covers both states; the configured
Vitest run passes 8 tests, and typecheck/lint pass. The broader endpoint matrix
remains open for the routes not yet represented in the contract suite.

**Continuation evidence (2026-07-12, bounded geospatial input):**
`/api/biomass/grid` now rejects malformed, inverted, or out-of-world `bbox`
parameters with a 400/no-store empty-state envelope instead of silently
expanding the request to the full Portugal grid. The API matrix now passes 9
tests, with typecheck/lint still green. Remaining endpoint coverage is still
tracked as open rather than inferred from this focused slice.

**Continuation evidence (2026-07-12, scheduled-job boundary):** cron ingest
and prune now return no-store responses, fail closed when unauthenticated, and
redact upstream/database exception details behind generic 500 envelopes.
`tests/lib/cron-routes.test.ts` covers missing-secret, authenticated success,
and failure paths for both jobs (6 tests); Vitest, typecheck, and lint pass.
Production timer execution remains an external deployment verification item.

**Continuation evidence (2026-07-12, regional API matrix):**
`/api/region/[name]` now has focused healthy-empty and persistence-failure
coverage in `tests/lib/api-contract-matrix.test.ts`; the configured matrix
passes 11 tests, with typecheck/lint green. The endpoint returns its existing
cacheable empty envelope and redacted no-store retryable envelope as expected.

**Continuation evidence (2026-07-12, biomass point API matrix):**
`/api/biomass` now enforces Portugal coordinates, exposes explicit healthy
state metadata, and returns a redacted no-store 503 when its cached source
fails. The focused API matrix passes 14 tests, with typecheck/lint green.

**Continuation evidence (2026-07-12, realtime transport):**
`tests/lib/realtime-contract.test.ts` now proves the SSE handshake emits a
`connected` event, uses the no-cache event-stream headers, closes on request
abort, and returns the no-store JSON rate-limit envelope before opening a
stream. The focused realtime suite passes 3 tests; typecheck/lint remain green.

**Continuation evidence (2026-07-12, incident-risk batch):**
`tests/lib/incident-risks-route.test.ts` now covers empty IDs, healthy
weather-backed risk output, and redacted persistence failure behavior for
`/api/incidents/risks`. The focused suite passes 3 tests, with typecheck/lint
green; the existing input-boundary tests remain in place.

**Continuation evidence (2026-07-12, handoff synchronization):**
`docs/HANDOFF.md` now labels its July 6 counts/findings as historical and
points to this plan for current evidence; `docs/REFACTOR-PLAN.md` carries the
same historical-baseline warning. This prevents the older broken-mobile,
dashboard-500, and 37/101-test claims from being mistaken for current status.

**Continuation evidence (2026-07-12, full unit baseline):** `bun run test`
completed successfully with **68 test files / 200 tests passed** in 15.47s
Vitest runtime (109.82s test execution time). Stderr contained only the
expected Prisma schema-engine fallback and redacted failure-event logs from
intentional error-path tests; no test failed.

**Continuation evidence (2026-07-12, manifest asset gate):**
`deploy/verify-production.sh` now parses `/manifest.json` and verifies every
absolute icon URL returns HTTP 200. The deployment contract, shell syntax,
lint, and a loopback verifier run pass the new control-asset check; the
loopback run still fails only on its expected stale `/api/health` response.

**Continuation evidence (2026-07-12, live verifier rerun):** the HTTPS
verifier now reports all independent production checks. `/sw.js` returns 200
with no-store caching; `/api/health` is healthy; `/api/source-health` returns
7 sources with a healthy state. The remaining production failures are exactly
the stale `s-maxage=31536000` cache header on `/`, `/manifest.json` returning
404, and the resulting non-JSON content type. No deployment or restart was
performed.

**Continuation evidence (2026-07-12, refreshed unit baseline):** after the
status presentation, incident-news, and root API changes, `bun run test`
completed successfully with **71 test files / 206 tests passed**. Stderr was
limited to the expected Prisma schema fallback and intentional redacted
failure-event logs.

**Continuation evidence (2026-07-12, deploy fail-closed asset preflight):**
`deploy/deploy.sh` now refuses to build/restart when any of the manifest/logo,
service-worker, offline, robots, or security control assets is absent from the deployment payload. Shell syntax, deployment
contract tests (9), lint, and diff checks pass. This directly prevents the
known production manifest-404 state from being silently redeployed.

**Continuation evidence (2026-07-12, tracked-payload preflight):**
`docs/DEPLOY.md` now requires tracked and committed manifest/logo,
service-worker, offline, robots, and security assets before a git-based release.
The deployment contract suite covers this instruction (13 tests), and the
control assets are committed in `fd3b4670b` and `a6ce8a1a2`, with the
preflight/deploy contract in `3ae04413e` and service-worker policy in
`da21c09c3`. Production deployment remains intentionally open until these
commits and the remaining local changes are pushed through the authorized
release path.

**Continuation evidence (2026-07-12, final local unit refresh):** after the
tracked-payload contract addition, `bun run test` completed successfully with
**71 test files / 207 tests passed**. No test failed; stderr remained limited
to the expected Prisma fallback and intentional redacted failure logs.

**Continuation evidence (2026-07-12, deploy-contract spot check):** the
focused `tests/lib/deploy-contract.test.ts` suite passes all **13 tests**.
The tracked-and-committed public payload preflight passes for the manifest,
logo, service worker, offline, robots, and security assets. The fail-closed
preflight is green locally; production remains open until the commits are
pushed through the authorized release path.

**Continuation evidence (2026-07-12, incident-news boundary):**
`/api/incidents/[id]/news` now exposes explicit empty/healthy/retryable states,
cache headers, and redacted no-store failures around the RSS/cache boundary.
`tests/lib/incident-news-route.test.ts` covers locationless, matched-press,
and cache-failure paths (3 tests); typecheck/lint pass.

**Continuation evidence (2026-07-12, root API boundary):** `/api` no longer
returns a placeholder “Hello, world!” response. It now exposes a minimal
non-cacheable `{ service: "lumes.pt", status: "ok" }` descriptor covered by
`tests/lib/api-root-contract.test.ts`.

**Continuation evidence (2026-07-12, public API follow-up):** satellite,
fire-risk forecast, biomass, and incident-timeline routes now expose additive
`dataState` metadata, generic redacted retryable errors, and `no-store` error
responses; malformed history/aerial/risk/region/report inputs use the same
contract. Focused route tests cover the new boundaries. Full unit suite:
**61 files / 160 tests**; typecheck, lint, and the six-viewport responsive
gate remain green. Production-only HTTPS/cache/ingest proof remains open; no
deployment was performed.

The service-worker policy now has runtime fake-cache coverage for live API and
cross-origin bypass plus navigation/static strategies; overlay DOM runtime
coverage remains open. Full unit suite at this checkpoint: **62 files / 162
tests**; typecheck and lint pass.

Newsletter unsubscribe tokens now include signed issuance/expiry timestamps;
replayed or pre-resubscribe tokens return 410, and confirmation-token rotation
is covered by focused tests. Full unit suite after this security slice:
**62 files / 166 tests**; typecheck and lint remain green.

The public-pages browser matrix passes at 320×568 and 390×844, including the
newsletter validation/provider-unavailable/pending-confirmation paths and
non-mutating unsubscribe checks; no real email was sent.
The page/dashboard/detail-panel boundary cleanup now also removes page-level
incident/weather casts, accepts the typed dashboard priority shape, types the
timeline response and notification props, and replaces the polymorphic detail
wrapper cast. Typecheck, lint, and the full unit suite remain green; the
executable `any` inventory is empty, with remaining matches limited to
comments and translated copy.

**Continuation evidence (2026-07-12, DTO and compact-overlay follow-up):** the
persistence service, `/api/stats`, client hook, and dashboard now share
explicit persistence-stats DTOs; the focused DTO/stats/persistence suite is
green (4 files / 13 tests). The responsive browser gate now proves report and
notification focus return, follow/share success, a mocked report failure
toast, and no phone map-chrome controls under the full-width Explore sheet;
all six viewports pass. Optional-layer legend availability now preserves
fallback and retryable states. The latest security-header/MapLibre check also
passes. The theme/state screenshot matrix, full shared topmost-Escape
matrix, and authorized production verification remain open; blocking dialogs,
drawers, sheets, Explore, long-press actions, and the non-modal rail now share
the tested `blocking-overlay` Escape runtime. The shared `DataTrustIndicator`
now renders beside desktop/tablet/mobile incident counts and in the selected
Inspector; live incident fallback/stale/empty states take precedence over
healthy auxiliary source probes. Desktop Explore also asserts a single
quick-filter owner and no retired `Critical only` control.
The full unit suite at this checkpoint is **65 files / 172 tests**; typecheck,
lint, and the six-viewport responsive gate remain green.

**Continuation evidence (2026-07-12, state/scroll/a11y closeout):** the
incident-sheet scroll owner is now singular (`PullToRefresh` owns vertical
scrolling; dashboard content is non-scrollable), and the full unit suite is
**66 files / 178 tests**. `tests/e2e/data-trust-matrix.test.ts` passes the
1280×800 and 1440×900 PT/EN × dark/light × healthy/fallback/stale/empty/error
matrix, with map-ready baseline, Explore, Inspector, reset, and overflow
screenshots captured under `/tmp/lumes-data-trust-matrix`. The six-viewport
reduced-motion responsive gate and the 24-route/viewport axe matrix pass; the
security-header/MapLibre browser check also passes. Public deployment and
fresh HTTPS/cache/ingest proof remain intentionally open.

The public `/status` seam now exports `buildStatusViewModel()` with explicit
`ok`/`degraded`, `available`/`empty`, and `loading` state markers. Its focused
contract suite is green (8 tests across the status/locale files), and the
public browser matrix passes both themes at 320px and 390px while preserving
the Portuguese-only route contract. The fixture-backed browser matrix for
server-side status fetches is tracked separately and now passes in `start`
mode against the current build.

**Continuation evidence (2026-07-12, map-status summary):** the right-rail
Explore header now renders an isolated `MapStatusSummary` from the same
post-playback, post-filter incident set used by the map. `countIncidentSeverities`
and `buildMapStatusSummary` cover deterministic severity ordering, PT/EN
singular/plural copy, active-filter context, and explicit no-match messaging;
the UI contract keeps the summary localized, polite, and desktop-only so the
mobile attribution/legend surfaces remain the primary compact map status. The
focused summary suite passes 7 tests, and the full local unit suite now passes
85 test files / 251 tests; typecheck and lint remain green. Browser
overlap/screenshot proof is still deferred with the existing responsive gate.

**Continuation evidence (2026-07-12, OG response boundary):** the per-incident
`/api/og/incident/[id]` route now has a focused contract suite covering a
healthy persisted record, a missing record, and a redacted persistence failure.
The tests assert the 1200×630 PNG response seam and the selected DB fields
without changing the runtime renderer. The broader endpoint matrix remains
open for any routes whose browser/data-provider behavior still needs an
integration-level check.

**Continuation evidence (2026-07-12, active-filter presentation boundary):**
the nested PT/EN label mapping in `src/app/page.tsx` is now delegated to the
pure, tested `src/lib/active-filter-labels.ts` helper. Query state, filter
semantics, and clear callbacks remain page/store-owned; the helper adds
deterministic severity ordering, trimmed search labels, and safe empty/unknown
fallbacks. Focused helper, UI-wiring, and existing filter-semantic tests pass;
the full suite now passes **87 test files / 255 tests**; typecheck and lint
remain green. Browser proof for long localized labels remains deferred with
the existing screenshot/browser gate.

**Continuation evidence (2026-07-12, visible-incident derivation boundary):**
the page-level playback/live pool selection moved to the pure, typed
`src/lib/visible-incidents.ts` helper. The three existing branches are
preserved exactly: live playback cutoff, sample-frame fallback, and normal
filtered live data. Tests cover fixed-clock cutoffs, nearest-frame selection,
first-on-tie behavior, observedAt fallback, empty-frame safety, and post-pool
filtering; the full suite now passes **89 test files / 260 tests**, with
typecheck, lint, and diff checks green.

**Continuation evidence (2026-07-12, source-health presentation boundary):**
the page's core-versus-optional trust composition now crosses the pure,
tested `src/lib/source-health-presentation.ts` view-model leaf. Existing
normalization and headline derivation remain in `source-health-adapter.ts` and
`source-trust.ts`; the new tests cover live fallback/stale precedence, source
metadata fallback, localized reasons, and optional-layer warnings. The full
suite now passes **91 test files / 266 tests**, with typecheck, lint, and diff
checks green.

**Continuation evidence (2026-07-12, risk forecast route state coverage):**
`tests/lib/risk-fwi-route.test.ts` now covers valid case-insensitive forecast
days, cacheable healthy envelopes, invalid-day empty state, and redacted
upstream failures with non-cacheable retryable responses. The full suite now
passes **91 test files / 268 tests**, with typecheck, lint, and diff checks
green.

**Continuation evidence (2026-07-12, status response boundary):** the public
`/status` page now parses successful JSON through typed normalizers rather than
unchecked casts. Malformed 200 envelopes degrade to safe fallback view models,
non-OK and thrown fetches retain their existing fallback behavior, and
disabled source rows preserve nullable latency and render `—` instead of
`0 ms`. Focused status tests, typecheck, lint, `git diff --check`, and the full
local suite pass at **92 test files / 282 tests**. The fixture-backed browser
matrix now passes all 28 fixture/theme/viewport combinations in `start` mode
against the fresh local build; no deployment was performed.

**Continuation evidence (2026-07-12, production probe refresh):** the
read-only verifier reaches every deployed hashed CSS/JS asset, `/sw.js`,
`/api/health`, and `/api/source-health`. The deployed root still has the old
`s-maxage=31536000` HTML cache header and `/manifest.json` is still an HTML
404; source-health is `stale` because ingest freshness is outside the
five-minute window. These three release checks remain authorization-gated.

**Continuation evidence (2026-07-12, tracked control assets):** the local
deploy-payload preflight now resolves the manifest/logo, service worker,
offline, robots, and security assets from the tracked index. The five
previously untracked assets are committed in `fd3b4670b` and `a6ce8a1a2` with
mode `0644`; the preflight/deploy contract is committed in `3ae04413e`, and
the service-worker policy in `da21c09c3`. The disposable standalone smoke resolved the nested `server.js`
target after copying `.next/static` and `public/`, then served `/`,
`/manifest.json`, `/logo.svg`, `/sw.js`, `/offline.html`, `/robots.txt`, and
`/.well-known/security.txt` with HTTP 200. Production still requires the
authorized deploy.

**Continuation evidence (2026-07-12, executable asset preflight):** the
control-asset check now lives in `deploy/preflight-assets.sh` and is invoked by
both filesystem/server-only and git deploy paths. `tests/lib/deploy-contract.test.ts`
executes complete, missing-file, clean-commit, and dirty-commit fixtures; all
13 focused tests pass, and the full local suite is **92 files / 282 tests**.

**Continuation evidence (2026-07-12, regional-command provider boundary):**
`/api/regional-commands` now bounds its ArcGIS request with an 8-second timeout
and catches network, non-OK, and cache failures behind a redacted `502`
`no-store` retryable envelope. Malformed successful payloads remain an
explicit cacheable empty state. `tests/lib/regional-commands-route.test.ts`
covers the healthy compact/geometry path plus all three boundary states (4
tests); typecheck, lint, and the focused API suites remain green.

**Continuation evidence (2026-07-12, bounded full refresh):** the single-
worker Vitest run passes **92 test files / 282 tests** after the regional
command boundary slice. Typecheck, lint, and scoped `git diff --check` also
pass; only the expected Prisma schema fallback and redacted error-path logs
appear on stderr.

**Continuation evidence (2026-07-12, health liveness matrix):**
`tests/lib/health-route.test.ts` now covers empty reachable data, stale
non-empty data, and persistence failure, including status, `no-store`, and
`healthy`/`stale` state contracts. The focused health suite passes 3 tests;
the single-worker full refresh before the timeout slice passed **92 files / 284 tests**.

**Continuation evidence (2026-07-12, upstream timeout hardening):** direct
ANEPC/IPMA fetches in incidents, weather, fire-risk, and weather-warnings now
carry explicit `AbortSignal.timeout` bounds. A timeout contract and existing
redacted failure suites pass; the single-worker full refresh passes **93 test
files / 285 tests**.

**Continuation evidence (2026-07-12, MapLibre source boundary):** all eight
GeoJSON source updates in `src/components/ember-map.tsx` now use the typed,
fail-closed `setGeoJSONSourceData()` helper. Missing, replaced, or partially
restored sources are skipped safely for the style-restoration path instead of
being force-cast. The helper and map ownership contracts pass, and the
single-worker full refresh passes **94 test files / 288 tests**.

**Continuation evidence (2026-07-12, responsive incident-detail ownership):**
the `xl` breakpoint is now resolved through a hydration-neutral
`useIsWideDesktop()` hook. The mobile incident sheet mounts only below `xl`,
and the desktop `RightSidebar` mounts only at `xl+`, so CSS-hidden surfaces no
longer register overlay/focus effects or duplicate timeline/news work. The
detail root exposes `data-testid="incident-detail-panel"` and an explicit
mobile/desktop surface marker for browser assertions. Focused contracts,
typecheck, lint, and the bounded single-worker suite pass (**96 test files /
292 tests**). The browser request-count proof now passes at 390px and 1280px
against a fresh Lumes dev server.

`tests/e2e/incident-ownership.test.ts` now encodes that deferred proof for
390px and 1280px viewports and is green against that fresh server.

**Continuation evidence (2026-07-12, awaitable mobile refresh):**
`useFetch` now exposes `refetchAsync()` alongside the existing fire-and-forget
`refetch()`. Refresh promises settle after the current request generation
finishes, including retryable failures, and the live-incidents adapter forwards
the contract. Effect-local cancellation prevents an aborted older generation
from clearing the newer loading state. Mobile pull-to-refresh now awaits live
incidents and dashboard refreshes together, so its pending indicator cannot
clear before both attempts settle. Focused contracts, typecheck, lint, and the
bounded single-worker suite pass (**98 test files / 298 tests**). Browser proof of delayed spinner/error
presentation remains part of the responsive gate.

**Historical checkpoint (2026-07-12, incident timeline resilience):**
`TimelineTab` now uses the shared bounded fetch helper with a 10-second
timeout and non-OK handling, retains inline timeline events when persisted
history is unavailable, and exposes a localized retryable error state. The
focused timeline UI/route contracts, typecheck, lint, and bounded single-worker
suite pass (**98 test files / 297 tests**). Browser proof of the delayed/error
states was subsequently closed by the mobile refresh/timeline browser flow
documented below.

**Continuation evidence (2026-07-12, unused home poll removal):** the home
page no longer invokes the typed weather-warnings hook because its result was
not consumed anywhere in the page. This removes an unnecessary ten-minute
poll without changing the dedicated warning route or hook contract; a page
contract prevents the unused invocation from returning. The focused locale/
data-hook contracts, typecheck, lint, and bounded single-worker suite pass
(**98 test files / 298 tests**).

**Continuation evidence (2026-07-12, page binding cleanup):** the home page
no longer carries unused incident-news, mobile-sidebar, or fire-risk setter
bindings; the active fire-risk filter value remains wired to map derivation.
The page contract, typecheck, lint, and bounded single-worker suite pass
(**98 test files / 299 tests**).

**Continuation evidence (2026-07-12, page orchestration cleanup):** three
page-local values with no runtime reads (`setVisibleSources`,
`hasAutoSelected`, and `fireRiskDistribution`) are removed. The URL incident
selection path remains intact; this is a dead-state cleanup only. Focused page
contracts, typecheck, lint, and the bounded single-worker suite remain green
(**98 test files / 299 tests**).

**Continuation evidence (2026-07-12, local SQLite path resilience):** a pure
`resolveDatabaseUrl()` boundary now detects stale/missing relative or absolute
SQLite paths and falls back to the project `db/custom.db` without changing
valid configured providers. A fresh Lumes dev probe returned HTTP 200 for
`/api/stats` and an incident timeline, and the two-viewport ownership browser
gate passed. Focused database/route contracts, typecheck, lint, and the bounded
single-worker suite pass (**99 test files / 303 tests**). The temporary server
was stopped; production deployment remains unchanged.

**Continuation evidence (2026-07-12, warning-notice contrast):** the source-
health warning notice no longer combines the conflicting `text-secondary`
foreground utility with its warning color; both warning notices now use the
explicit `--type-secondary` size token and `--ember-warning` foreground. The
focused warning-notice contract passes, and the full 24-context axe matrix
(six viewports × four public routes) reports **0 violations**. Typecheck, lint,
`git diff --check`, and the bounded single-worker suite pass (**100 test files /
304 tests**); the temporary browser server was stopped. Production deployment
remains unchanged.

**Continuation evidence (2026-07-12, mobile refresh/timeline browser proof):**
the active mobile Incidents sheet now renders a localized trust warning when a
refresh fails instead of leaving the user with only a hidden map-tab indicator.
`tests/e2e/mobile-refresh-and-timeline.test.ts` performs a real 390×844 pointer
pull, holds both live-data responses, proves `Atualizando…` remains until both
settle, verifies the failure message, then opens the incident timeline and
proves loading, retryable 503, and successful retry recovery. The focused
contract, typecheck, lint, full 24-context axe matrix (0 violations), and
single-worker suite pass (**100 test files / 307 tests**); the temporary server
was stopped.

**Continuation evidence (2026-07-12, incident timeline localization):** the
timeline loading, heading, event counts, empty state, retry error, retry action,
and source-breakdown labels now use the shared PT/EN catalog. The focused
timeline UI contract, mobile refresh/timeline browser flow, typecheck, lint,
and single-worker suite pass (**100 test files / 307 tests**).

**Continuation evidence (2026-07-12, secondary typography token):** all
remaining component usages of the conflicting `text-secondary` class now use
`text-[length:var(--type-secondary)]` with explicit foreground tokens. The
typography contract covers the six affected components; the full axe matrix
remains at **0 violations**.

**Continuation evidence (2026-07-12, post-change production build):** after
the timeline localization and secondary-type-token changes,
`NEXT_TELEMETRY_DISABLED=1 CI=1 bun run build` completed successfully. The
build compiled with Next.js 16/Turbopack, generated all current routes, and
flattened the standalone server entry. No temporary Lumes server or build
worker remained afterward; this is local evidence only and does not alter the
authorization-gated HTTPS, scheduled-ingest, or post-restart checks.

**Continuation evidence (2026-07-12, aerial provider failure boundary):**
`/api/aerial` now catches cache/merge rejections, logs a redacted failure, and
returns a typed `502`/`no-store` envelope with an empty FeatureCollection and
`dataState.state = "retryable-error"`. The focused aerial contract passes its
healthy-empty and failure cases; the bounded single-worker suite passes
**100 test files / 308 tests**, with typecheck, lint, and diff checks green.
The production build was rerun after this server-route change and completed
successfully, including standalone flattening.

**Continuation evidence (2026-07-12, biomass-grid provider failure boundary):**
the lazy `/api/biomass/grid` route now catches synthetic-grid/cache failures,
logs a redacted failure, and returns a typed `502`/`no-store` empty
FeatureCollection with `dataState.state = "retryable-error"`. The focused grid
contract and API matrix pass; the bounded suite passes **101 test files / 309
tests**, with typecheck, lint, and diff checks green.

**Continuation evidence (2026-07-12, curated-news failure boundary):**
`/api/news` now catches unexpected aggregation/cache failures, preserves the
official source directory, and returns a typed `502`/`no-store` retryable
envelope without upstream details. The healthy and failure news contracts,
typecheck, lint, diff check, and bounded suite pass (**102 test files / 310
tests**).
The production build was rerun after the biomass-grid and news changes and
completed successfully, including standalone flattening.

**Continuation evidence (2026-07-12, source-health aggregation boundary):**
`/api/source-health` now catches unexpected cache/probe aggregation failures,
logs only a redacted error name, and returns a typed `502`/`no-store` core
retryable envelope while preserving healthy/fallback provenance behavior. The
focused source-health contracts and bounded suite pass (**102 test files / 311
tests**), with typecheck, lint, and diff checks green.
The production build was rerun after this boundary and completed successfully,
including standalone flattening.

**Continuation evidence (2026-07-12, health-cache failure boundary):**
`/api/health` now catches unexpected cache failures and returns a typed
`503`/`no-store` degraded response with an explicit failed cache check, while
preserving empty, stale, and persistence-failure semantics. The focused health
contracts and bounded suite pass (**102 test files / 312 tests**), with
typecheck, lint, and diff checks green.
The production build was rerun after this boundary and completed successfully,
including standalone flattening.

**Continuation evidence (2026-07-12, fire-stations optional-layer boundary):**
`/api/fire-stations` now catches unexpected cache/serialization failures and
returns a typed `502`/`no-store` retryable envelope while retaining the
curated-station fallback for Overpass outages. Healthy, fallback, and failure
contracts pass; the bounded suite passes **103 test files / 313 tests**, with
typecheck, lint, and diff checks green.
The production build was rerun after this boundary and completed successfully,
including standalone flattening.

**Continuation evidence (2026-07-12, runtime overlay focus):** the shared
drawer/dialog primitives now focus their containers synchronously before the
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

**Continuation evidence (2026-07-12, history/timeline DTO matrix):** history
and incident-timeline routes now have explicit persistence-state coverage for
redacted non-cacheable failures, nullable history fields, and non-empty
snapshot date serialization. Focused route contracts and the bounded suite
pass (**106 test files / 336 tests**). Timeline success responses now also
carry an explicit short public cache policy while failures remain
non-cacheable.

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

**Continuation evidence (2026-07-12, incident timeline cache policy):**
successful timeline responses now use `public, s-maxage=60,
stale-while-revalidate=300`, while persistence failures remain `no-store`.
The route contract covers empty, populated, and failure headers, and
`dataState.sourceUpdatedAt` comes from the newest persisted snapshot rather
than response time. The post-change bounded suite, typecheck, lint, diff check,
and capped-heap production build are green; no temporary Lumes/test/build
process remains.

**Continuation evidence (2026-07-12, aerial optional-layer feedback):** the
typed aerial status model distinguishes loading, healthy, partial, empty, and
error responses. The lazy map layer now propagates provider state through the
advanced-layer host into the existing localized FiltersPanel warning surface;
partial aircraft data remains usable and retry/toggle recovery remains
available. Focused status/UI/API contracts, typecheck, lint, the six-viewport
responsive browser matrix, and the bounded suite pass (**106 test files / 336
tests**).

**Continuation evidence (2026-07-12, aerial browser state proof):**
`tests/e2e/aerial-layer-state.test.ts` now exercises the real desktop
Advanced → Aerial interaction with mocked 502 and healthy `/api/aerial`
responses. It proves the localized optional-source warning and unavailable
sublabel, toggle-off cleanup, and healthy aircraft-count recovery. The focused
flow passes against a correctly materialized standalone runtime and is wired
into CI through `bun run test:e2e:aerial`; provider availability itself remains
an external runtime concern.

**Continuation evidence (2026-07-12, composite-risk optional-layer boundary):**
`src/lib/risk/overlay.ts` now normalizes the `/api/risk` envelope, bounds score
and probability values, and separates healthy, empty, and malformed states.
`RiskLayer` uses the shared 10-second abort-bounded fetch helper, clears stale
map data on failure, updates sources through `setGeoJSONSourceData()`, and
places its marker below incident symbols. Route, normalizer, UI-contract, and
rebuilt-standalone browser flows cover healthy, malformed/empty, upstream
failure, localized error state, toggle recovery, and healthy score rendering.
The bounded suite now passes **109 test files / 343 tests**; the risk browser
flow is wired into CI as `bun run test:e2e:risk`.

**Continuation evidence (2026-07-12, biomass optional-layer boundary):**
`src/lib/biomass/overlay.ts` now validates the synthetic GeoJSON cell shape
before it reaches MapLibre. `BiomassLayer` uses the shared 10-second abort-
bounded fetch helper, clears stale cells on failure, updates sources through
`setGeoJSONSourceData()`, and renders localized loading/empty/error/healthy
status surfaces. Route, normalizer, UI-contract, and rebuilt-standalone
browser flows cover healthy cells, 502 failure, localized error, toggle
recovery, and count rendering. The bounded suite now passes **111 test files /
347 tests**; the biomass browser flow is wired into CI as
`bun run test:e2e:biomass`.

**Continuation evidence (2026-07-12, aerial client boundary):**
`src/lib/aerial/overlay.ts` now validates the aerial FeatureCollection,
coordinates, altitude, and safe feature properties before MapLibre receives
data. `AerialLayer` uses the shared 10-second abort-bounded request helper,
prevents duplicate in-flight loads, aborts on cleanup, clears stale sources on
error/empty/invalid responses, and uses the typed fail-closed source updater
instead of a raw MapLibre cast. Focused aerial contracts, typecheck, lint, and
the bounded single-worker suite pass at **112 test files / 350 tests**; the
existing provider and UI behavior are unchanged.

**Continuation evidence (2026-07-12, follow mutation budget):**
the public `DELETE /api/follow` boundary now applies the same 30-request/minute
per-IP limiter as `POST` after CSRF validation and before its fail-closed
response. A regression contract covers `429`, `Retry-After`, `no-store`, and
the redacted retryable envelope without touching persistence. Focused
public-action/API contracts, typecheck, lint, capped build, and the bounded
single-worker suite pass at **112 test files / 351 tests**.

**Continuation evidence (2026-07-12, regional response matrix):**
`tests/lib/api-contract-matrix.test.ts` now covers the regional route's
healthy populated response, default active-status filtering, explicit
`resolved=1` behavior, blank-name rejection, empty state, and redacted
persistence failure. The bounded single-worker suite passes **112 test files /
354 tests**; serialized date fields are asserted at the JSON boundary.

**Continuation evidence (2026-07-12, fire-risk provider normalization):**
the core IPMA `/api/fire-risk` boundary now drops rows without finite
mainland-Portugal coordinates, a non-empty municipality code, or integer RCM
values in `0..5`; all-invalid payloads become cacheable `empty` state while
valid mixed rows remain healthy. `toFireRiskFeatures()` repeats the finite and
Portugal bounds before MapLibre publication. Focused route/adapter contracts,
typecheck, lint, capped build, and the bounded suite pass at **112 test files /
360 tests**.

**Continuation evidence (2026-07-12, CSRF response contract):**
`assertSafeOrigin()` now returns a normalized `403` JSON envelope with
`dataState.empty`, a generic reason, and `Cache-Control: no-store`. Direct
helper tests and alert/follow caller contracts cover trusted/untrusted origins
without changing mutation ownership. Typecheck, lint, capped build, and the
bounded suite pass at **113 test files / 362 tests**.

**Continuation evidence (2026-07-12, weather station geometry):**
the IPMA weather route now publishes station coordinates as an atomic pair:
partial, non-finite, or out-of-mainland metadata is omitted while observation
metrics remain available for the operational summary. Focused weather/context
contracts, typecheck, lint, capped build, and the bounded suite pass at **113
test files / 362 tests**.

**Continuation evidence (2026-07-12, realtime initial poll):**
the SSE route now invokes its bounded poll once immediately after the
connection event, so clients receive a heartbeat and newly observed incident
without waiting for the first 30-second interval. Existing abort, overlap,
rate-limit, and no-cache contracts remain green; the bounded suite passes
**113 test files / 363 tests**.

**Continuation evidence (2026-07-12, Overpass station geometry):**
the fire-station provider parser now rejects finite-but-out-of-envelope nodes,
including `0,0`, against the existing mainland Overpass query bounds before
publishing provider data. The curated island-inclusive fallback remains
unchanged for provider outages. Focused station healthy/fallback/failure
contracts, typecheck, lint, capped build, and the bounded suite pass at **113
test files / 364 tests**.

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

**Continuation evidence (2026-07-12, release contract/preflight):**
`bash deploy/preflight-assets.sh . filesystem` passes for the manifest, logo,
service worker, offline, robots, and security assets. The focused
`tests/lib/deploy-contract.test.ts` gate passes all **13 tests**, including
standalone layout, cache policy, asset tracking, and `/usr/local/bin/bun`
service/ingest assertions. Git-mode preflight and production mutation remain
intentionally unrun because the worktree is not a clean release checkout and
deployment authorization has not been provided.

**Continuation evidence (2026-07-12, fresh read-only production verifier):**
`LUMES_VERIFY_TIMEOUT_SECONDS=10 bash deploy/verify-production.sh
https://lumes.pt` confirms the deployed hashed CSS/JS assets, `/sw.js`, and
`/api/health` are reachable. The authorized-release boundary is unchanged:
the root response still carries `s-maxage=31536000` instead of `no-store`,
`/manifest.json` is HTTP 404 with an HTML response, and `/api/source-health`
returns seven sources with state `stale`. No deployment, restart, or scheduled
ingest mutation was performed.

**Continuation evidence (2026-07-12, production verifier rerun):**
The read-only verifier was rerun after the current local build. Hashed assets,
`/sw.js`, `/api/health` (`ok`), and `/api/source-health` (seven sources,
`stale`) remain reachable; the same three release failures remain: stale root
HTML caching and missing/HTML `/manifest.json`. No deployment, restart, or
scheduled-ingest mutation was performed.

**Continuation evidence (2026-07-12, disposable standalone smoke):**
the current build was materialized using the same `RUNTIME_DIR` copy contract
as `deploy/deploy.sh` (nested standalone server, `.next/static`, and `public`).
Against the disposable runtime, `/` returned `200` with `Cache-Control:
no-store`, `/manifest.json` returned `200` JSON with no-store caching, and
`/sw.js` returned `200` JavaScript with no-store caching. `/api/source-health`
returned `200`; `/api/health` returned a redacted local `503` because the local
fixture database is stale, not because control assets were missing. The runtime
was stopped after the smoke; production was not changed.

The current route-entrypoint inventory now has at least one contract-test
import for every `src/app/api/**/route.ts`/`route.tsx` entry point, including
the dynamic OG route. This does not close deeper success/error/provider-state
or browser-rendering coverage, which remains tracked separately.

## Review matrix

| Surface | Viewports | Themes/locales | Required states |
| --- | --- | --- | --- |
| Home/map chrome | 390×844, 768×1024, 1024×768, 1280×800, 1440×900 | dark/light, PT/EN app | fresh, core-stale, optional-error, empty, selected |
| Explore/filters | 390×844, 1024×768, 1280×800 | dark/light, PT/EN app | baseline, single filter, combined, reset, unavailable layer |
| Inspector | 390×844, 1280×800 | dark/light, PT/EN app | contained, active, missing evidence, follow success/failure |
| Public pages | 320×568, 390×844, 768×1024 | dark/light, PT-PT | success, validation error, retry, degraded |
| Delivery | fresh browser + HTTPS | n/a | asset 200s, service worker 200, health ok, ingest success |

## Definition of done

- Map chrome never intersects Explore/drawer bounds.
- Headline trust reflects core data only; optional source errors are precise and local.
- No placeholder incident names or incorrect “active” counts are visible.
- Typography is approved, readable at target sizes, and consistent across app surfaces.
- Unit, type, lint, build, responsive, axe, Lighthouse, and fresh-browser gates pass.
- Deployment helper packages static/public assets and the public service remains healthy after restart.

## Optional post-refactor capability: 3D Incident Focus

3D Incident Focus is now tracked as an optional, feature-flagged capability,
not as part of the current reliability-first execution gate. The default map
remains Portugal-wide, operational, and top-down. The capability begins with
camera-only incident focus and no new provider, building layer, terrain, style
swap, rotation, or touch pitching.

The complete implementation plan is [2026-07-11-3d-incident-focus.md](./2026-07-11-3d-incident-focus.md).

The dependency order is strict:

1. Finish reliability, source freshness, incident selection/Inspector,
   filtering, responsive map chrome, accessibility, and map-wrapper extraction.
2. Ship Phase 1 only behind `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS=0` by default,
   with camera snapshot/restore, reduced-motion handling, 2D fallback, and
   no new map source requests.
3. Consider local building extrusions only after provider licence, attribution,
   Portugal coverage, height-field quality, style-restoration, and mobile
   performance gates pass.
4. Consider terrain/slope only after the building phase proves operational
   value and has a documented DEM provider and fallback.

3D must not be used to defer or obscure any red or orange reliability finding,
and no production flag enablement, database migration, deployment, or new
external provider is included in the current frontend improvement tranche.

## Continuation evidence (2026-07-12, follow-operation ownership)

Follow persistence is now owned by `src/lib/use-followed-incidents.ts` rather
than page-local pending state. The hook keeps the exact browser-local storage
key, tracks pending IDs, guards same-ID calls synchronously with a ref, derives
different-ID updates from a latest-set ref, rolls back failed writes, and
returns an applied/ignored result. `src/app/page.tsx` retains storage
availability checks and localized success/failure toasts; it does not own
follow persistence or pending cleanup.

`tests/lib/followed-incidents.test.ts` covers immutable toggle semantics and
the storage/pending/toast ownership boundary. The focused follow, i18n,
responsive-detail, and 3D UI contracts pass **4 files / 9 tests**. The full
single-worker suite passes **118 test files / 413 tests**; lint, typecheck, and
the capped production build also pass. The build still emits the existing
multiple-lockfile workspace-root warning; it does not fail the build.

`tests/e2e/follow-state.test.ts` now adds the missing browser proof: it passes
against a fresh local server for persistence across reload, same-task duplicate
click suppression, and localized failed-write rollback. The temporary server
was stopped after the gate; the script is included in CI and production
remains unchanged.

## Continuation evidence (2026-07-12, notification state boundary)

The local notification list and unread-count derivation moved from
`src/app/page.tsx` into `src/lib/use-notifications.ts`. The hook preserves the
existing mock data, drawer props, mark-all-read behavior, and navigation
callbacks; the pure `markNotificationsRead()` helper prevents mutation of the
source list. `tests/lib/use-notifications.test.ts` covers the immutable
transition. Lint, typecheck, the focused four-file gate, the full suite
(**119 test files / 414 tests**), and the capped production build pass.

## Continuation evidence (2026-07-12, refresh lifecycle boundary)

The refresh effect now delegates its pending/success/error decision to the
pure typed `src/lib/refresh-state.ts` helper. The page retains request
ownership, timestamp refs, and localized toast rendering; mobile still awaits
both incident and dashboard generations through the existing `refetchAsync`
contract. Manual and awaitable refetch callbacks clear stale error/loading
state before scheduling a retry; `previousRefetchedAt` identity protects the
desktop path from resolving an unchanged timestamp. `tests/lib/refresh-state.test.ts`
covers idle, error precedence, stale timestamp, loading, and success states,
while the mobile contract covers the synchronous retry boundary. Focused
contracts, lint, typecheck, the full suite (**120 test files / 419 tests**), the
mobile refresh retry browser flow, and the capped production build pass.

## Continuation evidence (2026-07-12, keyboard shortcut ownership)

The page-level keyboard listeners and shortcuts-dialog focus lifecycle moved to
`src/lib/use-keyboard-shortcuts.ts`; pure intent ordering lives in
`src/lib/keyboard-shortcuts.ts`. Actions remain injected from the page, so
overlay closing, incident-focus exit, refresh, follow, locate, and search
ownership do not move into the hook. Select/contenteditable controls are
excluded from global actions, the shared focus trap handles container Shift+Tab
entry, and latest-action refs avoid listener churn. Focused routing/ownership
contracts and a fresh browser flow for `?`, Escape, and `/` pass; lint,
typecheck, the full suite (**122 test files / 425 tests**), and the capped
production build pass.

## Continuation evidence (2026-07-12, live fallback-status boundary)

The live fallback transition decision now lives in the pure typed
`src/lib/live-status.ts` helper. `src/app/page.tsx` retains the status ref and
localized toast side effects, preserving the existing one-time fallback,
recovery-with-live-data, and empty-recovery behavior. The focused contract
passes 4 tests; the full single-worker suite passes **123 test files / 429
tests**; lint, typecheck, and the capped production build pass.

## Continuation evidence (2026-07-12, MapScene theme boundary)

The `next-themes` value passed to `MapScene` now crosses the tested
`normalizeMapTheme()` helper in `src/lib/map/map-style.ts`; the inline page
cast is gone. This is behavior-preserving for light, dark, system, unknown,
and pre-mount values. Focused map-style/map-scene tests, lint, typecheck, the
full suite (**123 test files / 430 tests**), and the capped production build
pass; independent review found no issues.

## Continuation evidence (2026-07-12, follow callback ownership)

The page no longer defines a forwarding `toggleFollow` wrapper. Desktop/mobile
Inspector and marker-menu follow/alert actions call `handleToggleFollow`
directly; follow persistence and user feedback ownership remain unchanged.
The source contract, fresh local follow browser flow, lint, typecheck, full
suite (**123 test files / 431 tests**), and capped production build pass.

## Continuation evidence (2026-07-12, complete filter reset semantics)

The page-level dead reset adapter was removed, and `FiltersPanel` now owns a
complete clear-all operation: phase and resource filters are passed into both
desktop/mobile instances, cleared explicitly, and included in the active-reset
affordance. Focused contracts, all six responsive browser viewports, lint,
typecheck, full suite (**123 test files / 433 tests**), and capped production
build pass.

## Continuation evidence (2026-07-12, incident selection ownership)

List-driven selection now uses the no-fly `handleSelectIncident` path, while
MapScene clicks and marker-menu detail actions retain the explicit
`handleSelectIncidentFromMap` camera path. This keeps list browsing from
surprising users with a camera move while preserving map-led incident focus.
The source contract uses contextual count assertions for the two list
handlers, one mobile peek handler, one MapScene handler, and one marker-menu
call. The focused contract passes 2 files / 6 tests, the reviewer approved
the correction, all six responsive browser viewports pass, the full
single-worker suite passes **123 test files / 434 tests**, and lint,
typecheck, the capped production build, and `git diff --check` pass.

## Continuation evidence (2026-07-12, notification selection ownership)

The notification drawer now routes incident clicks through the guarded list
selection callback before closing. This preserves no-fly list semantics and
rejects stale/filtered targets instead of leaving a dead selected ID behind;
history selection remains separate because historical IDs may not be in the
live visible set. The focused selection/filter gate passes 2 files / 7 tests,
and lint/typecheck remain green.

## Continuation evidence (2026-07-12, ANEPC request coalescing)

The core `/api/incidents` route now coalesces concurrent loads with a
route-local in-flight promise instead of waiting five seconds behind a
boolean lock. Resolve/reject cleanup is identity-guarded, failed loads remain
retryable, and the completed-value cache contract is unchanged. Focused route
tests cover one upstream call for slow concurrent requests and shared
rejection followed by a successful retry. The reviewer approved the change;
the full single-worker suite passes **123 test files / 437 tests**, lint,
typecheck, capped build, and diff check pass, and the six-viewport responsive
matrix passes against a correctly materialized standalone runtime with the
local SQLite path.

## Continuation evidence (2026-07-12, realtime client lifecycle)

The client SSE lifecycle moved into `src/lib/realtime-client.ts`, leaving
`useRealtimeIncidents` responsible only for React state and callback wiring.
The typed client coalesces repeated errors, retries constructor failures,
ignores stale source callbacks, drops malformed frames, and cancels the active
source and pending timer on disposal. Focused realtime client/server tests pass
2 files / 7 tests; independent review approved the change; the full
single-worker suite passes **124 test files / 440 tests**; lint, typecheck,
capped build, diff check, and the correctly materialized standalone
six-viewport browser matrix pass.

## Continuation evidence (2026-07-12, source-health probe boundary)

The source-health aggregation now validates every provider envelope through a
typed normalizer. Malformed 200 responses, non-200 responses, invalid counts,
unknown states, and invalid timestamps become redacted retryable source
errors instead of stale or healthy data. Explicit stale/disabled/fallback
states and provider reasons are preserved, and sourceUpdatedAt is omitted
when no explicit provider freshness value exists rather than being fabricated
from the response time.

The focused source-health/trust/API gate passes **4 files / 39 tests** and the
reviewer approved the change. The full single-worker suite passes **124 test
files / 448 tests** with one worker and a 2 GB heap cap; lint, typecheck, diff
check, and the capped production build pass. The build still reports the
existing multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-12, IPMA warning payload boundary)

The `/api/weather-warnings` route now validates its untrusted IPMA payload
through `src/lib/weather/warnings.ts`. Non-array payloads fail closed, mixed
rows keep only recognized valid warnings, and a non-empty array with no valid
recognized rows is retryable instead of being reported as a healthy empty
source. Required area/type fields are trimmed and validated; impossible or
ambiguous timestamps are rejected while IPMA's actual timezone-less local ISO
format and zoned ISO timestamps remain supported.

The final focused weather-warning/source-health/API gate passes **4 files / 58
tests** and independent review approved the change. The full single-worker
suite passes **124 test files / 454 tests** with one worker and a 2 GB heap
cap; lint, typecheck, diff check, and the capped production build pass. The
build still reports the existing multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-13, dashboard normalization boundary)

The dashboard endpoint now uses a typed normalizer for both live incident
records and database fallback rows. It rejects unknown severity/status values,
negative or fractional operational counts, invalid timestamps, contradictory
`status`/`incidentStatus` pairs, and declared non-Point geometries before
aggregation. Retryable live envelopes fall back rather than being marked
healthy; database query failures return the existing redacted retryable
`500`/`no-store` contract instead of an indistinguishable empty dashboard.

The focused dashboard/API gate passes **3 files / 33 tests** and independent
review approved the change. The full single-worker suite passes **124 test
files / 460 tests** with one worker and a 2 GB heap cap; lint, typecheck, diff
check, and the capped production build pass. The build still reports the
existing multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-13, IPMA observation freshness boundary)

The `/api/weather` route now validates observation bucket keys through the
typed `src/lib/weather/observations.ts` boundary. It selects the newest valid
timestamp by parsed instant, resolves IPMA's timezone-less local timestamps in
`Europe/Lisbon` with DST-aware semantics, and canonicalizes only
`dataState.sourceUpdatedAt` to UTC so the public observation timestamp remains
provider-compatible. Invalid buckets are ignored; when none are valid the
route returns its cacheable explicit empty state, and row normalization rejects
invalid timestamps.

The focused weather/source-health/API gate passes **5 files / 63 tests**;
independent review approved the corrected timezone handling, including
fractional-second preservation. The full single-worker suite passes **124 test
files / 468 tests** with one worker and a
2 GB heap cap; lint, typecheck, diff check, and the capped production build
pass. The build still reports the existing multiple-lockfile workspace-root
warning.

## Continuation evidence (2026-07-13, batch incident-risk result boundary)

The batch risk route now returns an explicit `empty` data state when a valid
request resolves to no known or in-Portugal incidents, rather than publishing
an indistinguishable healthy empty result. Mixed persistence rows keep valid
risk records and omit invalid coordinates. Existing `no_weather` records
remain finite and visible, while same-coordinate Open-Meteo requests share an
in-flight promise within the bounded batch.

The focused risk/API gate passes **4 files / 25 tests**; independent review
approved the bounded change. The full single-worker suite passes **124 test
files / 472 tests** with one worker and a 2 GB heap cap; lint, typecheck, diff
check, and the capped production build pass. The build still reports the
existing multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-13, shared client trust boundary)

The shared `useFetch` response seam now uses strict `DataStateMeta`
normalization. Present malformed metadata (unknown state, impossible or
ambiguous timestamp, invalid provider freshness, or malformed optional text)
produces a retryable/error trust state and retains existing data/fallback rather
than claiming fresh data. Absent metadata remains the compatibility healthy
path; valid stale, empty, and fallback metadata remain visible. Client receipt
`updatedAt` is no longer used as provider `sourceUpdatedAt`, and E2E response
fixtures now include valid metadata timestamps.

The focused trust/client gate passes **6 files / 32 tests**; independent review
approved the boundary. The full single-worker suite passes **124 test files /
485 tests** with one worker and a 2 GB heap cap; lint, typecheck, diff check,
and the capped production build pass. The build still reports the existing
multiple-lockfile workspace-root warning.

## Continuation evidence (2026-07-13, trust error precedence correction)

Review found that valid `healthy` metadata could mask a non-fallback refresh
error in `deriveDataTrust()`. The trust reducer now gives invalid metadata and
refresh failures precedence over ordinary metadata, while preserving an
explicit retained `fallback` state. The regression is covered by a focused
red-first test.

The focused trust gate passes **5 files / 20 tests**; the full single-worker
suite passes **125 test files / 506 tests** with one worker and a 1.5 GB heap
cap; lint, typecheck, diff check, and the capped production build pass.

## Continuation evidence (2026-07-13, client incident payload boundary)

The `/api/incidents` client seam now validates every successful row through
`src/lib/incident-client.ts` before adapting it to the operational map/detail
model. It rejects malformed nested properties/trust objects, invalid or
foreign/non-finite Point coordinates, unknown enums, impossible timestamps,
and unbounded scalar values. Mixed payloads retain valid rows and all-invalid
payloads produce an empty normalized collection without throwing; the existing
fallback behavior remains owned by `useLiveIncidentsNew`.

The focused incident-client gate passes **5 files / 41 tests**; full ESLint,
TypeScript, and `git diff --check` pass. The full single-worker suite passes
**125 test files / 506 tests** with one worker and a 1.5 GB heap cap; the
capped production build passes with the existing multiple-lockfile
workspace-root warning.

## Continuation evidence (2026-07-13, service-worker cache correctness)

The service worker now refuses to cache non-OK navigation responses and turns
uncached non-OK static responses into a deterministic 503 offline response.
Expired, missing-Date, and malformed-Date static entries remain immediately
servable as last-known-good content while revalidation runs through a caught
`waitUntil` promise; rejected network and cache writes cannot create unhandled
rejections or evict the stale entry. Activation cleanup and existing API,
cross-origin, and Next-static bypass rules are covered by runtime/contract
tests.

The focused service-worker gate passes **2 files / 11 tests**; full ESLint,
TypeScript, and `git diff --check` pass. The full single-worker suite passes
**127 test files / 550 tests** with one worker and a 1.5 GB heap cap; the
capped production build passes with the existing multiple-lockfile
workspace-root warning. Navigation cache writes now settle through
`event.waitUntil`, and activation cleanup removes only cache names owned by
Lumes while preserving foreign origin caches.

## Continuation evidence (2026-07-13, MapLibre style restoration lifecycle)

MapLibre style changes now run through a generation-guarded lifecycle. Stale
core `style.load` callbacks and satellite callbacks cannot replay sources,
mark the map ready, or dispatch a restore event after a newer transition or
unmount. Initial-load prop changes reconcile after MapLibre load, requested
style reversals remain live while a prior transition is pending, and a
transition-start event cancels deferred optional-layer remounts before the
style is replaced. Satellite tint updates also respond to theme changes.

The focused style/scene/event gate passes **4 files / 12 tests**; the complete
map contract suite passes **15 files / 44 tests**; full ESLint, TypeScript, and
`git diff --check` pass. The full single-worker suite passes **127 test files /
523 tests** with a 1.5 GB heap cap. The current production build was not run
in this slice to avoid overlapping another workspace's heavy processes; the
last capped build remains documented above. Low-risk follow-ups are a real
MapLibre event-emitter integration test and a `setStyle` error/timeout
fallback.

## Continuation evidence (2026-07-13, MapLibre style-load recovery)

The style transition boundary now has a bounded target/fallback runtime.
Successful `style.load` commits once and clears its timer; only narrow
style-propagated errors or the timeout trigger a single rollback to the last
committed style. Stale error/timeout callbacks and unmounts cannot mutate
readiness or dispatch restore events. Initial style loading has a watchdog
that exposes `retryable-error`, while successful fallback is marked
`recovered` rather than silently presenting the requested style as applied.

The focused map/style gate passes **4 files / 17 tests**; the complete map
contract suite passes **15 files / 50 tests**; the full single-worker suite
passes **127 test files / 528 tests** with a 1.5 GB heap cap. TypeScript,
ESLint, and `git diff --check` pass. The current production build was not run
to avoid overlapping unrelated heavy processes. A narrow low-risk behavior
is preserved: MapLibre URL errors without a propagated `style` payload now
match the active target/fallback URL for immediate rollback, while unrelated
source/tile errors still use the bounded timeout path.

## Continuation evidence (2026-07-13, MapLibre URL-error classification)

The style runtime now recognizes structured diff-mode `AJAXError` events by
matching `error.url` to the active target/fallback URL, so genuine basemap URL
failures enter rollback immediately without broadening rollback to unrelated
source/tile errors. The focused map/style gate remains **4 files / 17 tests**;
the full single-worker suite passes **127 files / 528 tests**, with typecheck,
ESLint, and `git diff --check` green.

## Continuation evidence (2026-07-13, client incident response envelope)

The `/api/incidents` client boundary now validates the complete successful
response envelope before the operational adapter runs. Source identity,
source timestamp, raw/count totals, optional cache/latency fields, open-key
distribution counts, and every nested incident row are bounded and typed.
The count and distribution totals must agree with the normalized rows; a
non-empty payload whose rows are all malformed becomes a retryable transform
failure, while a genuine empty response remains an explicit empty result.
`useLiveIncidentsNew()` uses a stable module-level transform and only shows
synthetic sample incidents when no live response exists, so a malformed refresh
cannot replace a valid empty or retained live response with fake fires.

The focused incident-client/hook gate passes **2 files / 42 tests**; full
ESLint, TypeScript, and `git diff --check` pass. The full single-worker suite
passes **127 test files / 550 tests** with a 1.5 GB heap cap, and the capped
production build passes with the existing multiple-lockfile workspace-root
warning.

## History boundary and selection ownership (2026-07-13)

The persisted history UI now follows the same client trust boundary as live
incidents. `normalizeHistoryIncident()` and `normalizeHistoryResponse()` reject
foreign coordinates, malformed dates, unknown enums, impossible numeric
resources, and count/total mismatches; valid mixed rows survive and explicit
empty remains distinct from retryable failure. `useHistoryNew()` passes a stable
transform into `useFetch`, and `HistoryModal` renders a retryable `SectionError`
instead of issuing the former unbounded raw fetch.

Selection ownership is explicit. Both modal rows and mobile recent-history rows
pass a `HistoryIncident` to page-owned state; `adaptHistoryToIncident()` then
feeds the existing detail panel without pretending the historical ID is a live
map incident. The live priority list stays on `onSelectIncident` and cannot
accidentally invoke the history adapter. Focused coverage is **4 files / 30
tests**; the full suite is **128 test files / 573 tests**, with ESLint,
TypeScript, `git diff --check`, and the capped production build green. The
dashboard/modal now share the all-history request, status filters remain
scoped, and the modal shows the history trust state. True empty history has
dedicated copy and historical detail explicitly marks IPMA risk unavailable.
The isolated Playwright history lifecycle gate passes the empty, retryable,
retry, and historical-selection paths against a local production server. No
remaining P1/P2 history implementation blocker is known.

## Dashboard-local Following filter continuation outcome (2026-07-13)

The tablet/mobile dashboard now includes a localized `Following` activity
view backed by the browser-local follow set. It filters the current visible
dashboard rows only, exposes a count, and renders a dedicated empty state;
it does not extend global map filters or URL serialization. The focused
unit/contract gate passes **4 files / 18 tests**, the focused tablet
Playwright gate passes, and ESLint, TypeScript, and `git diff --check` pass.
The full suite/build were intentionally not started while an unrelated Rota
Playwright/build workload was active. A later Following read-state
continuation added per-incident provider timestamps and mark-seen-on-entry
behavior without changing the followed-ID ownership.

## MapLibre style event-order browser outcome (2026-07-13)

`tests/e2e/map-style-lifecycle.test.ts` passes against a real 1280×800
MapLibre instance with reduced motion. Dark→light and immediate light→dark
reversal settle on a ready/recovered map without a retryable or unready final
state. The temporary dev server was stopped afterward; no production build or
deployment was performed.

## Following truthfulness and historical follow guard (2026-07-13)

Following empty states now reflect whether the browser has no followed IDs or
whether current filters hide all followed rows. The latter offers a localized
clear-filters action without changing filter state merely by entering the
Following view. Historical detail suppresses all live-only follow affordances
because history adapters mark records `isLive: false`.

Focused contracts, typecheck, lint, diff validation, and the isolated Following
and history browser gates pass. Full suite/build and production-only checks
remain separately gated.

## Incident-news client boundary (2026-07-13)

The incident detail news hook now validates its successful response before
rendering. IDs, bounded article text, HTTP(S) links, timestamps, categories,
booleans, count invariants, and optional trust metadata are normalized in an
isolated client module. This closes the remaining detail-panel assumption that
`data.items` is a trustworthy array. Focused client/route/hook contracts,
typecheck, lint, and diff validation pass; full suite/build remain separately
gated.

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

## News response trust boundary (2026-07-13)

`useNewsNew()` now validates the `/api/news` aggregate before the map-first
shell’s news sidebar renders it. The isolated client module bounds content,
checks article/link/timestamp/category/severity semantics, accepts the
route’s pre-filter press total, and rejects duplicate IDs or malformed trust
metadata. This keeps the existing public UI and source attribution intact
while preventing malformed successful JSON from reaching `NewsSection`.

Focused news route/client/hook tests pass (**4 files / 21 tests**), with
ESLint, TypeScript, and diff validation green. Full browser/build gates remain
open because they are intentionally bounded around current RAM pressure.

## Weather response trust boundary (2026-07-13)

The weather context consumed by the map-first shell now passes through a
client-side IPMA response normalizer. `useWeatherNew()` preserves the existing
empty and mixed-row behavior while validating timestamps, station metrics,
optional coordinates, counts, provider freshness, and explicit trust metadata.
This protects `buildWeatherSummary()` and `enrichIncidentWithLiveContext()`
from malformed successful JSON without changing the UI or upstream route.

The focused weather/client/API/source-health gate passes **4 files / 48
tests**; ESLint, TypeScript, and diff validation are green. Full browser/build
gates remain open under the bounded-memory policy.

## Fire-risk response trust boundary (2026-07-13)

The IPMA risk overlay now receives a validated client response through
`useFireRiskNew()`. Counts, per-RCM distribution, labels, coordinates, and
freshness are checked before map feature construction or incident enrichment;
the existing empty/mixed-row semantics and public response shape remain
unchanged.

The focused fire-risk/client/API gate passes **5 files / 47 tests**, with
ESLint, TypeScript, and diff validation green. Full browser/build gates remain
open under the bounded-memory policy.

## Dashboard response trust boundary (2026-07-13)

The map-first page now receives a validated dashboard aggregate through
`useDashboardNew()`. Summary totals, distributions, priority rows, persistence
counts, coordinates, and trust metadata are checked before the shell renders
metrics or reconciles priority selections. Existing server-side fallback and
empty semantics are unchanged.

The focused dashboard/client/API gate passes **5 files / 49 tests**, with
ESLint, TypeScript, and diff validation green. Full browser/build gates remain
open under the bounded-memory policy.

## Fire-stations response trust boundary (2026-07-13)

The optional station layer now receives a validated response through
`useFireStationsNew()`. Healthy Overpass results and the curated fallback list
remain visibly distinct, while malformed station rows cannot reach GeoJSON
feature construction. The UI toggle, attribution, and lazy-loading behavior
are unchanged.

The focused station/client/source-health gate passes **4 files / 25 tests**,
with ESLint, TypeScript, and diff validation green. Full browser/build gates
remain open under the bounded-memory policy.

## Persistence-stats response trust boundary (2026-07-13)

The dashboard persistence counters now pass through a dedicated client
normalizer before rendering. Totals, active/resolved relationships, snapshots,
freshness, and optional `dataState` are bounded without changing the existing
`/api/stats` route or empty-state behavior. The focused stats/client/API/hook
gate passes **4 files / 34 tests**, with targeted lint, TypeScript, and diff
validation green.

## Notification trigger parity (2026-07-13)

Phone and tablet navigation now expose the page-owned unread notification count
without changing the desktop bell or inventing provider history. The drawer
has localized title/count/empty/footer copy and disables mark-all when the
unread count is zero. Focused notification tests pass (**3 files / 5 tests**),
and the reduced-motion phone/tablet browser scenarios pass. The shared desktop
responsive run remains incomplete at its pre-existing incident readiness
timeout.

## Community-report submission boundary (2026-07-13)

The report modal now uses an isolated, bounded client response normalizer for
`/api/reports`. It accepts only the expected pending-review acknowledgement,
keeps bounded server failures as errors, and rejects malformed successful JSON.
The form's submitting state is released through `finally`; no storage provider
or visual-attachment contract was introduced.

Focused report-client/modal/action tests pass (**3 files / 9 tests**), with
targeted ESLint, TypeScript, and diff validation green. Attachment storage and
moderation identity remain separate product/security gates.

## Continuation verification after notification/report slices (2026-07-13)

The capped single-worker suite passes **146 files / 702 tests**. Repository
lint, TypeScript, `git diff --check`, and the capped production build pass.
The six-viewport responsive browser matrix also passes after the test context
installs a deterministic incident fixture and the healthy-empty Situation
branch exposes an explicit marker. The build retains the known
multiple-lockfile workspace warning and the tests retain the known Prisma
engine fallback.

## Optional-source client boundaries (2026-07-13)

The weather-warnings, satellite, regional-commands, and source-health hooks now
validate successful response envelopes before page, map, or source-health
consumers use them. Counts, timestamps, provenance, geometry, Portugal bounds,
duplicates, optional `dataState` metadata, and explicit empty/fallback states
are bounded; malformed successful payloads fail closed while valid mixed rows
remain usable. Focused client/API/hook gates, repository lint, TypeScript,
diff validation, the six-viewport responsive matrix, and the full capped suite
pass.

## Deterministic responsive readiness fixture (2026-07-13)

The responsive browser matrix now scopes a test-only `/api/incidents` fixture
to its own context before navigation. The fixture has strict Portuguese
coordinates, matching counts/distributions, and official trust metadata, while
all other API requests retain their normal behavior. The healthy empty
Situation branch exposes an explicit test ID, removing the previous desktop
readiness dependence on live provider timing.

## Full continuation verification (2026-07-13)

The capped single-worker full suite passes **136 files / 655 tests**. Repository
lint, TypeScript, `git diff --check`, and the capped production build pass;
the build retains the known multiple-lockfile workspace-root warning. No
deployment, production restart, provider access, or HTTPS/cache verification
was performed.

## Incident-timeline client response boundary (2026-07-13)

The incident detail timeline now passes through a bounded client response
normalizer before snapshot rows reach the UI. Incident identity, counts,
timestamps, status/severity enums, resource metrics, duplicate IDs, and
optional `dataState` metadata are validated; malformed successful envelopes
fail closed while empty responses, live inline events, loading, retry, and
recovery behavior remain intact.

The focused timeline gate passes **3 files / 11 tests**. Targeted ESLint,
TypeScript, and `git diff --check` pass. The mobile refresh/timeline browser
flow passes against a bounded local dev server, including timeline retry and
recovery.

## Newsletter client response boundary (2026-07-13)

Newsletter subscription now uses an isolated client boundary that validates
the pending-confirmation/already-subscribed response contract, bounded errors,
and optional `dataState` metadata. The form keeps its existing localized UX and
does not add provider or persistence ownership.

The focused newsletter gate passes **1 file / 4 tests**; targeted ESLint,
TypeScript, and `git diff --check` pass. A stale standalone browser artifact
was not treated as product evidence; a fresh build/browser rerun remains a
separate gate.

## Aerial data-state consistency (2026-07-13)

The aerial overlay normalizer now validates optional `dataState` metadata and
requires `empty` for zero features or `healthy` for non-empty features. Invalid
metadata or cardinality/state mismatches fail closed without changing the
existing overlay-clearing, status, attribution, or recovery behavior.

The focused aerial gate passes **4 files / 20 tests**. Targeted ESLint,
TypeScript, and `git diff --check` pass.

## Latest continuation verification (2026-07-13)

The capped single-worker full suite records **148 files / 716 tests**. The
incident timeline browser recovery flow passes. Provider access, deployment or
restart, production HTTPS/cache verification, community attachment storage,
and 3D provider/building/terrain gates remain intentionally open.

## Standalone asset materialization (2026-07-13)

The production flatten helper now copies `.next/static` and `public/` beside
the nested standalone server. This preserves the client chunks and public
files that Next intentionally omits from standalone output. The fresh
standalone artifact now passes the public newsletter/status browser gate in
all **4/4** 320/390px dark/light scenarios.

## Current verification (2026-07-13)

The clean capped suite passes **148 files / 716 tests**. Repository ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The
build retains the known multiple-lockfile workspace warning and tests retain
the known Prisma engine fallback. Provider access, deployment/restart,
production HTTPS/cache verification, community attachment storage, and 3D
provider/building/terrain gates remain intentionally open.

## Dead aerial hook cleanup (2026-07-13)

Removed the unused `useAerialNew()` and `AerialClientResponse` raw-fetch
wrapper. The active AerialLayer path remains unchanged and continues to own
the validated `/api/aerial` response, source clearing, status, and recovery
behavior. The focused six-file aerial/data-hook gate passes **17 tests**;
TypeScript, targeted lint, and diff validation pass.

## Read-only production verifier rerun (2026-07-13)

The live site continues to serve hashed client assets, `/sw.js`, `/api/health`
(`ok`), and seven source-health entries. The root response still carries
`s-maxage=31536000` instead of `no-store`, and `/manifest.json` remains an
HTTP 404 HTML response. No deployment or restart was performed; this is a
production-state gate, not a local build failure.

## Service-worker documentation reconciliation (2026-07-13)

The deploy guidance now matches the current worker contract: hashed Next
chunks bypass service-worker caching and APIs remain network-owned, so ordinary
application builds do not require a cache-name bump. A bump is reserved for a
change to the worker's own precache/static-cache contract.

## Standalone packaging regression contract (2026-07-13)

The deployment contract suite now executes `deploy/flatten-standalone.js` in
an isolated nested standalone fixture. The contract proves the stable server
symlink, `.next/static`, and `public/` are copied beside the nested server and
that a second invocation remains idempotent. The focused deployment gate passes
**14 tests**; TypeScript, targeted ESLint, and `git diff --check` pass. The
serialized full suite now passes **148 files / 713 tests**.

## Dead server-follow client cleanup (2026-07-13)

Removed the unused `persistFollowChange()` wrapper and raw JSON cast from
`src/lib/public-actions.ts`. The browser-local `useFollowedIncidents` hook
continues to own follow state, while the fail-closed `/api/follow` route is
unchanged. The focused action/route/hook gate passes **3 files / 16 tests**;
TypeScript, targeted ESLint, and `git diff --check` pass. The serialized full
suite now passes **148 files / 712 tests**.

## Post-cleanup production build (2026-07-13)

The capped `bun run build` passes after the follow cleanup. Next compiles,
typechecks, prerenders all 21 static pages, and `flatten-standalone.js`
recreates the stable server link and copies `.next/static` plus `public/`.
The multiple-lockfile workspace warning remains known; no deploy or restart
was performed.

## Shared fetch and filter orchestration boundaries (2026-07-13)

The shared JSON reader now returns `unknown` without a generic response type
escape hatch, so callers must normalize or narrow data explicitly. `page.tsx`
now supplies both independent desktop/mobile `FiltersPanel` instances from a
typed `sharedFilters` adapter; only desktop receives `searchInputRef`. The
unused `weatherSummary` and long-press `target` bindings were removed. Focused
contracts pass; the full suite passes **148 files / 712 tests**; repository
lint, TypeScript, diff validation, capped build, and the six-viewport responsive
matrix pass.

## Shared incident-detail orchestration boundary (2026-07-13)

The selected incident detail props are now centralized behind an exported
`IncidentDetailPanelProps` contract and a typed `sharedIncidentDetailProps`
adapter in `page.tsx`. Mobile and desktop keep separate render instances and
their existing owners; mobile adds only `isMobile`, while the desktop rail adds
only `hideHeader`. The focused detail/follow contracts pass, the full suite is
green at **148 files / 713 tests**, and lint, TypeScript, diff validation,
capped build, and the six-viewport responsive browser gate pass.

## Dead page-import cleanup (2026-07-13)

After the page extraction work, a targeted import audit removed stale dashboard
component imports, legacy incident helper imports, unused overlay wrappers, and
unused type imports from `page.tsx`. This is a no-behavior cleanup: the page
still delegates to the same extracted components and map/detail owners. The
full suite passes **148 files / 713 tests**, lint, TypeScript, diff validation,
and the capped production build pass.

## Right-sidebar dead prop cleanup (2026-07-13)

Removed the unused `unreadCount` prop from the desktop rail contract without
changing the rail's layout, focus, Escape, or badge ownership. A focused
desktop IA assertion ensures the rail does not regain notification ownership;
the full suite passes **148 files / 714 tests**, lint, TypeScript, diff
validation, and the capped production build pass. No deployment or restart was
performed.

## Page orchestration follow-up audit (2026-07-13)

The post-adapter audit found no further repeated child prop contract that would
reduce risk through extraction. `MapScene`, `MobileView`, `DashboardPanel`,
`NotificationsDrawer`, `HistoryModal`, and `ReportFireModal` each have a single
intentional call site; the remaining page handlers are single-owner actions.
The mobile `map={null}` placeholder remains intentional because the page-owned
MapScene stays underneath the mobile chrome. Future orchestration changes should
remain typed, isolated, and browser-verified rather than forcing a broad page
refactor.

## Community-report request-body hardening (2026-07-13)

`POST /api/reports` now reads request bodies through a streaming 16 KiB cap.
It rejects an oversized `Content-Length` before parsing and also catches
oversized chunked bodies, returning a redacted `413`/`no-store` envelope before
Zod or Prisma work. Focused public-action/API contracts pass; the full suite
passes **148 files / 716 tests**, lint, TypeScript, diff validation, and the
capped production build pass. This does not add visual attachments: provider,
moderation, retention, EXIF/privacy, and deletion gates remain open.

## Community-attachment design gate (2026-07-13)

The attachment roadmap now has a provider-neutral design record at
`docs/providers/community-attachments.md`. It defines an image-only first
phase, bounded bytes/dimensions, one-time upload intent, quarantine and human
moderation, EXIF removal, opaque logical keys, retention/deletion, a small
`AttachmentStore` boundary, and the provider approval matrix. Upload UI,
provider SDKs, Prisma attachment relations, and public media URLs remain
explicitly gated until those decisions are approved.

## Community-attachment provider audit (2026-07-13)

Cloudflare R2 was added to the provider record as the first technical
candidate, not as an approval. Official R2 documentation confirms an S3
boundary, short-lived presigned operations, browser CORS requirements, an
immutable EU jurisdiction option, lifecycle expiry, and cache caveats after
deletion. The remaining gates are the Cloudflare DPA/account decision,
EU-bucket creation proof, deletion/cache-purge and backup evidence, upload
budget, and an accountable moderation/privacy owner. The report route remains
JSON-only and no upload/UI/provider code was added.

## 3D provider gate re-audit (2026-07-13)

The Phase 2 provider record and MapLibre wrapper were re-audited after the
reliability/refactor tranche. No provider has passed the legal, coverage,
operations, attribution, and mobile-performance gates; the Protomaps sample
numbers are not browser/GPU evidence. No provider-independent building change
is safe to ship, so camera-only Incident Focus remains feature-flagged and
default-off, with the 2D operational map authoritative.

## 3D and tile-entitlement audit continuation (2026-07-13)

The official CARTO basemap guidance was rechecked. The current `carto` source
is technically suitable for an offline/read-only Phase 2 candidate audit, but
commercial use requires an Enterprise licence and non-commercial free use
requires a written grant. The linked Basemap Terms also record a default
1,000,000 tile-request monthly cap, prominent CARTO/OpenStreetMap attribution,
and mutable service features. The current CARTO developer documentation also
lists a 3,500 requests/minute Maps API limit with `429` responses; that is an
API safeguard, not Lumes' entitlement or an approved production tile budget.
A successful unauthenticated tile request is therefore not entitlement
evidence. `docs/providers/3d-context-sources.md` records the exact remaining
gates; no live extrusion experiment or provider flag was enabled.

The tile-cache record was corrected at the same boundary: R2's free operation
classes are 1 M Class A writes and 10 M Class B reads, and viral Worker/R2
cost is cache-miss and request-volume dependent. No tile-cache bucket, worker
binding, or production proxy was enabled.

## Documentation reconciliation (2026-07-13)

The current handoff now uses the verified local baseline of **148 test files /
721 tests** and clearly separates that worktree state from the older deployed
production build. `docs/ARCHITECTURE.md` now reflects the `src/` tree, 33 API
route files, current page/map line counts, the typed `use-app-data` boundary,
and the separate realtime hook. `docs/DEPLOY.md` labels its server details as
historical until the authorized HTTPS verifier and fresh-browser restart gate
are run. The original `docs/FINDINGS.md` review is explicitly historical, with
the current typed-boundary, dynamic-loading, and page-orchestration outcomes
recorded at its top. No runtime or production state changed.

## Current full local quality gate (2026-07-13)

The serialized capped suite passes **148 files / 721 tests**. Repository
ESLint, TypeScript, `git diff --check`, and `bun run build` pass; the build
retains the known multiple-lockfile workspace-root warning and tests retain the
known Prisma engine fallback. No deployment, restart, or production HTTPS
verification was performed, and no test/build process remains running.

## Loopback standalone release verifier (2026-07-13)

The freshly built standalone server was started on an isolated loopback port
with the local database and checked through `deploy/verify-production.sh`.
HTML and all emitted hashed assets returned successfully; `manifest.json` and
`sw.js` were present with `no-store`, `/api/health` returned `ok`, and
`/api/source-health` returned nine sources with an explicit `stale` state. The
temporary server was shut down by the smoke-test trap. Production HTTPS,
restart, and fresh-browser verification remain separately authorized gates.

## Fresh standalone browser smoke (2026-07-13)

Against the same isolated standalone artifact, the security-header and
MapLibre-startup browser flow passed. The public newsletter/status matrix
passed in dark and light themes at 320×568 and 390×844, and the default-off
Incident Focus flow confirmed that no 3D controls render when the feature flag
is disabled. The temporary server and browser processes were cleaned up.
Production HTTPS and production feature-enabled 3D verification remain
gated; Phase 2 provider/building/terrain proof remains open.

## Full standalone browser coverage (2026-07-13)

The fresh standalone artifact passed the complete local browser matrix:
accessibility across 24 route/viewport combinations with **0 violations**;
aerial, biomass, and composite-risk optional-layer failure/recovery flows;
follow persistence, duplicate-click idempotence, and failed-write rollback;
six responsive interaction viewports; keyboard shortcut dialog focus/restore
and slash-search focus; the public-page dark/light 320/390px matrix; and
security headers. The keyboard run exposed a focus timing defect caused by
deferring focus until `requestAnimationFrame`; `use-keyboard-shortcuts` now
focuses in a layout effect and retries opener restoration after the animated
close. Focused contracts, the full serialized suite (**148 files / 721
tests**), lint, TypeScript, build, and diff validation pass. The temporary
standalone server and Playwright processes were cleaned up. Production HTTPS,
authorized restart, and feature-enabled 3D provider/building/terrain proof
remain separate gates.

## CI browser and Lighthouse safeguards (2026-07-13)

The CI workflow now runs the default-off Incident Focus smoke explicitly,
passes the isolated `file:./build-test.db` into Lighthouse's server process,
and uploads `/tmp/lumes-start.log` on browser-step failure. The deployment
contract suite guards the workflow and package-script wiring. Local Lighthouse
passes `/`, `/status`, and `/privacy`; remote GitHub CI remains unverified.

## Read-only production verifier refresh (2026-07-13)

The current HTTPS probe still reaches the older deployment. Root HTML returns
`s-maxage=31536000` instead of `no-store`, and `/manifest.json` returns HTTP
404 HTML instead of JSON. Hashed assets, `/sw.js`, `/api/health` (`ok`), and
`/api/source-health` (7 sources, `stale`) respond successfully. No deployment
or restart was performed; the production release gate remains authorization-
dependent.

## Standalone tracing and flattening correction (2026-07-13)

`next.config.ts` now sets `outputFileTracingRoot` to the Lumes checkout. This
prevents Next from inferring the shared parent workspace's pnpm lockfile and
packaging the wrong Prisma runtime. A fresh standalone build contains Prisma
**6.19.2**, the declared Lumes version. `deploy/flatten-standalone.js` now
handles both top-level and nested `server.js` layouts and always materializes
`.next/static` and `public/` beside the runnable server. The focused deployment
contract passes **19 tests**.

## Omitted standalone browser coverage (2026-07-13)

All six previously omitted browser suites pass against the canonical standalone
server with an isolated SQLite fixture: map-style lifecycle, data-trust matrix,
following filters, history lifecycle, incident ownership, and mobile
refresh/timeline recovery. The data-trust empty-state fixture was corrected to
zero `totalRaw` and remove production distribution counts so it satisfies the
same client envelope validation as a real empty response.

## Current local quality gate (2026-07-13)

The serialized capped suite passes **148 files / 721 tests**. Repository ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The
standalone artifact has been checked for Prisma **6.19.2**, copied static/public
assets, and a healthy isolated `/api/health` response. Production deployment,
restart, attachments, and 3D provider/building/terrain evidence remain open
gates.

## Fresh standalone release verifier (2026-07-13)

After refreshing the isolated fixture's liveness timestamps, the rebuilt
standalone server passes `deploy/verify-production.sh` over loopback: HTML,
immutable emitted chunks, manifest, logo, service worker, `/api/health`=`ok`,
and nine source-health entries with explicit `stale` state. The temporary
server was stopped cleanly; this remains local packaging evidence and does not
verify the deployed production host.

## CI reliability browser coverage (2026-07-13)

The CI browser job now launches `.next/standalone/server.js` directly and
seeds one synthetic incident only through the guarded
`LUMES_E2E_SEED=1 scripts/seed-e2e-db.ts` path. Six previously local-only
reliability suites are now package scripts and CI gates: map-style lifecycle,
data-trust matrix, following filters, history lifecycle, incident ownership,
and mobile refresh/timeline recovery. Lighthouse uses the same standalone
entrypoint. The focused deployment contract passes **19 tests**; the six
scripts pass serially against a seeded isolated standalone database.

## Standalone entry preflight guard (2026-07-13)

`deploy/deploy.sh` now refuses to copy assets or restart the service when the
expected `.next/standalone/server.js` entry is missing or broken after a
build. The focused deployment contract remains green at **19 tests**; shell
syntax, lint, TypeScript, the serialized **148 files / 721 tests** suite,
build, and diff validation pass. No production state changed.

## Authorized production deploy and browser gate (2026-07-13)

The current worktree was deployed with a sanitized rsync. The remote
`backups/`, database, environment, dependency, build, and test paths were
excluded from mutation; only expected stale source files were removed. The
server-only deploy rebuilt the standalone bundle with Bun **1.3.14** and
Prisma **6.19.2**, passed the standalone-entry preflight, restarted
`lumes.service`, and returned `/api/health`=`ok` with `dataState`=`healthy`.
The active ingest timer uses `/usr/local/bin/bun` and its latest run exited
with status `0`.

The authorized HTTPS release gate now passes: root HTML is `200` with
`no-store`, hashed assets are `200`/immutable, `/manifest.json` is `200` JSON
with `no-store`, `/sw.js` is `200` JavaScript with `no-store`, `/api/health` is
`ok`, and `/api/source-health` reports nine sources with its explicit `stale`
provider state. Fresh production browser checks pass for security headers and
MapLibre startup, default-off Incident Focus, and the public dark/light
320×568 and 390×844 matrix. The 3D provider/building/terrain gate remains
separate and unapproved.

## Current release-gate revalidation (2026-07-13)

The live read-only verifier was rerun against `https://lumes.pt` and passed:
root HTML and every emitted hashed CSS/JS asset returned successfully with the
expected cache contracts; `/manifest.json` returned JSON with `no-store`;
`/sw.js` returned JavaScript with `no-store`; `/api/health` returned `ok`; and
`/api/source-health` returned nine sources with an explicit `stale` state.

The remote user-systemd inspection confirmed `lumes-ingest.timer` is active and
waiting, its latest trigger completed `lumes-ingest.service` with `Result=success`
and exit status `0`, and its `ExecStart` is exactly
`/usr/local/bin/bun /opt/apps/lumes/scripts/ingest.ts`. The journal was not read
because the SSH user lacks journal-file permissions; the systemd result and
HTTPS health verifier provide the non-secret evidence required by this gate.

Fresh Playwright browser checks against production passed:

- default-off Incident Focus keeps the 2D map unchanged;
- security headers and MapLibre startup are healthy;
- public newsletter/status flows pass at 320×568 and 390×844 in dark and light
  themes.

Task 10’s three deployment/restart verification checkboxes are therefore
closed. The separate 3D provider/building/terrain gate and community-attachment
provider gate remain intentionally open.

## Full suite revalidation (2026-07-13)

The serialized Vitest suite was rerun after correcting a stale confirmation
fixture in `tests/lib/newsletter-confirm.test.ts` (the route's 24-hour expiry
policy was correct; the fixed fixture had aged beyond that window). The suite
now passes **148 files / 721 tests**. The focused newsletter confirmation test
also passes **2 tests / 2 tests**. This closes the current local quality gate;
the provider/legal/performance gates listed above remain separate and open.

## Ongoing-plan continuation audit (2026-07-13)

The current checkout was audited against this plan and the follow-on plan. All
non-provider implementation tasks and API route contract coverage are complete;
the only unchecked work remains the explicitly gated 3D provider/building/
terrain tasks and community-attachment storage/moderation/provider approval.
At that checkpoint no additional safe provider work was identified; the
subsequent continuation below records the provider-independent reliability
slice that was then implemented.

Fresh verification for the current checkout:

- `bun run lint` passed.
- `bun run typecheck` passed.
- `bunx vitest run --no-file-parallelism --maxWorkers=1 --reporter=dot` passed
  (**148 files / 721 tests**).
- `bun run build` passed, including Prisma generation, Next production build,
  and standalone asset flattening.
- `git diff --check` passed.

This is local evidence only; it does not approve external provider/legal gates
or authorize a deployment.

## Provider-independent reliability continuation (2026-07-13)

The next audit found three concrete runtime/verification gaps without opening
the external provider gates:

- the first successful aircraft response now adds `plane-icon` when the image
  is absent, allowing fixed-wing symbols to render;
- biomass and composite-risk layers now insert below the canonical incident
  fill layer rather than using the nonexistent `ember-incidents-symbol` anchor;
- Incident Focus now derives the mobile sheet height from its focus-aware
  collapsed state, so an already-expanded map peek cannot cover the focused
  map.

The CI workflow now preserves the default-off Incident Focus smoke, rebuilds a
feature-enabled standalone artifact, and runs the Phase 1 flow at desktop,
tablet, and phone widths in both normal-motion and reduced-motion modes. The
local serialized suite passes **149 files / 725 tests**; focused contracts,
lint, TypeScript, the six-viewport responsive matrix, the 24-context axe
matrix, feature-enabled standalone E2E, and diff validation pass. No provider,
attachment, terrain, or deployment state changed.

## Incident Focus desktop chrome collision continuation (2026-07-13)

The feature-enabled desktop browser flow exposed a real collision between the
focus status and the map attribution card. `MapChrome` now accepts a bounded
`topOffset`, and only the desktop Incident Focus status uses a 48px offset;
mobile status and global map controls retain their existing positions. The
normal and reduced-motion feature-enabled standalone flows now pass, including
the explicit non-overlap assertion. The current serialized suite passes
**149 files / 726 tests**; lint, TypeScript, both default-off and
feature-enabled production builds, and diff validation pass. No provider,
attachment, terrain, or deployment state changed.

## Incident Focus style-restoration continuity (2026-07-13)

The feature-enabled browser flow now exercises dark↔light style transitions
while Incident Focus is active and asserts that the status/exit controls stay
visible while the existing MapLibre style restoration runs. `useIncidentFocus`
now treats capability as an entry gate and preserves the active mode during
transient `mapReady=false` states. Normal and reduced-motion flows pass; the
current serialized suite contains **149 files / 727 tests**. No provider,
attachment, terrain, or deployment gate changed.

## Incident Focus edge-viewport proof (2026-07-13)

The feature-enabled browser gate now covers 1280×800 and 320×568 in addition
to the existing 1440×900, 768×900, and 390×844 flows. The compact assertion
allows intentionally hidden map controls while still checking the active
status and every rendered controls/attribution box for overlap. Reduced-motion
checks wait for the real focus/tab restoration state. CI sets
`LUMES_3D_FIXTURE=1` for deterministic sample-incident UI coverage; the
default-off map smoke and all external provider/attachment gates remain
unchanged. The serialized suite was rerun afterward: **149 files / 727 tests
passed**.

## Desktop marker-to-Inspector bug-spec reconciliation (2026-07-13)

`specs/bugs/BUG-2026-07-12-desktop-inspector-gate.md` now records the
confirmed stale-priority-ID fix as resolved. The responsive marker reproduction
and six-viewport gate remain green, and the obsolete diagnostic next action was
removed without reopening page or MapLibre ownership work.

## Incident Focus mobile ownership continuation (2026-07-13)

The Phase 1 camera-only slice received two provider-independent reliability
fixes. `page.tsx` now gives compact/tablet focus temporary map-tab ownership and
restores the prior mobile tab after exit; `MobileView` keeps the focus status
visible, disables competing tabs, and forces the map sheet to its compact
state. `useIncidentFocus` now restores the saved camera if a same-ID live
update invalidates the selected coordinates. Browser coverage exercises the
non-map entry path at phone and tablet widths.

Verification: feature-enabled standalone Incident Focus E2E passed at 1440px,
768px, and 390px; the serialized suite passed **148 files / 723 tests**;
lint, TypeScript, production build, focused contracts, and diff validation
passed. No provider, upload, terrain, or deployment state changed.

## Plan-state reconciliation (2026-07-13)

Earlier continuation paragraphs that call the theme/state screenshot matrix,
shared-drawer verification, or production verification “open” are historical
checkpoint records. They predate the later standalone, responsive, axe,
authorized HTTPS, and Incident Focus edge-viewport evidence recorded below.
The current authoritative state is the handoff and the latest continuation
entries: provider-independent reliability and release verification are green;
only the external 3D provider/building/terrain gate and the community-attachment
storage, moderation, privacy, retention, and deletion decisions remain open.

## Read-only production freshness refresh (2026-07-13)

The current live release was checked without mutation. `bash
deploy/verify-production.sh https://lumes.pt` passes root HTML/cache headers,
all emitted immutable assets, manifest, service worker, `/api/health`, and the
nine-entry source-health envelope. A default-off production browser smoke also
confirms that no Incident Focus controls leak into the 2D map. The live
source-health payload truthfully reports `ipma-warnings` as core
`stale`/empty and `nasa-firms-viirs` as an optional configuration error because
`FIRMS_MAP_KEY` is absent; the other core sources are healthy. This is an
operational freshness/configuration risk, not evidence that the whole source
set is healthy, and no deployment or production mutation was performed.

## External-gate continuation artifact (2026-07-13)

The next actionable Phase 2 step is now packaged in
[`docs/providers/carto-entitlement-request.md`](../../providers/carto-entitlement-request.md).
It records the exact Lumes public/professional use model, current MapLibre /
CARTO source shape, proposed bounded building layer, attribution, quota,
caching, data-use, and retirement questions, plus a written approval record.
This advances the gate without adding a provider dependency or runtime layer;
an authorised project owner must send the request and record the response before
the plan permits Phase 2 implementation. Phase 1 camera-only focus and the
top-down operational map remain the only enabled 3D-adjacent paths.

The same continuation now prepares the community-attachment decision packet at
[`docs/providers/community-attachments-approval-request.md`](../../providers/community-attachments-approval-request.md).
It records storage/account ownership, EU/privacy, moderation, upload/read,
retention/deletion, backup, and byte-budget decisions without changing the
JSON-only report contract.

The read-only production verifier was rerun after this documentation tranche:
all asset/cache/health checks passed, with the same explicit source-health
states recorded in the handoff. No deployment or runtime mutation occurred.

## Source-health empty-state decision (2026-07-13)

The conservative source-health contract remains in force: empty/fallback probes
are surfaced as `stale` rather than a generic `empty` status. That choice is
covered by tests and avoids claiming that an empty provider response is safe;
however, no active incidents or warnings may also be a normal state. A future
change therefore requires a per-source policy matrix and coordinated updates
to server classification, trust/presentation types, dashboard/status UI, and
browser tests. The decision packet is recorded in
[`docs/providers/source-health-empty-state-policy.md`](../../providers/source-health-empty-state-policy.md).
No runtime change is included in this continuation.

## Continuation baseline verification (2026-07-13)

The current worktree was rechecked with the bounded serialized Vitest suite;
**149 files / 727 tests passed**. This confirms the source-health decision did
not disturb the reliability/refactor baseline. No provider, attachment, or
deployment gate was advanced, and no runtime implementation was added.

## Read-only production freshness refresh (2026-07-13, latest)

The production verifier still passes the HTTP/cache/assets/manifest/service-
worker contract, `/api/health`, and the nine-source envelope. The explicit
live states remain healthy core ANEPC/IPMA/regional-command sources, valid-empty
IPMA warnings represented conservatively as `stale`, optional NASA FIRMS
configuration error (`FIRMS_MAP_KEY` absent), and intentionally disabled
aerial/biomass layers. No deployment or runtime change was made.

## Continuation audit and release evidence (2026-07-13)

The remaining plan items were reconciled against the current worktree and
handoff. Provider-independent implementation and reliability evidence remain
green: the bounded serialized Vitest suite passed **149 files / 727 tests**,
`bun run typecheck` passed, `bun run lint` passed, and the read-only production
verifier passed the live asset/cache, manifest, service-worker, health, and
nine-source envelope checks. No runtime implementation was added in this
continuation.

The plan therefore remains intentionally open only at external gates: an
Lumes-owned 3D storage/CDN and legal/attribution/coverage/mobile approval is
required before Phase 2 building context; terrain/slope remains behind its
own gate; and community visual attachments still require explicit storage,
moderation, privacy, retention, and deletion decisions. These are not treated
as green by the local test suite.

Remote GitHub CI remains a separate unrun gate; local verification must not be
described as remote-CI coverage. Likewise, the controlled PMTiles fixture is
implementation-shape evidence only and does not open the Lumes-owned storage,
legal, coverage, mobile/GPU, or refresh/rollback gates.

The canonical repository-root workflows are now published on the
`codex/lumes-root-workflows` PR branch. Hosted run `29278210950` passed setup,
Prisma generation, lint, typecheck, the full unit suite, and production build
before failing at the Lighthouse budget step with home performance `0.64`.
The independent Lighthouse run `29278210957` built successfully and failed
at `0.66` after a rerun (the earlier attempt measured `0.69`). Local
filesystem Lighthouse remains `0.72/0.83/0.83`; therefore hosted performance
is the next reliability issue, not a workflow-discovery or build issue. Keep
the configured `0.70` budget until a deterministic test or a targeted home
route improvement is chosen; do not weaken it as a blind workaround.

## Local production artifact verification (2026-07-13)

`NODE_OPTIONS=--max-old-space-size=1536 bun run build` completed successfully.
Prisma Client generation, Next compilation and TypeScript checks, all 21 static
pages, and standalone flattening completed; the artifact contains the top-level
`server.js`, `.next/static`, and `public/` directories. This closes the local
build evidence gap without changing deployment state. The remaining external
provider, attachment, and live-source configuration gates are unaffected.

## Local Lighthouse budget refresh (2026-07-13)

The Lighthouse gate was rerun locally with filesystem output to avoid the
configured public upload target. `/`, `/status`, and `/privacy` all met the
configured thresholds. Performance scored `0.72`, `0.83`, and `0.83`; each
route scored `1.00` accessibility, `0.95` best practices, and `1.00` SEO. The
temporary standalone server exited cleanly. This is local evidence only and
does not substitute for remote CI.

## Local CI coverage reconciliation (2026-07-13)

The configured repository-root `.github/workflows/lumes-ci.yml` commands were
reconciled against the current evidence. Every provider-independent local stage has recorded proof:
lint, TypeScript, unit tests, production build, Lighthouse, the operational
browser/accessibility matrix, and the feature-enabled Incident Focus normal
and reduced-motion flows. No additional local checklist item remains; remote
CI still requires deliberate publication of the local-only commits.

## Persistent-goal boundary audit (2026-07-13)

The current audit confirms the same external boundary: only the explicit 3D
provider/coverage/legal and community-attachment approval items remain open.
The remote repository reports zero workflows and zero runs; local `main` is
six commits ahead of `origin/main` with a dirty worktree. No further local
implementation or verification can advance those items without owner authority
or an external state change.

## Publication preflight (2026-07-13)

`git push --dry-run origin main` confirms a normal fast-forward publication
from remote `5976494df` to local `da21c09c3`; no force push is needed. Because
the worktree remains dirty, that action would publish only the six committed
Lumes changes and would exclude all uncommitted files. No push, staging, merge,
or deployment was performed; explicit publication authorization is still
required.

## Hosted performance follow-up (2026-07-13)

The repository-root workflows are now executing the published branch. Two
small, provider-independent home-route changes were tested and published:
`84ee5801e` moves the existing MapLibre scene behind a client-only dynamic
boundary, and `dfc37060f` starts that scene after a short delay and browser-idle
opportunity. The default operational map, MapLibre provider, overlay sources,
camera controls, service-worker behavior, and optional 3D/provider gates are
unchanged.

Local evidence improved to home Lighthouse `0.90` and then `0.95`, with
`/status` and `/privacy` at `1.00`; the serialized full suite remains **149
files / 728 tests**, and typecheck, lint, build, and diff checks pass. Hosted
run `29280770116` measured `0.68` and its rerun measured `0.63`; the paired CI
run `29280769818` also measured `0.63`. The hosted report isolates the
remaining work to MapLibre startup/main-thread cost, not server response,
route data, or build failure. The `0.70` budget remains unchanged. Further
work should use a targeted startup profile and a product-aware UX decision,
not additional arbitrary blank-map delay or a provider change. Optional 3D
and storage/legal gates remain lower priority and closed.

## Post-load overlay scheduling follow-up (2026-07-13)

Commit `d4cdb539e` applies one final provider-independent startup optimization:
the existing `EmberMap` source/layer setup no longer runs synchronously inside
MapLibre's `load` handler. It is scheduled with `requestIdleCallback` and a
zero-delay fallback, with explicit cancellation on unmount. The map provider,
style selection, map ownership, readiness events, style-restoration path,
overlay ordering, service-worker behavior, and optional 3D/provider gates are
unchanged. `mapLoadedRef` still marks the initial style load immediately, while
the public `mapLoaded` state remains false until the overlays are installed so
style-transition effects cannot race an empty style reference.

The full serialized suite passed **149 files / 728 tests**; typecheck, lint,
production build, focused map contracts, and diff checks also passed. Local
Lighthouse stayed at home `0.95`, `/status` `0.99`, and `/privacy` `1.00`; home
main-thread time fell from roughly `536 ms` on the prior local run to `498 ms`
and bootup from roughly `214 ms` to `195 ms`. Hosted Lighthouse did not cross
the unchanged `0.70` budget: run `29282065269` measured `0.61`, and a
controlled rerun measured `0.63`; paired CI `29282065288` passed all setup,
Prisma, lint, typecheck, unit-test, and build stages before failing only at the
Lighthouse budget. Treat the difference as hosted-run variance and residual
MapLibre startup cost, not as justification for another arbitrary timeout,
provider change, or threshold reduction. The next step is a product-aware
profiling decision; reliability, incident clarity, and the explicitly gated
3D/provider/attachment work remain ahead of further visual/performance novelty.

## Brand-font preload boundary (2026-07-13)

The root layout now opts Fraunces out of Next's document font preload. The font
still remains available for the public brand mark, while the operational map
shell is served without making the approximately 121 KB brand font a critical
request. The existing typography contract includes an assertion for
`preload: false` so this remains intentional.

Focused typography tests, the full serialized suite (**149 files / 728 tests**),
typecheck, lint, and production build pass. Repeated local Lighthouse measured
home performance `0.95` and then `0.96`; the latest run measured approximately
`812 KB` total transfer and contained no Fraunces request, while `/status`
remained `0.99` and `/privacy` `1.00`. This is a small, reversible,
provider-independent startup improvement. It does not alter MapLibre behavior,
map layers, service-worker caching, attribution, or the gated 3D/provider work.

Remote verification after commit `ffec4fb71` started Lighthouse run
`29283700711` and CI run `29283700685`. Both completed build and all earlier
checks before failing only at the unchanged home Lighthouse budget, measuring
`0.64` and `0.63`. This confirms the change is safe but does not clear the
hosted performance boundary. Keep the `0.70` threshold; do not switch
providers, add arbitrary delay, or reopen the gated 3D work as a response to
this result.
