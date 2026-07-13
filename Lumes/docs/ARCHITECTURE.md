# Lumes.pt — Code Architecture

> Last updated: 2026-07-13 (local reliability/refactor tranche; production deployment still requires the authorized HTTPS verification gate)

## High-level stack

| Layer            | Tech                                                                    |
|------------------|-------------------------------------------------------------------------|
| Frontend         | Next.js 16.1 + React 19 + TypeScript                                  |
| Styling          | Tailwind v4 + custom design tokens (CSS vars in `globals.css`)         |
| Server           | Next.js standalone + Bun runtime                                       |
| Database         | SQLite via Prisma (file at `db/custom.db`)                            |
| Caching          | Next.js fetch cache + in-memory TTL                                    |
| Map              | MapLibre GL JS + Carto basemaps (dark/light/satellite via EOX)         |
| Charts           | Native SVG (no chart library)                                          |
| Animations       | Framer Motion                                                           |
| Icons            | Phosphor Icons (custom wrapper at `src/components/icons/phosphor-icons.tsx`) |
| i18n             | Custom t() function in `src/lib/i18n.ts` (PT/EN)                       |
| Background jobs  | systemd user timers (ingest every 60s, prune daily)                   |
| Service worker   | Custom SW with stale-while-revalidate (`public/sw.js`)                  |

## Directory map

```
Lumes/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # 33 API routes (incidents, news, dashboard, …)
│   │   ├── cron/ingest/        # 60s cron entrypoint
│   │   ├── cron/prune/          # daily prune entrypoint
│   │   ├── incidents/           # CRUD + risks/news/timeline subroutes
│   │   ├── source-health/       # 30s polling target
│   │   └── …                    # aerial, biomass, fire-risk, satellite, weather
│   │   ├── page.tsx             # ⭐ data composition + shell orchestration (1,354 lines)
│   │   ├── layout.tsx           # root layout, fonts, theme provider, SW register
│   │   ├── globals.css          # design tokens, animations, ember-* utilities
│   │   └── error.tsx            # error boundary
│   ├── components/              # React components
│   │   ├── ember-map.tsx         # ⭐ map (1,546 lines, MapLibre wrapper)
│   │   ├── mobile/              # mobile-only UI (tabs, peek, bottom sheet)
│   │   ├── filters/             # FiltersPanel, FilterStatus, MapStatusSummary
│   │   ├── dashboard/            # HeroCounter, OperationalPhases, stat cards
│   │   ├── layers/               # lazy-loaded map overlays (biomass/risk/aerial)
│   │   ├── layout/               # RightSidebar and shell layout
│   │   ├── icons/                # brand-icons.tsx + phosphor-icons.tsx wrapper
│   │   ├── news-section.tsx      # news in right sidebar
│   │   └── ui/                   # shared UI primitives
│   ├── lib/                      # domain logic and typed client boundaries
│   │   ├── i18n.ts               # translations object (PT/EN)
│   │   ├── db.ts                 # Prisma singleton
│   │   ├── incident.ts           # status/severity/phase helpers
│   │   ├── incident-types.ts     # shared TS types
│   │   ├── use-app-data.ts       # typed endpoint wrappers over useFetch
│   │   ├── use-fetch.ts          # generic fetch hook with TTL
│   │   ├── use-realtime-incidents.ts # SSE connection/reconnect hook
│   │   ├── use-followed-incidents.ts # browser-local follow state
│   │   ├── aerial/merge.ts       # ADS-B multi-source merge
│   │   ├── map/                  # camera policy, capability, and map events
│   │   ├── use-incident-focus.ts # optional feature-flagged camera mode hook
│   │   ├── api/                  # cache, CSRF, rate-limit, and schemas
│   │   ├── persistence.ts        # snapshot/incident DB ops
│   │   └── …                     # ingest, sample-data, adapters, utilities
│   └── store/ui-store.ts         # zustand: filters, UI state, play-mode
│
├── prisma/
│   └── schema.prisma            # 7 tables: Incident, IncidentSnapshot, Source, etc.
│
├── public/
│   ├── sw.js                    # service worker (cache-first for static)
│   ├── manifest.json
│   ├── offline.html
│   └── icons/                   # favicons, PWA assets
│
├── deploy/
│   ├── deploy.sh                # server-only rebuild + restart
│   ├── install-lumes.sh         # first-time install script
│   ├── lumes.service            # systemd unit template
│   ├── lumes-prune.service/.timer
│   └── cf-setup.sh               # Cloudflare DNS setup (legacy)
│
├── tests/                       # vitest unit tests + Playwright a11y
│
└── docs/                        # the document you are reading
    ├── DEPLOY.md                # server, deploy flow, cache incident
    ├── ARCHITECTURE.md          # this file
    ├── FINDINGS.md              # UX/a11y review log
    ├── RUNBOOK.md               # operational cheatsheet
    ├── CRON.md                  # background job spec
    └── …
```

## `src/app/page.tsx` — what's in it

The home page remains the data-composition entry point; stable shell and
detail surfaces now live in focused components. Top to bottom:

1. **Imports** (~80 lines): React, hooks, focused shell/detail/modal
   components, data hooks, typed map adapters, and trust/state helpers.
2. **Small local presentation helpers** (`formatDate`, `formatTime`, source/
   verification labels, and incident-property guards). Localized relative
   time is shared through the tested `src/lib/relative-time.ts` boundary.
   Live weather/risk enrichment now belongs to the tested
   `src/lib/incident-context.ts` boundary.
   Dashboard aggregate computation belongs to the tested
   `src/lib/dashboard-metrics.ts` boundary; the page only memoizes and passes
   the result to the dashboard surface.
   The IPMA sidebar summary follows the same pattern through the tested
   `src/lib/weather-summary.ts` boundary.
3. **`Home()`** — the default export. Reads from a dozen hooks
   (`useFireStationsNew`, `useSatelliteNew`, `useNews`, …) and renders
   the wide situation rail + map + collapsible Explore/Inspector/Updates
   rail.

The file intentionally remains the highest-level data-composition entry
point; stable modal, map, shell, and detail surfaces are imported rather than
defined inline. New shell boundaries should be extracted only when their
behavior is covered by route and browser tests.

Global keyboard listeners and shortcuts-dialog focus ownership are isolated in
`src/lib/use-keyboard-shortcuts.ts`; pure intent ordering lives in
`src/lib/keyboard-shortcuts.ts`. The page injects actions, while
`showShortcuts` remains owned by the Zustand overlay stack.

## State management

Two sources of truth:

1. **Zustand store** (`src/store/ui-store.ts`)
   - Filter selections: `severityFilter` (Set), `visibleSources` (Set)
   - Filter toggles: `criticalOnly`, `hideResolved`, `phaseFilter`,
     `resourceFilter`, `quickFilter`, `searchQuery`
   - Layer toggles: `showFireRisk`, `showFireStations`, `showSatellite`,
     `showAerial`, `showBiomass`, `showCompositeRisk`
   - UI: `playbackHour`, `mapStyle`, `basemap`
   - Methods: `toggleSeverity`, `toggleSource`, `resetSeverityFilter`,
     `setBasemap`, `setQuickFilter`, `replaceIncidentFilters`, …

2. **Local component state** (`useState` in `Home()`)
   - `selectedIncidentId`, `selectedIncident`
   - `notifOpen`, `showShortcuts`, `showHistoryModal`, `showReportModal`
   - `mobileTab`, `flyToIncidentId`
   - `markerMenu`, `expandedFilters`, `expandedPhases`

3. **URL state** — `?incident=<id>` opens the detail panel on load. Query
   filters are persisted through `src/lib/use-incident-filter-url.ts` using
   the locale-independent `severity`, `includeResolved`, `quick`, `phase`,
   `resource`, and `q` keys; unrelated parameters are preserved.

## Data flow

```
        ┌── /api/incidents (every 60s) ──┐
        │                                ▼
        │  ┌── /api/dashboard ──┐     typed use-app-data wrappers over
        │  │                    │     useFetch (plus separate realtime hook)
        │  │                    ▼     │
   Browser  │                  ┌────▼─────┐
        │  │                  │  Home()   │
        │  │                  │ component │
        │  │                  └────┬─────┘
   ──────  │                       │ uses
        ▲  │                       ▼
        │  │            visibleIncidents (memo)
        │  │                       │
        │  │            ┌──────────┴──────────┐
        │  │            ▼                     ▼
        │  │     DashboardPanel       ember-map
        │  │     (left sidebar)        (center map)
        │  │                                ▲
        │  └────────── /api/fire-risk ────┘
        │              /api/fire-stations
        │              /api/weather
        │              /api/satellite
        │              /api/aerial (FlightRadar-style ADS-B)
        │              /api/biomass
        │              /api/risks/[id]
        │              /api/incidents/[id]/timeline
        │              /api/incidents/[id]/news
        └── /api/news (every 5m, RSS from 5 PT outlets)
```

Each `/api/*` route uses the in-memory TTL cache (`src/lib/api/cache.ts`).
`useFetch<T>` (`src/lib/use-fetch.ts`) respects `Cache-Control`
headers via the browser `cache: "default"` strategy.

## i18n

All user-facing strings go through `t(lang, "key")` from
`src/lib/i18n.ts`. Adding a new string:

1. Add to both `pt` and `en` in `translations.<section>.<key>`
2. Use `t(lang, "section.key")` in the component

The `<LanguageSwitcher>` in the header flips a cookie + zustand value
that all hooks read via `useLanguage()`.

## Adding a new map layer (recipe)

1. Add a `show*` boolean + setter in `ui-store.ts`
2. Add it to `useMapDefaults` so it serialises in the URL (optional)
3. In `src/components/ember-map.tsx` props, add the boolean
4. In `addEmberSourcesAndLayers()`, conditionally add the source/layer
5. In a layer component (e.g. `src/components/layers/satellite-layer.tsx`)
   wrap the actual data fetch + render
6. Add a toggle in `src/components/filters/filters-panel.tsx` so the
   user can turn it on/off
7. Add an entry to `activeFilterItems` in `page.tsx` so the toggle
   appears as a dismissable filter chip
8. If it needs the MapLibre map instance, register the
   `AdvancedMapLayers` host in `page.tsx` and listen for
   `lumes:map-ready` events

## Optional Incident Focus boundary

`MapScene` owns the single MapLibre instance. `EmberMap` exposes only typed
camera operations through `EmberMapHandle`; camera policy lives in
`src/lib/map/incident-focus-controller.ts`, capability policy lives in
`incident-focus-capability.ts`, and React mode state lives in
`use-incident-focus.ts`. The feature is disabled unless
`NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS=1` is present at build time.

Phase 1 is camera-only and keeps `dragRotate`, `pitchWithRotate`, and
`touchPitch` disabled. It preserves all operational sources/layers and uses
the existing CARTO/EOX styles. The `lumes:map-style-restored` event is a typed
future restoration boundary for optional Phase 2/3 context layers; no new
building, terrain, style, or provider request is made by Phase 1.

Future context layers must be registered idempotently after `style.load`, keep
operational overlays above buildings/terrain, include provider attribution and
licence records, and fall back to camera-only/2D when coverage, tiles, or
device capability are insufficient.

## Adding a new API route (recipe)

1. `src/app/api/<thing>/route.ts` — exports `GET` (and `POST` if needed)
2. Use `src/lib/api/cache.ts` `cached()` for any data that's
   slow-changing (RSS, IPMA, satellite feeds)
3. If mutating, add `assertSafeOrigin()` from `src/lib/api/csrf.ts`
4. If the body is user-supplied, add a zod schema in
   `src/lib/api/schemas.ts` and validate with `.safeParse()`
5. If public, add rate-limiting with `rateLimit()` and `clientKey()` from
   `src/lib/api/rate-limit.ts`
6. Document the new endpoint beside its contract tests and in the API inventory.

## Why certain things are the way they are

- **Why does `page.tsx` still own data composition?** — Data composition
  remains centralized while stable visual shells are extracted behind
  typed props and contract tests. Further extraction is incremental.

- **Why not a real state machine for filters?**  — The current set of
  filter logic is manageable in `useMemo`; URL synchronization is isolated in
  a guarded hook so it does not require a second state machine.

- **Why Bun and not Node?**  — Bun is faster, supports TypeScript
  natively, and integrates well with our Prisma + Next.js stack.
  Single-binary deploys.

- **Why MapLibre and not Mapbox/Google Maps?**  — MapLibre is
  open-source, no API key required, and we can self-host styles.

- **Why a custom service worker?**  — We need offline support for
  the dashboard (firefighters in the field have bad connectivity)
  and we cache tile + chunk + API responses.
