# Lumes.pt — Code Architecture

> Last updated: 2026-07-09

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
├── app/                        # Next.js App Router
│   ├── api/                    # 35+ API routes (incidents, news, dashboard, …)
│   │   ├── cron/ingest/        # 60s cron entrypoint
│   │   ├── cron/prune/          # daily prune entrypoint
│   │   ├── incidents/           # CRUD + risks/news/timeline subroutes
│   │   ├── source-health/       # 30s polling target
│   │   └── …                    # aerial, biomass, fire-risk, satellite, weather
│   ├── page.tsx                 # ⭐ MAIN PAGE (3,800 lines, mostly JSX)
│   ├── layout.tsx               # root layout, fonts, theme provider, SW register
│   ├── globals.css              # design tokens, animations, ember-* utilities
│   └── error.tsx                # error boundary
│
├── components/                  # React components
│   ├── ember-map.tsx            # ⭐ map (1,400 lines, MapLibre wrapper)
│   ├── mobile/                  # mobile-only UI (tabs, peek, bottom sheet)
│   ├── filters/                 # FiltersPanel, FilterStatus
│   ├── dashboard/               # HeroCounter, OperationalPhases, stat cards
│   ├── layers/                  # lazy-loaded map overlays (biomass/risk/aerial)
│   ├── layout/                  # RightSidebar (smart rail with FILTROS/DETALHE/NOTÍCIAS)
│   ├── icons/                   # brand-icons.tsx (custom) + phosphor-icons.tsx (wrapper)
│   ├── news-section.tsx         # news in right sidebar
│   └── ui/                      # shadcn-style primitives (only sonner kept)
│
├── lib/                         # domain logic
│   ├── i18n.ts                  # translations object (PT/EN, 280+ keys)
│   ├── db.ts                    # Prisma singleton
│   ├── incident.ts              # status/severity/phase helpers
│   ├── incident-types.ts        # shared TS types
│   ├── use-app-data.ts          # thin wrappers over useFetch
│   ├── use-fetch.ts             # generic fetch hook with TTL
│   ├── use-live-data.ts         # legacy hooks (being migrated to use-app-data.ts)
│   ├── aerial/merge.ts          # ADS-B multi-source merge
│   ├── api/cache.ts             # in-memory TTL cache helper
│   ├── api/csrf.ts              # CSRF / origin check
│   ├── api/rate-limit.ts        # token-bucket rate limiter
│   ├── api/schemas.ts           # zod schemas for request bodies
│   ├── persistence.ts           # snapshot/incident DB ops
│   └── …                        # ingest, sample-data, utils
│
├── store/
│   └── ui-store.ts              # zustand: filters, UI state, play-mode
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

The home page is a single ~3,800-line file. Top to bottom:

1. **Imports** (~80 lines): React, hooks, all the component modules,
   the data hooks, the dashboard component, helpers.
2. **Helpers** (`enrichIncidentWithLiveContext`, `timeAgo`, `formatDate`,
   `formatTime`, `sourceLabel`, `verificationLabel`) — pure functions
   used across the file.
3. **Sub-components** (defined as inline functions):
   - `MetricCard` — small KPI tile
   - `ReportFireModal`, `HistoryModal` — full-screen overlays
   - `PlaybackBar` — bottom timeline scrubber
   - `DashboardPanel({ … })` — the entire LEFT sidebar body
   - `IncidentDetailPanel({ … })` — middle right panel
   - `OverviewTab`, `TimelineTab`, `SourcesTab` — detail-panel tabs
4. **`Home()`** — the default export. Reads from a dozen hooks
   (`useFireStationsNew`, `useSatelliteNew`, `useNews`, …) and renders
   the 3-column desktop layout: dashboard (left), map (center), right
   rail (collapsible Filters/Detail/News).

This is intentionally **monolithic** — the original refactor plan
extracted components in a controlled order, but the file is still
the highest-level entry point. Sub-components live inside it because
they close over hook state.

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
     `setBasemap`, `setQuickFilter`, …

2. **Local component state** (`useState` in `Home()`)
   - `selectedIncidentId`, `selectedIncident`
   - `notifOpen`, `showShortcuts`, `showHistoryModal`, `showReportModal`
   - `mobileTab`, `flyToIncidentId`
   - `markerMenu`, `expandedFilters`, `expandedPhases`

3. **URL state** — `?incident=<id>` opens the detail panel on load.

## Data flow

```
        ┌── /api/incidents (every 60s) ──┐
        │                                ▼
        │  ┌── /api/dashboard ──┐     zustand (via useLiveIncidentsNew
        │  │                    │     + useDashboardNew)
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

## Adding a new API route (recipe)

1. `src/app/api/<thing>/route.ts` — exports `GET` (and `POST` if needed)
2. Use `src/lib/api/cache.ts` `withCache()` for any data that's
   slow-changing (RSS, IPMA, satellite feeds)
3. If mutating, add `assertSafeOrigin()` from `src/lib/api/csrf.ts`
4. If the body is user-supplied, add a zod schema in
   `src/lib/api/schemas.ts` and validate with `.safeParse()`
5. If public, add rate-limiting with `enforceRateLimit()` from
   `src/lib/api/rate-limit.ts`
6. Document the new endpoint in `docs/API.md` (TBD)

## Why certain things are the way they are

- **Why is `page.tsx` so long?**  — The user has had flaky experiences
  with sub-component refactors in the past; we deliberately keep
  the working file intact and pull things out in a controlled
  sweep. The "right" way is a follow-up per the REFACTOR-PLAN.md.

- **Why not a real state machine for filters?**  — The current set of
  filter logic is manageable in `useMemo`. Once we add URL persistence
  and per-user filter presets, this will move to a dedicated reducer.

- **Why Bun and not Node?**  — Bun is faster, supports TypeScript
  natively, and integrates well with our Prisma + Next.js stack.
  Single-binary deploys.

- **Why MapLibre and not Mapbox/Google Maps?**  — MapLibre is
  open-source, no API key required, and we can self-host styles.

- **Why a custom service worker?**  — We need offline support for
  the dashboard (firefighters in the field have bad connectivity)
  and we cache tile + chunk + API responses.
