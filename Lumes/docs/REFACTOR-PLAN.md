# Lumes.pt — Refactor & Improvement Plan

**Date**: 2026-07-06
**Status**: Plan (post full review)
**Scope**: Visual review (desktop + mobile + tablet), functional review (every clickable surface), backend audit, file-size analysis, dependency mapping, **design & UX critique**.

> **Historical baseline:** This document records the July 6 review and its
> findings as they were observed then. Current implementation status and later
> verification belong to `docs/superpowers/plans/2026-07-10-full-frontend-improvement.md`
> and `docs/HANDOFF.md`; entries such as the dashboard 500, mobile overlap,
> and failed marker clicks must not be read as current-state claims without a
> fresh verification run.

---

## 0. TL;DR

Lumes.pt is **functional and live** with 31 API routes, 19,689 lines of TypeScript, and a 4-pronged data pipeline (ANEPC, IPMA, ADS-B, NASA FIRMS). The deployment is stable on Netcup Debian 13.

**Does it work?** Yes. 11/11 dashboard interactions verified.
**Does it look good?** It's a functional operational dashboard — not a polished consumer product. Information density is high (good for operators) but visual hierarchy is weak.

**The biggest issues**:

1. **🔴 Map fire markers don't open the IncidentDetailPanel** (user-reported, confirmed via Playwright — 6/6 marker clicks failed).
2. **🔴 `/api/dashboard` returns HTTP 500** in production.
3. **🟠 i18n typo** — "conselhos" (advice) instead of "concelhos" (municipalities). Visible in PT detail panel.
4. **🟠 No error boundary** — one undefined crashes the entire page (already happened twice).
5. **🟠 Mobile is broken** — header overlaps map labels, brand bleeds through, top-bar buttons overflow.
6. **🟠 `/api/regional-commands` returns 11.4 MB** uncompressed (no caching).
7. **🟡 Brand double-displayed** — "Lumes" appears in both top header AND dashboard header.
8. **🟡 Visual hierarchy is weak** — counter cards waste space, sections lack separation, no display font for brand.
9. **🟡 `page.tsx` is 4,158 lines** — unmaintainable god component.

---

## 1. Findings (bug + design inventory)

### 1.1 Critical bugs (P0 — must fix this week)

| ID | Finding | Severity | Confirmed via |
|----|---------|----------|---------------|
| **F-01** | **Map fire markers (flame icons) don't open the IncidentDetailPanel when clicked.** `map.on("click", onClick)` is wired but `queryIncidentFeatures(e.point)` returns nothing for actual click coordinates. | 🔴 Critical | Playwright — 6/6 marker positions failed |
| **F-02** | **`/api/dashboard` returns HTTP 500 `{"error":"fetch failed"}`** in production. Self-fetches `http://localhost:${PORT}/api/incidents` which fails in containerized environments. | 🔴 Critical | `curl /api/dashboard` returns 500 |
| **F-03** | **i18n typo `conselhos` → should be `concelhos`**. Visible in PT sidebar: "Fire Risk (IPMA) 278 conselhos". | 🔴 Critical | Screenshot review |
| **F-04** | **No error boundary in app.** Already hit twice (`showAerial is not defined`, `resourceFilter is not defined`). When a component throws, entire app blanks. | 🔴 Critical | Source-code audit + past build errors |
| **F-05** | **Mobile header overlap** — Brand "Lumes WILDFIRE INTEL" text bleeds through behind map labels (Vigo visible). Hamburger overlaps brand. Top-bar buttons overflow. | 🔴 Critical | Mobile screenshot at 390px |
| **F-06** | **Brand double-displayed** — "Lumes WILDFIRE INTEL" appears in both top header AND dashboard header. Confusing. | 🔴 Critical | Desktop screenshot |

### 1.2 High bugs (P1)

| ID | Finding | Severity |
|----|---------|----------|
| **F-07** | **`/api/regional-commands` returns 11.4 MB uncompressed** GeoJSON (5 MultiPolygons, full precision). No caching, no compression. | 🟠 High | ✅ DONE (11.4 MB → 652 bytes; geometry opt-in) |
| **F-08** | **News section in right sidebar below the fold** — `NEWS` tab requires scrolling past `REPORT FIRE` button. Critical "matched" fire news is invisible. | 🟠 High |
| **F-09** | **`Post` model in Prisma schema is dead code** — never referenced. | 🟠 High |
| **F-10** | **Many `(i as any).rawProperties` casts** in page.tsx — type contract leaking. | 🟠 High |
| **F-11** | **Operational phases incomplete** — only 4 phases shown (`Em Conclusão/Resolução/Despacho/Curso`), missing `Vigilância`, `Conclusão`, `Encerrada` when present in data. | 🟠 High |

### 1.3 Functional / UX bugs (P2)

| ID | Finding | Severity |
|----|---------|----------|
| **F-12** | **Sidebar (right) doesn't scroll gracefully** — `Notifications` partly clipped at bottom. No scroll indicator. | 🟡 Med |
| **F-13** | **"X incidents" attribution pill** is tiny (85×24px), no tooltip, no click action. | 🟡 Med |
| **F-14** | **PT/EN toggle flashes wrong text on first render** — uses `useLanguage()` which returns "pt" default but visible English until hydration. | 🟡 Med |
| **F-15** | **Active filter chips missing** — clicking "Critical only" doesn't show a visible summary in top-bar. | 🟡 Med |
| **F-16** | **Map zoom controls cramped** (36×36px), no labels, stacked. Hard to tap on mobile. | 🟡 Med |
| **F-17** | **Counter cards waste space** (160×68px) — icon in corner is 8px, value text is small. | 🟡 Med |
| **F-18** | **No aria-label on icon-only buttons** (zoom, theme, locate) — accessibility violation. | 🟡 Med |
| **F-19** | **Light mode toggle produces same dark UI** — `next-themes` wired but classes not applied. | 🟡 Med |
| **F-20** | **No loading skeletons** for dashboard counters — page shows 0s then jumps to numbers. Jarring. | 🟡 Med |
| **F-21** | **Left and right sidebars look too distinct** — different top padding (left starts at y=94, right at y=14), different section header treatments (left has icon+title+subtitle, right just timestamp), different borders, different vertical rhythm, different fonts. They should feel like mirror twins of the same design system. | 🟠 High |

### 1.4 Backend / API bugs (P2)

| ID | Finding | Severity |
|----|---------|----------|
| **F-21** | **In-memory caches scattered across routes** with inconsistent TTLs (60s vs 5min vs 6h vs 24h). No central cache abstraction. | 🟡 Med |
| **F-22** | **No API input validation** (zod/schema) on POST endpoints. `/api/reports`, `/api/follow`, `/api/newsletter/*` accept arbitrary input. | 🟡 Med | ✅ DONE (`src/lib/api/schemas.ts`; applied to /api/follow) |
| **F-23** | **No rate limiting** anywhere. | 🟡 Med |
| **F-24** | **`/api/satellite` falls back to fake data when `FIRMS_MAP_KEY` unset** — should return 503. | 🟡 Med |
| **F-25** | **No request tracing / structured logs** for API failures. | 🟡 Med |

### 1.5 Code organization (P3 — refactor)

| ID | Finding | Lines | Severity |
|----|---------|-------|----------|
| **F-26** | `src/app/page.tsx` is a god component | 4,158 | 🟢 Smell |
| **F-27** | `src/components/ember-map.tsx` is monolithic | 1,356 | 🟢 Smell |
| **F-28** | `src/components/ui/*` has 30+ unused shadcn primitives | ~30 files | 🟢 Smell |
| **F-29** | `src/lib/sample-data.ts` is 658 lines, mostly dead fallback | 658 | 🟢 Smell |
| **F-30** | 14 useLiveData hooks, all duplicating fetch/cache logic | 628 | 🟢 Smell |
| **F-31** | 30+ useState hooks in page.tsx — no state-management layer | — | 🟢 Smell |

---

## 2. Design & UX critique

### 2.1 Honest assessment

Lumes.pt looks like a **functional operational dashboard**, not a **polished consumer product**. Compared to industry references (Watch Duty, CalFire, NASA FIRMS, Fogos.pt):
- ✅ Strong color system (orange accent + severity colors)
- ✅ Cohesive dark-mode palette
- ✅ Information density is high (good for operators)
- ✅ Severity color coding is consistent across panels
- ❌ Weak visual hierarchy
- ❌ No brand personality (generic flame icon)
- ❌ No display typography
- ❌ No empty states, no loading skeletons, no success animations
- ❌ Mobile is broken
- ❌ Counter cards waste space
- ❌ Sections lack visual separation

### 2.2 Pixel-by-pixel critique

#### LEFT DASHBOARD PANEL

| Element | Status | Issue |
|---------|--------|-------|
| Brand header "Lumes WILDFIRE INTEL" | 🟠 | Double-displayed (also in top header). Wastes vertical space. |
| "Situational Awareness / Live overview · Portugal" | 🟠 | Redundant with LIVE indicator. Adds visual noise. |
| Counter cards (Total/Active/Critical/High) | 🟡 | 160×68px cards with small numbers + 8px icons. Wasted space. |
| "1279 PERSONNEL" resource cards | 🟡 | Inconsistent sizing with counters. Icons tiny, labels in EN when lang=pt. |
| Operational phases bar chart | 🟢 | Works well visually. Clear color hierarchy. |
| PRIORITY/RECENT/ALL tabs | 🟡 | Active state too subtle. Thin underline. |
| VILAR priority card | 🟡 | "👤 62" tiny personnel icon unlabeled. |
| Section dividers | 🟠 | Live Incidents → Resources → Phases → Priority blend together with only thin uppercase labels. |
| SYSTEM HEALTH 6/7 progress bar | 🟢 | Good visual indicator. |
| Incident History 2,126 | 🟢 | Clear CTA affordance. |

**Critical fix**: Deduplicate brand. Remove Lumes wordmark from dashboard header. The brand lives in the top header — keep it there once.

#### MAP (CENTER)

| Element | Status | Issue |
|---------|--------|-------|
| "7 incidents" attribution pill | 🟡 | Tiny (85×24px), no action affordance. Could be filter button. |
| Map zoom controls (+, -, locate) | 🟠 | Tiny (36×36px). Hard to tap on mobile. No labels. Stacked. |
| Legend panel | 🟠 | Large (~125×400px). Duplicates Fire Risk content from right sidebar. |
| Fire markers (🔥 emoji) | 🟡 | Playful but inconsistent: some markers show number "2" (cluster), others show flame. Mixed visual language. |
| Map data loading | 🟠 | First load shows blank dark area briefly. No skeleton. |
| Fly-to animation | 🟡 | Subtle. No visible feedback. |

**Critical fix**: Move legend to a collapsible bottom-left position (currently mid-left). Resize zoom controls to 44×44 with labels.

#### RIGHT SIDEBAR

| Element | Status | Issue |
|---------|--------|-------|
| "16:38" timestamp alone | 🟡 | Orphaned. Could be paired with date. |
| Quick Stats (Following/Tracked/Snapshots/Sources) | 🟠 | Not clickable but look like they should be. Big numbers = cards. |
| "FIRE RISK (IPMA) 278 dist" | 🟠 | "dist" abbreviation isn't translated. Should be "conc" (concelhos). |
| Color dots + bar charts for fire risk levels | 🟢 | Readable, takes a lot of vertical space. |
| Conditions cards (27° / 38% / 33 KM/H) | 🟡 | Three big cards with redundant icon + label + value + sublabel. Crowded. |
| MAP LAYERS / Fire Risk / Fire Stations / Satellite | 🟡 | Many separate rows. "Enable to load" sublabel is hacky. |
| No scroll indicator | 🟠 | Sidebar overflows below fold with no visual hint. |
| Notifications + REPORT FIRE button | 🟠 | Notifications at bottom is partly clipped. REPORT FIRE button competes with primary actions. |

**Critical fix**: Make Quick Stats clickable (Following → opens followed list, Tracked → opens history, Sources → opens data sources). Add scroll indicator.

#### TOP HEADER (page header)

| Element | Status | Issue |
|---------|--------|-------|
| Lumes brand in header + dashboard | 🔴 | DOUBLE BRANDING. |
| Bell, help, theme, PT/EN buttons | 🟡 | Tiny (36-97px). PT/EN button wraps awkwardly with / between. |
| Notifications badge "3" | 🟠 | Has no popover on click. Or click doesn't open anything obvious. |
| PT/EN toggle | 🟡 | Better than before (has globe icon), but still feels tacked-on. Could be a more prominent language pill. |

**Critical fix**: Remove brand from dashboard header. Redesign top-bar buttons as a unified toolbar group.

#### DETAIL PANEL (VILAR example)

| Element | Status | Issue |
|---------|--------|-------|
| VILAR title + location pin | 🟢 | Clear. |
| "ACTIVE \| SEVERITY: CRITICAL \| 2H AGO" | 🟡 | Pipe-separated metadata looks like spreadsheet, not polished UI. |
| "91% CONFIDENCE" + "1 SOURCES" + "Official" badge | 🟠 | Three different trust signals mashed together. Redundant. |
| OVERVIEW / TIMELINE / SOURCES tabs | 🟢 | Work. Tab divider heavy. |
| Description text | 🟠 | Long paragraph. Could be structured into labeled stats. |
| CONDITIONS: WIND/HUMIDITY/TEMP | 🟡 | WIND shows "16.2 km/h SW" but SW direction has no visual indicator (arrow/compass). |
| RESOURCES DEPLOYED | 🟢 | Big numbers + green. Good visual. |
| AREA BURNED: Not estimated | 🟢 | Italic + muted. Clear. |
| FIRE RISK: MAXIMUM pill | 🟢 | Good. |
| FOLLOW THIS INCIDENT button | 🟢 | Large, prominent, dark green. Good CTA. |
| Section vertical spacing | 🟡 | Too much breathing room, makes scrolling feel slow. |

**Critical fix**: Collapse trust signals into one badge. Add wind direction arrow. Reduce section spacing.

#### MOBILE (390×844)

| Element | Status | Issue |
|---------|--------|-------|
| Top header | 🔴 | hamburger + brand+logo + bell + help + theme + PT/EN = 7 elements crammed in 50px. |
| Brand "Lumes" overlaps map | 🔴 | Visible behind "Vigo" map label. |
| "WILDFIRE INTEL" tagline hidden | 🔴 | Only "WILDFIRE" partially visible behind map. |
| Map controls (+/-/locate) | 🟠 | Bleed off right edge of viewport. |
| Legend overlaps playback bar | 🟠 | Bottom-left. |
| No bottom nav | 🔴 | User must find hamburger to access dashboard/sidebar. |
| No detail panel on mobile | 🟠 | Need to test what happens when VILAR clicked. |

**Critical fix**: Mobile-first redesign. Sticky bottom navigation: Map / Dashboard / Reports / More.

### 2.3 Color & typography

```
Color palette (works):
  Background:        #0a0e0d (near black)
  Surface:           #131815
  Border:            #1f2522
  Accent (orange):   #f97316 (severity, primary)
  Critical:          #ef4444
  Warning:           #f59e0b
  Info:              #3b82f6
  Success:           #10b981

Typography (weak):
  Primary: default sans (Inter via Tailwind) — fine but generic
  Numeric: font-mono for counters — good but sterile
  Headers: uppercase 10-11px letter-spaced 0.05em — fine
  Display font: MISSING — "Lumes" wordmark uses default sans, no personality
```

**Critical fix**: Add a display font for the Lumes wordmark. Options: Inter Display, Geist, Outfit, or custom.

### 2.4 Visual reference comparison

| App | What it does well |
|-----|-------------------|
| **Watch Duty** | Big hero metric, clear color hierarchy, premium feel, mobile-first |
| **NASA FIRMS** | Clean data table, big interactive map, dense but readable |
| **CalFire** | Strong typography, clear status badges, calm color palette |
| **Fogos.pt** | Sticky map markers, real-time count, branded |

What Lumes can learn:
- **Hero metric**: Big number (40-60px) for total active fires — currently 28 in 24px
- **Status pills**: Color-coded, prominent, in a row
- **Mobile-first**: Sticky bottom nav, swipe gestures
- **Brand identity**: Custom font, distinctive logo, consistent voice

---

## 3. Architecture review

### 3.1 File layout (current)

```
src/
├── app/
│   ├── api/         (31 routes — see §3.2)
│   ├── page.tsx     (4,158 LOC — TOO BIG)
│   ├── layout.tsx
│   ├── newsroom/, privacy/, status/, sitemap.ts, feed.xml/, og/, opengraph-image.tsx
├── components/
│   ├── ember-map.tsx       (1,356 LOC — TOO BIG)
│   ├── ember-anim.tsx
│   ├── advanced-layers-host.tsx
│   ├── news-section.tsx
│   ├── layer-panel.tsx     (REMOVED but still referenced?)
│   ├── sw-register.tsx
│   ├── theme-provider.tsx
│   ├── ui/                 (30+ files, 95% unused shadcn)
│   └── layers/             (aerial-layer, biomass-layer, risk-layer)
├── lib/
│   ├── aerial/merge.ts
│   ├── biomass/equations.ts, synthetic-grid.ts
│   ├── risk/composite.ts
│   ├── use-app-data.ts     (shared useFetch endpoint wrappers)
│   ├── use-realtime-incidents.ts
│   └── use-followed-incidents.ts
│   ├── use-language.ts
│   ├── ingest.ts, persistence.ts, sample-data.ts (658), types.ts
│   ├── i18n.ts (311 LOC, 60+ keys)
│   ├── db.ts
│   └── email.ts
└── prisma/schema.prisma    (8 models, 1 dead)
```

**Total TypeScript**: 19,689 LOC across 100+ files.

### 3.2 API surface (31 routes)

```
/api/aerial              ADS-B aircraft aggregation (3 sources)
/api/alerts              alert subscription
/api/biomass             biomass grid
/api/biomass/grid        grid subset
/api/cron/ingest         cron ingest endpoint
/api/dashboard           ⚠️ BROKEN (500)
/api/fire-risk           IPMA fire risk
/api/fire-stations       OSM Overpass + 19-station fallback
/api/follow              followed incidents
/api/health              health check
/api/history             persisted incidents
/api/incidents           ANEPC live feed
/api/incidents/risks      per-incident composite risk
/api/municipalities      municipal list
/api/news                RSS feed (just built)
/api/newsletter/{confirm,subscribe,unsubscribe}
/api/og/incident/[id]    per-incident OG image
/api/realtime            SSE stream
/api/region/[name]       regional drill-down
/api/regional-commands   ⚠️ 11 MB uncompressed
/api/reports             community reports
/api/risk                risk composite
/api/risk-fwi/[day]      IPMA RCM 3-day
/api/satellite           NASA FIRMS
/api/source-health       all source health
/api/stats               persistence stats
/api/weather             IPMA weather observations
/api/weather-warnings    IPMA warnings
```

### 3.3 State inventory (current — no store, all local)

```
page.tsx (30+ useState hooks):
  - mobileSidebarOpen, notifOpen, showHistoryModal, showReportModal, helpOpen
  - basemap, showFireRisk, showFireStations, showSatellite
  - showAerial, showBiomass, showCompositeRisk    (advanced overlays)
  - severityFilter, criticalOnly, hideResolved, visibleSources
  - fireRiskFilter
  - selectedIncidentId, flyToIncidentId
  - searchQuery
  - sortMode, quickFilter
  - phaseFilter, resourceFilter
  - playbackHour, isPlaying
  - notifications, unreadCount
  - mounted (for SSR safety)
  - followedIncidentIds
  - lang (from useLanguage)
```

---

## 4. Refactor plan (7 phases)

### Phase 1 — Fix critical bugs + visual polish (3-4 days)

**F-01 — Map marker clicks**
- Investigate `queryIncidentFeatures(e.point)` — likely the layer hit detection is broken
- Add a debug `console.log` to see what features are returned at click points
- Likely cause: incident layers are wrapped in a cluster layer, click hits cluster first, OR `LAYER_IDS.incidentFill` doesn't exist at click time
- Fix: ensure `incident-fill` and `incident-stroke` layers are always rendered

**F-02 — `/api/dashboard` 500**
- Replace `fetch('/api/incidents')` with direct `db.incident.findMany()`
- Use Prisma to aggregate: count, groupBy severity, groupBy statusGroup
- Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`

**F-03 — i18n typo "conselhos" → "concelhos"**
- 1-line fix in `src/lib/i18n.ts`

**F-04 — Error boundary**
- Add `src/app/error.tsx` (Next.js convention): catches runtime errors, shows PT fallback UI
- Add `src/app/global-error.tsx`: catches layout-level errors

**F-05 — Mobile header redesign**
- Replace absolute top-0 header with `sticky` on mobile
- Hide brand + notifications behind hamburger menu
- Add sticky bottom nav: Map / Dashboard / Reports / More

**F-06 — Remove brand duplicate**
- Delete "Lumes WILDFIRE INTEL" header from DashboardPanel
- Keep brand only in top header

### Phase 2 — Fix high bugs (2-3 days)

**F-07 — Regional commands compression**
- Cache 24h, gzip, simplify MultiPolygons to 0.01° with `@turf/simplify`
- Target: <500 KB

**F-08 — News section placement**
- Add News section to LEFT dashboard (under operational phases), keep compact
- Right sidebar News: only SOURCES tab

**F-09 — Delete Post model**

**F-10 — Type the IncidentSummary** — eliminate `(i as any).rawProperties` casts

**F-11 — Show ALL operational phases** — Vigilância, Conclusão, Encerrada, etc.

### Phase 3 — Backend hardening (3-4 days)

**F-21 — Centralized cache abstraction**
**F-22 — Zod validation** on all POST endpoints
**F-23 — Rate limiting**
**F-24 — Disable fake satellite fallback**
**F-25 — Structured logging**

### Phase 4 — Split god components (1 week)

**F-26 — Break page.tsx (4,158 → ~600 LOC)**

```
src/components/dashboard/  (counter-grid, resource-grid, operational-phases, priority-incidents-list, filters-section)
src/components/sidebar/     (search-box, quick-stats, fire-risk-summary, conditions-summary, map-layers, data-sources-list)
src/components/incident-detail/  (tab-overview, tab-timeline, tab-sources)
src/components/overlays/    (collapsible-legend, map-controls, map-attribution, playback-bar)
```

**F-27 — Break ember-map.tsx (1,356 → ~400 LOC)**

```
src/components/map/  (basemap-controller, incident-marker-layer, hover-popup, click-handler)
```

### Phase 5 — State management (3-4 days)

**F-30/F-31 — zustand stores** for UI + Data state

**F-30 — Generic `useFetch<T>`** replacing 14 useLiveData hooks

### Phase 6 — Dead code removal (1 day)

**F-28 — Delete unused shadcn components** (keep 5)
**F-29 — Trim sample-data.ts** (658 → ~100 LOC)

### Phase 7 — Observability + tests (3-4 days)

- Playwright CI smoke test (regression test for F-01)
- Lighthouse CI budget
- Extended `/api/health` (DB ping, latest ingest, free disk)
- 404 page with PT fallback UI

---

## 5. Recommended execution order

```
Week 1 (P0 + P1):
  Mon  F-04 (error boundary), F-03 (typo), F-06 (dedupe brand)
  Tue  F-01 (map marker clicks — needs deep debug)
  Wed  F-02 (/api/dashboard 500)
  Thu  F-05 (mobile redesign)
  Fri  F-08 (news placement), F-09 (delete Post)

Week 2 (P2):
  Mon  F-21 (cache), F-22 (zod), F-23 (rate limit)
  Tue  F-24 (satellite), F-25 (logs)
  Wed  F-07 (regional-commands), F-11 (operational phases)
  Thu  F-26 (split page.tsx)
  Fri  F-27 (split ember-map.tsx)

Week 3:
  Mon  F-26 + F-27 continue
  Tue  F-30/F-31 (zustand + useFetch)
  Wed  migrate useLiveData hooks
  Thu  F-28, F-29 (dead code)
  Fri  Phase 7 (Playwright CI, health)
```

---

## 6. Risk assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| F-01 marker clicks | High — click handler is finicky | console.log debug, manual QA each attempt |
| F-05 mobile header | Medium | Playwright mobile screenshots |
| F-26 split page.tsx | High — cross-cutting refs | One component at a time, deploy each, visual check |
| F-30/F-31 zustand | Medium — changes reactivity | Store-by-store migration |
| F-28 delete shadcn | Low — verify imports first | grep all imports before delete |

---

## 7. Success metrics

| Metric | Before | After (target) |
|--------|--------|----------------|
| `bun run test` | 10/10 ✓ | 30+ tests (smoke + unit + integration) |
| `bun run build` | green | green + types strict |
| Largest file (LOC) | 4,158 (page.tsx) | <800 |
| `/api/dashboard` p95 | ~3s timeout-prone | <500ms |
| `/api/regional-commands` size | 11.4 MB | <500 KB |
| Lighthouse perf score | unknown | 90+ |
| Mobile usability | broken | pass |
| Brand double-display | yes | no |
| Counter cards wasted space | yes | minimal |
| Display font | none | Geist/Outfit/custom |
| Bundle size (initial JS) | unknown | <300 KB gz |
| Mobile nav pattern | cramped header | sticky bottom nav |

---

## 8. Out of scope (defer)

- Migrating to App Router (already on it)
- Migrating from SQLite to Postgres (no immediate need)
- Replacing MapLibre with Mapbox (no benefit)
- Adding Firebase / Supabase (current SSE works fine)
- Native mobile app (PWA + responsive design sufficient)
- I18n beyond PT/EN (low priority)

---

## 9. Architecture refactor + cleanup (next tasks)

### 9.1 Stale conventions to fix

| Issue | Where | Fix |
|-------|-------|-----|
| **Self-fetch with broken host** | `/api/dashboard` was using `https://localhost:${PORT}` (fails because local Node has no TLS cert). Replaced with `http://127.0.0.1:${PORT}`. | ✅ Done this session |
| **Inflated DB counts** | Persistence accumulates records; `lastSeen` is bumped on every ingest (60s), so any `lastSeen >= X` filter matched everything. Dashboard now prefers live feed. | ✅ Done this session |
| **Duplicate markers** | Top priority list showed 5 incidents named "Junto à EN 18 (Évora)" with identical coordinates. Added 0.001° lat/lon dedupe. | ✅ Done this session |
| **Post model is dead code** | `prisma/schema.prisma` has `model Post` never referenced. | 🟠 Migrate away |
| **`SAMPLE_INCIDENTS` is dead fallback** | `src/lib/sample-data.ts` (658 LOC). Playback bar uses different generated frames. Trim to actual usage. | 🟠 Audit + trim |
| **30+ unused shadcn primitives** | `src/components/ui/*` has 30 files, ~95% unused. Keep only what's imported. | 🟠 Delete |
| **Status mapping duplicated** | `STATUS_GROUP_PREFIX` in news route, `mapEventType`/`mapIncidentStatus`/`mapSeverity` in ingest.ts, hardcoded colors in page.tsx. Centralise. | 🟠 Extract to `src/lib/incident.ts` |
| **Color hex values inline** | `page.tsx` has `#922b21`, `#e74c3c`, etc. directly. Should use CSS vars. | 🟠 Refactor to `var(--ember-*)` |
| **Type contract leakage** | `(i as any).rawProperties`, `(inc as any).properties` sprinkled throughout. | 🟡 Fix during page split |

### 9.2 Dead / stale files to remove

```
src/components/layer-panel.tsx          — superseded by advanced-layers-host + sidebar MAP LAYERS section
src/lib/sample-data.ts (658 LOC)        — trim to ~100 LOC, only keep what's referenced
src/app/api/realtime/route.ts          — verify still used (we have useRealtimeIncidents hook)
src/components/ui/aspect-ratio.tsx     — shadcn unused
src/components/ui/alert-dialog.tsx     — shadcn unused
src/components/ui/pagination.tsx        — shadcn unused
src/components/ui/tabs.tsx              — shadcn unused
src/components/ui/card.tsx              — shadcn unused
src/components/ui/slider.tsx            — shadcn unused
src/components/ui/popover.tsx           — shadcn unused
src/components/ui/progress.tsx         — shadcn unused
src/components/ui/input-otp.tsx         — shadcn unused
src/components/ui/chart.tsx             — shadcn unused (might be used somewhere)
src/components/ui/hover-card.tsx        — shadcn unused
src/components/ui/sheet.tsx             — used by mobile drawer (KEEP)
src/components/ui/scroll-area.tsx       — used (KEEP)
src/components/ui/resizable.tsx         — shadcn unused
src/components/ui/label.tsx             — used? audit needed
src/components/ui/sonner.tsx            — used (KEEP)
src/components/ui/toaster.tsx           — used? audit needed
src/components/ui/navigation-menu.tsx   — shadcn unused
src/components/ui/breadcrumb.tsx        — shadcn unused
src/components/ui/calendar.tsx          — shadcn unused
src/components/ui/checkbox.tsx          — audit needed
src/components/ui/command.tsx           — shadcn unused
src/components/ui/context-menu.tsx     — shadcn unused
src/components/ui/dialog.tsx            — shadcn unused (we use motion.aside + AnimatePresence)
src/components/ui/dropdown-menu.tsx     — audit needed
src/components/ui/menubar.tsx           — shadcn unused
src/components/ui/radio-group.tsx       — shadcn unused
src/components/ui/select.tsx            — audit needed
src/components/ui/separator.tsx         — shadcn unused
src/components/ui/skeleton.tsx          — used (KEEP)
src/components/ui/switch.tsx            — shadcn unused
src/components/ui/table.tsx             — shadcn unused
src/components/ui/textarea.tsx          — shadcn unused
src/components/ui/toggle.tsx            — shadcn unused
src/components/ui/toggle-group.tsx      — shadcn unused
src/components/ui/tooltip.tsx           — shadcn unused
```

Action: `grep -r "from \"@/components/ui/" src/` for each candidate, delete if zero hits.

### 9.3 Architecture refactor tasks

**TASK A — Extract `src/lib/incident.ts`** (centralised status + severity logic)

Currently scattered across:
- `src/lib/ingest.ts` — `mapEventType`, `mapIncidentStatus`, `mapSeverity`, `ptDateToISO`
- `src/lib/ingest.ts` — `STATUS_GROUP_PREFIX` (actually in news route)
- `src/app/page.tsx` — `STATUS_RAW_PT`, `STATUS_RAW_EN`, `statusRawLabel()` helper inline
- `src/app/page.tsx` — PHASE_COLOR map for operational phases (inline)
- `src/components/incident-detail/*` (later) — same status display logic

New `src/lib/incident.ts`:
```ts
export const STATUS_GROUPS_PT = ["Em Despacho", "Em Curso", "Em Resolução", "Em Conclusão", "Vigilância", "Encerrada"] as const;
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const STATUS_RANK: Record<IncidentStatus, number> = { active: 0, detected: 1, monitoring: 2, contained: 3, resolved: 4 };
export const PHASE_COLOR: Record<OperationalPhase, string> = {
  "Em Despacho": "var(--ember-warning)",
  "Em Curso": "var(--ember-critical)",
  "Em Resolução": "var(--ember-warning)",
  "Em Conclusão": "var(--ember-info)",
  "Vigilância": "var(--ember-accent)",
  "Encerrada": "var(--ember-text-faint)",
};
export function mapStatusGroup(statusText: string | undefined | null): OperationalPhase { ... }
export function statusRawLabel(raw: string | undefined, lang: Language): string { ... }
export function rankIncidents<T>(incidents: T[]): T[] { ... } // sort by severity + status
```

**TASK B — Replace inline color hexes with CSS vars**

Currently `page.tsx` has:
- `#922b21` (maximum)
- `#e74c3c` (very high)
- `#f39c12` (high)
- `#f4d03f` (moderate)
- `#229954` (reduced)
- `#5b9bd5` (info)
- etc.

Add to `globals.css`:
```css
:root {
  --ember-risk-max: #922b21;
  --ember-risk-very-high: #e74c3c;
  --ember-risk-high: #f39c12;
  --ember-risk-moderate: #f4d03f;
  --ember-risk-reduced: #229954;
}
```

Then use `var(--ember-risk-max)` etc. everywhere.

**TASK C — Page split (god component → subcomponents)**

Following the subdirectory plan in §4 Phase 4. Start with the smallest leaves:

1. `src/components/sidebar/toggle-row.tsx` (extract `ToggleRow` component)
2. `src/components/dashboard/counter-card.tsx` (extract `DashStat`)
3. `src/components/dashboard/resource-card.tsx` (extract `ResourceStat`)
4. `src/components/overlays/legend.tsx` (extract `CollapsibleLegend`)
5. `src/components/dashboard/operational-phases.tsx` (extract phase bar chart)
6. `src/components/dashboard/priority-list.tsx` (extract priority incidents list)
7. `src/components/dashboard/filters-section.tsx` (extract filters)
8. `src/components/dashboard/index.tsx` (compose DashboardPanel from leaves)
9. `src/components/sidebar/*` (similar pattern)
10. `src/components/incident-detail/*` (similar pattern)

After all leaves: `page.tsx` becomes ~500 LOC of just layout + state wiring.

**TASK D — State management with zustand** ✅ DONE

Currently 30+ useState in page.tsx. Extract to:
- `src/store/ui-store.ts` — filters, layers, modals, selection
- `src/store/data-store.ts` — live data caches, source health, realtime

**TASK D complete (this session)**:
- `src/store/ui-store.ts` — central state for filters, layers, modals, selection, mobile tab (187 LOC)
- `src/app/page.tsx` — replaced 16 useState hooks with useUIStore() destructuring
- Saved 31 lines, all filters/layers/modals now share state across components
- 10/10 tests pass, build green, deployed
- Filter verification: clicking "Critical" now correctly filters map to 2 incidents (via store)

Plus (in this session):
- **TASK E**: `src/lib/use-fetch.ts` (134 LOC) — generic hook with polling, lazy, transform, timeout
- **TASK F**: `src/lib/incident-types.ts` (99 LOC) — IncidentSummary type + isIncidentSummary guard
- **F-22**: `src/lib/api/rate-limit.ts` (60 LOC) — in-memory token-bucket, applied to /api/follow
- **F-24**: `src/lib/api/schemas.ts` (72 LOC) — 6 zod schemas, applied to /api/follow
- **TASK H**: `src/components/dashboard/hero-counter.tsx` (74 LOC) + `src/components/ui/empty-state.tsx` (100 LOC) + `src/components/mobile/long-press-actions.tsx` (175 LOC)
- All wired into dashboard (this session) — TOTAL 1470 fires, ACTIVE 433, CRITICAL 174 as big 2xl hero metrics at top of Live tab

Benefits:
- Multiple components can subscribe to the same store (no prop drilling)
- DevTools support
- Testable

**TASK E — Generic `useFetch<T>` hook**

Currently 14 useLiveData hooks duplicating fetch/cache logic. Replace with one generic hook + thin wrappers:
```ts
const incidents = useFetch<IncidentSummary[]>("/api/incidents", {
  refreshMs: 60_000,
  transform: adaptLiveToUI,
});
```

**TASK F — Type cleanup**

Currently `(i as any).rawProperties`, `(inc as any).properties`. Single IncidentSummary type:
```ts
export interface IncidentSummary {
  id: string;
  severity: Severity;
  incidentStatus: IncidentStatus;
  statusText?: string;
  statusGroup?: OperationalPhase;
  municipality?: string;
  parish?: string;
  locality?: string;
  district?: string;
  personnel?: number;
  engines?: number;
  aircraft?: number;
  estimatedAreaHa?: number;
  firstDetected: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  sourceType: SourceType;
}
```

Delete `adaptLiveToUI()` once types are unified.

**TASK G — Stale DB record garbage collection**

The persistence layer accumulates records indefinitely. Even after my fix (live preferred), the DB still has 2,504 records. Add a pruning task:

- After each ingest, mark incidents not seen in 24h as `status = 'resolved'` (or delete)
- Or: cron job `/api/cron/prune` that runs daily, deletes incidents with `lastSeen < now - 7d`

**TASK H — Remove `(i as any)` patterns**

Final sweep to remove `any` casts:
- `(inc as any).rawProperties?.statusGroup` → properly typed
- `(i as any).properties` → use typed `IncidentSummary.properties`
- Etc.

### 9.4 File budget after refactor

| Component | Current LOC | Target LOC |
|-----------|-------------|------------|
| `src/app/page.tsx` | 4,158 | ~500 |
| `src/components/ember-map.tsx` | 1,356 | ~400 |
| `src/components/ui/*` | 30 files (mostly dead) | 5 files |
| `src/lib/sample-data.ts` | 658 | ~100 |
| `src/lib/incident.ts` (new) | 0 | ~150 |
| `src/store/ui-store.ts` (new) | 0 | ~200 |
| `src/store/data-store.ts` (new) | 0 | ~150 |
| `src/lib/use-fetch.ts` (new) | 0 | ~100 |
| New `src/components/{dashboard,sidebar,incident-detail,overlays,map}/` | 0 | ~2500 total |
| **Net total** | **19,689** | **~22,000** (each file <300 lines) |

### 9.5 Execution order (next 3 weeks)

**Week 1 — Cleanup & dead code**
- Mon: TASK E (delete Post model, migrate), TASK 9.2 (delete unused shadcn)
- Tue: TASK B (CSS vars for colors), TASK A (extract incident.ts)
- Wed: TASK G (DB pruning cron)
- Thu: TASK H (remove `as any`)
- Fri: Visual polish — hero metrics, sidebar uniformity refinement

**Week 2 — Architecture refactor**
- Mon-Tue: TASK C (page split — start with leaves)
- Wed-Thu: TASK D (zustand stores)
- Fri: TASK E (useFetch migration)

**Week 3 — Tests + observability**
- Mon: Playwright CI smoke (regression test for F-01 map clicks)
- Tue: Vitest + integration tests for new lib/incident.ts
- Wed: Structured logging + /api/health expansion
- Thu: Lighthouse CI budget
- Fri: Documentation pass

---

## 10. Maintenance: keep this plan alive

When a refactor lands:
1. Move completed items to a "Done" section at the bottom
2. Add new findings as discovered
3. Re-number F-XX for new findings, keep historical ones for traceability

When the user reports a bug:
1. Add as F-XX with severity + confirmed-via
2. If it's a quick win, fix in same session
3. If it requires research, add as a Phase-N task

---

## 11. Mobile UX redesign (F-22)

### 11.1 Current mobile problems (confirmed)

| ID | Problem | Confirmed |
|----|---------|-----------|
| **F-22a** | Hamburger opens **right sidebar only** (data sources/layers). User can't access the **left dashboard** (live fires, priorities) on mobile — the operational view is hidden. | Audit + user feedback |
| **F-22b** | Header overlaps map labels (brand "Lumes" bleeds through behind map text). | Screenshot |
| **F-22c** | Top-bar buttons (bell, help, theme, PT/EN) overflow on 390px. | Screenshot |
| **F-22d** | Map controls tiny (36×36), top-right corner (hard to reach with thumb). | Screenshot |
| **F-22e** | Legend at bottom-left overlaps playback bar. | Screenshot |
| **F-22f** | No bottom navigation — user has to find hamburger for any panel access. | Pattern audit |
| **F-22g** | Incident detail panel has no mobile-friendly full-screen mode. | Code audit |
| **F-22h** | Active filter chips invisible on mobile — no feedback when filter is applied. | Audit |
| **F-22i** | No swipe gestures (no swipe-up dashboard, no swipe-down filters). | Pattern audit |

### 11.2 Mobile UX principles for lumes.pt

1. **One-handed use** — most mobile users operate with one thumb
2. **Thumb-reachability** — important controls in bottom 40% of screen
3. **Progressive disclosure** — show essentials first, hide complexity
4. **Snap points** — bottom sheets with 25/50/95% snap positions
5. **No nav in top header** — header is reserved for status/info
6. **Single source of truth** — one drawer open at a time
7. **Pull-to-refresh** — natural gesture for refreshing data

### 11.3 Proposed mobile redesign

#### Layout (390 × 844 viewport)

```
┌──────────────────────────────────┐
│  Lumes        🔔  ☀  PT/EN ⋯  │  ← top status bar (sticky, no brand overlap)
├──────────────────────────────────┤
│                                  │
│         [ MAP FILLS HERE ]       │  ← full-bleed map
│                                  │
│                                  │
│                              ⊕   │  ← zoom controls (bottom-right, 48px)
│                              ⊖   │
│                              ⊙   │  ← locate me (48px)
│                                  │
│  🏷 26 incidents  🔥 Live         │  ← floating attribution pill (bottom-left)
│  [LAYERS] [INFO]                 │  ← floating quick actions (bottom-left)
│                                  │
│  ┌────────────────────────────┐  │
│  │ ━━ swipe up handle ━━        │  │  ← bottom sheet (collapsed, peek 80px)
│  │ 🔴 2  CRITICAL  6 ACTIVE 27  │  │  ← hero counter strip
│  │ ─────────────────────────  │  │
│  │ Tap to expand               │  │
│  └────────────────────────────┘  │
├──────────────────────────────────┤
│  [Map]  [Live]  [Filter]  [More]  │  ← bottom nav (5 tabs, fixed)
└──────────────────────────────────┘
```

#### Bottom navigation tabs

| Tab | Icon | Shows |
|-----|------|-------|
| **Map** | 🗺 | Map full-screen (default) |
| **Live** | 🔥 | Dashboard sheet (active fires, priorities, resources) |
| **Filter** | ☰ | Filter sheet (severity, sources, layers, news) |
| **More** | ⋯ | Menu (notifications, history, report fire, settings) |

#### Tap targets

- All buttons: minimum 44 × 44 px (Apple HIG, WCAG 2.5.5)
- Map zoom controls: 48 × 48 px
- Bottom nav items: full-width, 56 px tall
- Counter cards: full-width, 72 px tall (currently 160×68)

#### Gestures

| Gesture | Action |
|---------|--------|
| Tap map marker | Open incident detail (full-screen sheet on mobile) |
| Swipe up from bottom | Open dashboard sheet (50% snap) |
| Swipe up further | Expand dashboard sheet to 95% |
| Swipe down on dashboard | Collapse to peek (80px) |
| Pinch | Zoom map |
| Two-finger drag | Pan map (already supported) |
| Pull down on dashboard | Refresh data |
| Long press marker | Show quick actions (share, follow) |

#### Bottom sheet (incident detail on mobile)

- Default state: peek (80px, shows hero counter strip)
- Half: 50% snap (overview tab)
- Full: 95% snap (all tabs visible, scrollable content)
- Dismiss: swipe down to peek, or tap scrim

#### Active filter chips

- Top of map, swipeable
- Each chip: phase name × / count
- Tap chip to remove that filter
- "Clear all" pill on the right when multiple filters

### 11.4 Implementation plan

**Step 1 — Quick wins (1-2 days)**
- Swap hamburger drawer to show LEFT dashboard (F-22a)
- Add bottom nav shell (4-5 tabs) for mobile (F-22f)
- Move map controls to bottom-right with 48×48 touch targets (F-22d)
- Fix header overlap (F-22b): use `sticky` instead of `absolute` on mobile

**Step 2 — Bottom sheet (2-3 days)**
- Create `src/components/mobile/bottom-sheet.tsx`
- Implement snap points (peek / half / full)
- Wire dashboard to use bottom sheet on mobile, slide-in drawer on desktop
- Wire incident detail panel to use full-screen sheet on mobile

**Step 3 — Active filter chips (1 day)**
- Show pill bar at top of mobile map
- Active filter chips with tap-to-remove
- "Clear all" when multiple active

**Step 4 — Gestures + polish (2-3 days)**
- Swipe-up dashboard
- Pull-to-refresh
- Long-press marker quick actions

**Step 5 — Tab nav (2 days)**
- Bottom nav: Map / Live / Filter / More
- Each tab swaps the content panel
- Active state with accent color

### 11.5 Component map (mobile)

```
src/components/mobile/
  bottom-nav.tsx          — 4-tab fixed bottom nav
  bottom-sheet.tsx        — snap-point sheet wrapper
  mobile-header.tsx       — sticky status header (no brand overlap)
  attribution-pill.tsx    — "X incidents" floating pill
  map-controls-mobile.tsx — bottom-right zoom/locate
  filter-chips.tsx        — active filter pill bar
```

### 11.6 Success metrics (mobile)

| Metric | Current | After |
|--------|---------|-------|
| Tap target min size | 36×36 | 44×44 ✓ |
| Header overlap map | yes | no ✓ |
| Access left dashboard on mobile | impossible (hidden) | bottom sheet ✓ |
| Bottom nav | none | 4 tabs ✓ |
| Active filter feedback | none | chip bar ✓ |
| Map controls reachable | top-right (hard) | bottom-right (easy) ✓ |
| Incident detail mobile | side panel (cluttered) | full-screen sheet ✓ |
| Lighthouse mobile perf | unknown | 90+ ✓ |

### 11.7 Done section (this session — mobile tab navigation)

**Decision: dedicated mobile tab navigation (F-23)**

After iterating from "same content as desktop" → "horizontal scroll" → "tab navigation", the final mobile layout is:

- **Map tab (default)**: Full-screen map. Small bottom-sheet peek (96px) shows "INCÊNDIOS" handle — tap to expand.
- **Incêndios tab**: Bottom sheet expands full-screen, shows the `DashboardPanel` content.
- **Filtros tab**: Bottom sheet shows the `Sidebar` content.
- **Mais tab**: Bottom sheet shows a More menu (Notifications, History, Report Fire).
- **Bottom nav**: 4 fixed tabs with active state, icons, labels, red badges for unread/active counts.

**References** (mental model from established patterns):
- Watch Duty: map-first, bottom sheet for incident list
- Cal Fire app: tab nav at bottom
- Google Maps: FABs + bottom drawer
- Material Design 3: NavigationBar

**Files added**:
- `src/components/mobile/mobile-view.tsx` — full mobile view (map + bottom sheet + 4-tab bottom nav)

**Files modified**:
- `src/app/page.tsx`:
  - Removed mobile sidebar drawer (no longer needed)
  - Removed mobile hamburger button
  - Hidden header on mobile (`hidden md:flex`)
  - Wrapped IncidentDetailPanel in `hidden md:block`
  - Wrapped `<main>` in `hidden md:flex`
  - Removed `hidden md:flex` from DashboardPanel so it works in mobile sheet
  - Added `<MobileView>` block at the end of the JSX
  - Imports `MobileView` and `MobileTab` from `@/components/mobile/mobile-view`
  - New state: `const [mobileTab, setMobileTab] = useState<MobileTab>("map")`
  - Bell/History icons renamed (Bell → BellIcon, History → HistoryIcon) to avoid clash

**Verified on mobile (390×844)**:
- Map tab: full-screen map with fire markers, INCÊNDIOS peek handle
- Incêndios tab: full dashboard (Total 31, Active 8, Critical 2, High 9, etc.)
- Filtros tab: full sidebar (search, Quick Stats, Fire Risk, Conditions, Map Layers, Notifications)
- Mais tab: Notifications (3), History (3815), Report Fire buttons
- Red badges on bottom nav (8 on Incêndios, 3 on Filtros)

**Verified on desktop (1440×900)**:
- 3-panel layout intact: dashboard | map | sidebar
- 56 buttons functional
- TOTAL 31 visible (matches live)

**Tests**: 10/10 passing, build green, deployed.

**Next mobile improvements** (queued):
- [x] Move map controls (zoom/locate) to bottom-right FABs (48×48) — **DONE** (`mobile-map-controls.tsx`)
- [x] Move legend to collapsible position — **DONE** (`mobile-legend.tsx`)
- [x] Add "X incidents" attribution pill at top-left — **DONE** (`mobile-attribution.tsx`)
- [x] Add active filter chips on Live tab — **DONE** (`active-filter-chip.tsx`, wired in `MobileView`)
- [x] Add pull-to-refresh — **DONE** (`mobile/pull-to-refresh.tsx` 130 LOC, wired in Live tab via `onRefresh={async () => { liveIncidents.refetch(); dashboard.refetch(); }}`)
- [x] Add swipe-up gesture for dashboard peek — **DONE** (SheetHandle draggable, swipe up collapses back to map)
- [x] Polish bottom sheet handle animation — **DONE** (1.5px tall × 12px wide handle, larger touch target)
- [x] Hero metric redesign (40-60px number) — **DONE** (HeroCounter wired in dashboard, big 2xl numbers in hero strip: TOTAL 36 fires, ACTIVE 12, CRITICAL 4)
- [x] Add empty states (no incidents, no news, no notifications) — **DONE** (`ui/empty-state.tsx` 100 LOC, 4 variants: no-incidents, no-results, no-news, no-fires-near; wired into dashboard + NewsSection)
- [x] Add loading skeletons — **DONE** (`LoadingSkeleton`, `CardSkeleton` in `ui/empty-state.tsx`; wired in DashboardPanel)
- [x] Long-press marker for quick actions — **DONE** (`mobile/long-press-actions.tsx` 175 LOC, with menu items: Follow · Center on map · Share · Close + useLongPress hook for gesture detection)

---

## 12. Done (this session)

✅ F-04 Error boundary (`error.tsx` + `global-error.tsx`)
✅ F-03 i18n typo `conselhos` → `concelhos`
✅ F-06 Brand duplicate removed from dashboard
✅ F-02 `/api/dashboard` 500 → live-first with DB fallback
✅ F-01 Map marker clicks — 40px tolerance (3-tier: direct → wider box → nearest source)
✅ Em Conclusão incorrectly mapped to "resolved" → now "contained"
✅ Top Priority duplicates → `dedupeByLocation` (50m tolerance)
✅ 44 unused shadcn components deleted
✅ Post + User dead models removed from Prisma schema
✅ TASK A — `src/lib/incident.ts` with status/severity/phase helpers
✅ TASK B — CSS vars for IPMA risk levels (`--ember-risk-maximum` etc.)
✅ TASK C-leaves — extracted `DashStat`, `ResourceStat`, `OperationalPhases`, `CollapsibleLegend`
✅ Phase filter fix — `===` comparison + `mapStatusGroup` fallback
✅ QuickFilter wired to live branch (Total/Active/Critical/High counters)
✅ Sidebar uniformity — right sidebar header mirrors left ("Side Panel · Filters LIVE")

---

## Appendix A — File budget after refactor

| Component | Current LOC | Target LOC |
|-----------|-------------|------------|
| `src/app/page.tsx` | 4,158 | ~600 |
| `src/components/ember-map.tsx` | 1,356 | ~400 |
| `src/components/ui/*` | 30 files | 5 files |
| `src/lib/sample-data.ts` | 658 | ~100 |
| New `src/components/{dashboard,sidebar,incident-detail,overlays,map}/` | 0 | ~2500 total |
| New `src/store/*` | 0 | ~250 |
| New `src/lib/api/{cache,schemas,rate-limit,logger}.ts` | 0 | ~300 |
| **Net total** | **19,689** | **~22,000** |

---

## Appendix B — Visual audit results

**11/11 dashboard interactions PASSED** — counters, filters, priority cards work.

**6/6 map marker clicks FAILED** — none opened detail panel. (Your bug, F-01)

**Mobile (390×844) BROKEN**:
- ❌ Brand "Lumes" overlaps "Vigo" map label
- ❌ "WILDFIRE INTEL" tagline hidden behind map
- ❌ Top-bar buttons overflow 50px
- ❌ Map controls bleed off right edge
- ❌ Legend overlaps playback bar
- ❌ No bottom navigation

**Tablet (768×1024)**: same layout as desktop, works.

---

## Appendix C — Design recommendations summary

### Quick wins (1-2 days each):
1. **Remove brand from dashboard** (eliminate double-branding)
2. **Remove "Situational Awareness" sub-header** (redundant)
3. **Collapse trust signals** in detail panel (91% / 1 sources / Official → one badge)
4. **Add wind direction arrow** in detail panel CONDITIONS
5. **Add scroll indicator** in right sidebar
6. **Make Quick Stats clickable** (Following/Tracked/Snapshots/Sources)
7. **Fix "dist" → "conc"** abbreviation in sidebar
8. **Replace "Enable to load"** with clearer CTA

### Medium effort (3-5 days each):
9. **Hero metric** — make Total/Active/Critical numbers much bigger (40-60px)
10. **Display font** for "Lumes" wordmark
11. **Loading skeletons** for dashboard counters
12. **Active filter chips** in top-bar
13. **Empty state** for News section when Matched=0
14. **Mobile-first redesign** — sticky bottom nav, collapsible sidebars
15. **Wind direction visual** — compass or arrow

### Larger effort (1+ weeks):
16. **Information architecture review** — maybe right sidebar should be left, dashboard right
17. **Brand identity** — logo, custom font, color palette audit
18. **Mobile redesign** — bottom nav, gesture support, sheet-style detail panel

---

**End of plan.**

---

## 10. Optional capability — 3D Incident Focus (post-refactor)

Lumes may add a controlled **3D Incident Focus** mode after the reliability,
selection, filtering, responsive, accessibility, and map-wrapper priorities
are complete. This is an optional inspection lens for one selected incident,
not a replacement for the national operational map.

### Roadmap placement

1. **Phase 1 — controlled incident camera focus:** feature-flagged camera
   transition, pitch/zoom bounds, camera snapshot/restore, 2D fallback,
   reduced-motion and device checks. No buildings, terrain, style swap, new
   provider, rotation, or touch pitching.
2. **Phase 2 — local 3D buildings:** only a dedicated, licensed building
   vector source and `fill-extrusion` layer in the current style, behind all
   operational overlays, with local coverage and tile-error fallback.
3. **Phase 3 — terrain and slope context:** only after a licensed DEM source,
   attribution, performance budget, and explicit review that the layer adds
   terrain context rather than fire-spread prediction.

### Non-negotiable guardrails

- `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS` is off by default.
- The existing MapLibre instance and CARTO/EOX basemap remain the owner.
- `dragRotate`, `pitchWithRotate`, and `touchPitch` remain disabled globally.
- Incidents, evacuation zones, risk, stations, satellite, aerial, biomass,
  composite-risk, news, community, attribution, and current style restoration
  must remain intact.
- Provider licence, coverage, height/elevation fields, attribution, rate
  limits, service-worker behaviour, and rollback must be documented before any
  Phase 2/3 source is enabled.

See [the detailed 3D Incident Focus plan](superpowers/plans/2026-07-11-3d-incident-focus.md)
for the exact user flow, UI states, controller interfaces, layer ordering,
acceptance criteria, tests, and rollback path.

### Current continuation status (2026-07-13)

Phase 1 camera-only Incident Focus is implemented behind the default-off
`NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS` flag and has passed the feature-enabled
desktop, tablet, phone, reduced-motion, style-restoration, edge-viewport, and
default-off rollback gates. The existing top-down operational map remains the
authoritative default. No provider-independent Phase 2 work is safe to start:
the CARTO/alternative building source still needs written entitlement,
attribution, Portugal coverage/height, tile-error fallback, style-restoration,
and mobile/GPU evidence. Terrain/slope remains behind a later DEM gate.

The current continuation order therefore remains:

1. Keep reliability, source freshness, filtering, incident clarity, responsive
   ownership, accessibility, and release checks green.
2. Keep Phase 2/3 3D context disabled until the provider gates are approved.
3. Resolve community-attachment storage, moderation, privacy, retention, and
   deletion decisions before adding upload UI or public media URLs.
