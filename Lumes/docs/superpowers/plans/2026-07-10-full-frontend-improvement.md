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

- [ ] Write a failing contract test that asserts the root layout exposes one UI font and one data font, app headings do not use `font-display`, and no source component uses `text-[9px]` or `text-[10px]` for body content.
- [ ] Run `bunx vitest run tests/lib/typography-contract.test.ts`; capture the current failures caused by Fraunces and sub-12px text.
- [ ] Replace the current application-wide display treatment with IBM Plex Sans for UI headings/body and IBM Plex Mono for counts/timestamps; keep Fraunces only on the brand mark if it remains visually useful.
- [ ] Add `--font-ui`, `--font-data`, `--type-body`, `--type-secondary`, and `--type-meta` tokens in `globals.css`; replace repeated arbitrary sizes in touched components with these tokens.
- [ ] Update `docs/DESIGN.md` with the typography scale, fallback behavior, and Portuguese diacritic requirements.
- [ ] Run the focused test, `bun run typecheck`, and `bun run lint`; expected result is PASS with no new font family loaded by unrelated routes.

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

- [ ] Write failing tests for closed/open Explore insets, phone sheet bottom inset, and the invariant that map-control rectangles cannot occupy the drawer rectangle.
- [ ] Implement `deriveMapChromeInsets()` with wide closed right inset 48px, wide open right inset `48 + drawerWidth + 16`, compact drawer inset `drawerWidth + 16`, and phone bottom inset `sheetHeight + safeAreaBottom`.
- [ ] Implement `MapChrome` with four explicit regions: status, navigation controls, legend, and playback. Pass the computed inset to each region rather than using independent `right-3`, `right-6`, or `bottom-28` offsets.
- [ ] Change `RightSidebar` to publish its open state and width through the shell; keep z-index order map 0, chrome 10, rail 20, drawer 30, blocking modal 40.
- [ ] When available map width is below 500px, collapse the legend to severity-only and hide nonessential playback controls; never render them underneath Explore.
- [ ] Add browser assertions at 1280×800 and 1440×900 that opening Explore leaves at least 500px of visible map and no map chrome bounding box intersects the drawer.
- [ ] Run focused unit tests, responsive browser tests, and an image review in dark/light themes.

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

- [ ] Write failing tests proving a missing FIRMS key leaves headline trust fresh when ANEPC and IPMA are healthy, while a failed ANEPC source produces a retryable headline state.
- [ ] Classify ANEPC incidents, IPMA risk/weather/warnings, and regional commands as core; classify FIRMS, OSM stations, aerial, biomass, and experimental layers as optional.
- [ ] Return source-specific `dataState` and tier from `/api/source-health`; keep optional errors actionable in Explore without poisoning the Situation headline.
- [ ] Render headline trust as “updated”, “stale”, or “retrying” only for core data; render optional layer warnings as “Satellite unavailable” or “Stations using fallback”.
- [ ] Add source timestamps for observed versus received data and expose both in the inspector trust row.
- [ ] Verify healthy-core/optional-error, stale-core, empty, and retryable screenshots in PT/EN.

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

- [ ] Write failing tests for `---`, blank, and whitespace-only localities; expected title fallback is municipality, then district, then localized “Unnamed incident”.
- [ ] Write tests proving a `contained` incident is not counted as active and that visible/active/contained/resolved counts are independent.
- [ ] Implement presentation normalization without changing the persisted schema or public API shape.
- [ ] Replace “active fires” copy with the correct count label in Situation, MapPeek, status pills, and mobile navigation.
- [ ] Show a compact observed/received freshness pair when the two timestamps differ by more than two minutes.
- [ ] Verify Portuguese and English labels, long municipality names, and no sentinel strings in screenshots.

### Task 5: Rework the map visual hierarchy and layer legend

**Files:**
- Modify: `src/components/overlays/legend.tsx`
- Modify: `src/components/mobile/mobile-legend.tsx`
- Modify: `src/components/ember-map.tsx`
- Modify: `src/components/map/map-chrome.tsx`
- Modify: `src/components/filters/filters-panel.tsx`
- Create: `tests/lib/map-layer-legend.test.ts`

- [ ] Write tests that incident severity, satellite, community, evacuation, and fire-risk legends remain separate and that a disabled layer is not shown as active.
- [ ] Make the default legend show only incident severity and current visible count; move layer-specific explanations into Explore’s Layers tab.
- [ ] Reduce persistent legend width and remove repeated borders/uppercase sections; retain one expandable “What the map shows” explanation.
- [ ] Add explicit layer availability states: healthy, unavailable, fallback, and disabled. FIRMS missing configuration must not render an empty-looking layer.
- [ ] Keep marker colors distinct from fire-risk colors and include a non-color shape/text cue for critical incidents.
- [ ] Verify legend placement against map insets at all target viewports and with Explore open.

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

- [ ] Write a browser assertion that live-restored feedback does not overlap the map status pill, controls, legend, or drawer trigger.
- [ ] Move restore/error feedback to a compact status region below the count pill or a short-lived toast with a maximum width and safe-area-aware offset.
- [ ] Ensure only the topmost blocking overlay handles Escape and focus returns to its opener after close.
- [ ] Make report, follow, share, and retry actions expose pending, success, failure, and unavailable states without optimistic claims when persistence is disabled.
- [ ] Add browser coverage for marker → inspector, list → inspector, Explore → close, nested detail → close, and failure rollback flows.

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

- [ ] Keep tablet’s top toolbar but ensure its labels and drawer never cover map status or map controls.
- [ ] Keep phone’s 56px summary collapsed state and 52vh expanded state; remove analytics from the phone Incidents destination.
- [ ] Ensure incident sheet content has one scrolling owner and bottom-navigation safe-area padding.
- [ ] Add empty, stale, fallback, and optional-layer-unavailable states to MapPeek and Incidents.
- [ ] Verify 320×568, 390×844, 768×1024, and 1024×768 landscape for clipping, overlap, drag, tab, dismissal, focus return, and reduced motion.

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

- [ ] Keep explicit Portuguese-only public-route behavior until route-level locale negotiation exists; ensure `<html lang="pt-PT">` and all confirmation pages agree.
- [ ] Use the same 65–75ch reading measure, tokenized status indicators, and responsive source rows on status/newsletter/privacy.
- [ ] Add browser coverage for newsletter validation, provider unavailable, pending confirmation, retry, and non-mutating unsubscribe GET.
- [ ] Verify keyboard navigation, focus return, reduced motion, color contrast, and text scaling at 320px and 390px widths.

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

- [ ] Inventory page/map `any` casts and replace only the touched boundary with typed adapters.
- [ ] Extract `HomeShell` for layout ownership and `MapDataAdapter` for layer feature conversion without moving query state into map components.
- [ ] Lazy-load optional aerial, biomass, and advanced analytics data only when their layer or Explore section opens.
- [ ] Keep core incident fetch and map shell on the critical path; verify no core data regression.
- [ ] Preserve immutable cache headers for hashed assets and no-store for HTML, APIs, service worker, and manifests.
- [ ] Run Lighthouse before/after and keep home LCP at or below the current ~1.9s baseline, with performance score at least 0.70.

### Task 10: Release verification and deployment gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `deploy/deploy.sh`
- Modify: `docs/DEPLOY.md`
- Create: `tests/lib/deploy-contract.test.ts`

- [ ] Add a deployment contract test asserting the deploy script copies `.next/static` into `.next/standalone/.next/static` and `public` into `.next/standalone/public`.
- [ ] Keep test files, local databases, `.env*`, and build artifacts out of rsync payloads.
- [ ] Run the clean-runner sequence: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, Playwright install, axe, responsive tests, and Lighthouse.
- [ ] Before any authorized deployment, verify exact CSS/JS asset URLs, `/sw.js`, `/manifest.json`, `/api/health`, and source-health status over HTTPS.
- [ ] Confirm scheduled ingest uses `/usr/local/bin/bun`, completes successfully, and leaves `/api/health` healthy.
- [ ] Perform a fresh-browser smoke test after restart and record the deployment result without logging secrets.

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

