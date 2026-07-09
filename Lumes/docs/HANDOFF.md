# Lumes.pt — Project Handoff

> **Date**: 2026-07-09
> **Status**: Local refactor tranche verified; deployment not performed in this session
> **Live at**: Not verified from this workspace
> **Last session focus**: reliability, trust states, responsive IA, accessibility, and API safety
> system, and the chunk-cache incident (see `ERRORS-LOG.md` #4)

This document is the **5-minute briefing** for whoever picks up
lumes.pt next. It tells you:

1. What the project is
2. What's done
3. What's pending
4. Where the landmines are

For deeper detail, follow the links.

---

## 1. What is lumes.pt?

A **real-time wildfire intelligence dashboard for Portugal** built
on Next.js 16 + Bun + SQLite. It pulls fire incidents from ANEPC-adjacent
sources, joins them with municipal data, shows them on a MapLibre map,
and surfaces fire-related press that matches each incident's location.

The user is a Portuguese wildfire intel operator (or a citizen tracking
local fires). The product opens to a situation rail + map on wide desktop,
and map-first drawers on compact screens:

- **Left**: focused situation summary with trust, count, and priority incidents
- **Center**: live fire map
- **Right (rail)**: collapsible filters / incident detail / news

Compact screens are map-first: phones use Map / Incidents / Alerts / More,
while tablets use a compact top toolbar and contextual drawers.

---

## 2. What's done

| Area | State | Notes |
| ------ | ------- | ------- |
| Live fire map (MapLibre + custom fire markers) | ✅ | 30–40 active incidents typical |
| 6 map layers (Fire Risk, Fire Stations, NASA FIRMS, Aerial, Biomass, Composite) | ✅ | Toggles work, render in MapLibre |
| FlightRadar-style aerial layer | ✅ | Real ADS-B with rotating plane icons |
| Right rail + collapsible filter/detail/news panel | ✅ | Saves ~50% map width |
| Compact navigation and responsive drawers | ✅ | Responsive matrix verified at six target viewports |
| News (fire-filtered RSS) | ✅ | Strict fire-keyword filter, 5 PT outlets |
| Matched news in detail panel | ✅ | Shows press articles mentioning incident's location |
| 3-day fire-risk forecast | ✅ | From IPMA RCM |
| Active filter chips + clear-all | ✅ | New `FilterStatus` component |
| i18n (PT primary, EN opt-in) | ✅ | 280+ keys in `src/lib/i18n.ts` |
| Phosphor icon set (anti-AI) | ✅ | Replaces Lucide |
| Bricolage Grotesque + Fraunces fonts | ✅ | Anti-AI typography |
| Warm parchment + burnt sienna palette | ✅ | Per-theme |
| Map ocean colors (dark blue / light blue / satellite) | ✅ | Per-theme |
| Custom map icons (plane.svg for FlightRadar style) | ✅ | |
| CSRF protection on POSTs | ✅ | `src/lib/api/csrf.ts` |
| Zod validation on POSTs | ✅ | `src/lib/api/schemas.ts` |
| Rate limiting | ✅ | `src/lib/api/rate-limit.ts` |
| Cron: 60s ingest, daily prune | ✅ | Systemd timers |
| PWA + service worker | ✅ | `public/sw.js` |
| Error boundary + global error pages | ✅ | |
| A11y automated tests (axe-core) | ✅ | 0 violations across home and public routes |
| Unit tests | ✅ | 22 files / 59 tests passing |
| Build + deploy pipeline | ✅ | Local build verified; deployment remains separately authorized |
| Documentation | ✅ | `DEPLOY.md`, `ARCHITECTURE.md`, `ERRORS-LOG.md`, `FINDINGS.md` |

---

## 3. What's pending (priority order)

### Top — visible problems reported by the user

1. **Further orchestration extraction** — `page.tsx` still owns data
   composition and several action handlers. Continue extracting stable
   shell boundaries only after route and browser coverage remains green.

2. **Detail panel sometimes appears blank** when first opened.
   `activeFilterItems` was the previous symptom. The deeper bug —
   chunks loading order — was fixed by the SW version bump, but the
   panel content is still not always rendered on first open. Likely
   a render-on-mount race condition in the `IncidentDetailPanel`
   when wrapped in `AnimatePresence`. Need a 100ms timeout or
   `useEffect` to verify rendering.

3. **Filter state confusion** — the user has asked multiple times
   "filters show nothing when cleared" / "is the filter working?"
   The resetAll + severityFilter=empty fix is in place, but the
   overall filter UX needs a single "what is currently filtered"
   surface. The new `FilterStatus` is in the right direction.

### Medium — quality debt

1. **`ignoreBuildErrors: true` in `next.config.ts`** — this lets
   type errors ship. The 3 "X is not defined" errors in `ERRORS-LOG.md`
   would have been caught by `tsc --noEmit`. Turn it off; add a
   `tsc` check in CI.

2. **SW cache versioning is manual** — every breaking build needs a
   `CACHE_NAME` bump in `public/sw.js`. We just did it (`lumes-v1`
   → `lumes-v2`) but it'll bite us again. See `ERRORS-LOG.md` #4 and
   `DEPLOY.md` for the "Lessons learned" section.

3. **Refactor plan** (`docs/REFACTOR-PLAN.md`) is **incomplete** —
   sections are scaffolded but most don't have concrete tasks. The
   original TASKS A–H have been done (1,700 lines extracted), but
   the harder refactors (extracting `DashboardPanel` and
   `IncidentDetailPanel` from `page.tsx`) are not.

4. **Right-rail Detail panel sometimes opens empty** when an
   incident is selected. The `hideHeader` prop on the IncidentDetailPanel
   is set when rendered inside the right rail, but the actual content
   might not be ready yet. Needs investigation.

### Low — nice-to-have

1. **Notification system** — the notifications drawer is wired
   but the trigger (header bell with badge) is basic.
2. **Following** — can follow incidents, but no "followed" filter
   or "you have 3 new updates since you last visited" flow.
3. **Community reports** — `/api/reports` exists but the UI is
    hidden behind the MA menu. Polish the submission flow.
4. **A11y mobile check** — axe-core runs at desktop viewports
    (320, 390, 810). Mobile (iPhone landscape, iPad portrait) hasn't
    been tested for a11y.

---

## 4. Where the landmines are

These are the spots that will bite you next. Read the linked doc
before touching them.

| Landmine | Doc |
| ---------- | ----- |
| Service worker caching stale chunks after build | `DEPLOY.md` §"The chunks not loading incident" |
| `page.tsx` data-composition ownership | `ARCHITECTURE.md` §"src/app/page.tsx" |
| `ignoreBuildErrors: true` lets type errors ship | `ERRORS-LOG.md` #1, #2, #3 |
| Variable shadowing across component boundaries | `ERRORS-LOG.md` #2, #3 |
| Custom icon wrapper (`phosphor-icons.tsx`) needs every new icon aliased | `ARCHITECTURE.md` |
| Layer toggles require `activeFilterItems` entry to show as dismissable chip | `ARCHITECTURE.md` §"Adding a new map layer" |
| zustand reset actions must be explicit (empty set ≠ default) | `ERRORS-LOG.md` #5 |
| Ocean water color overrides only on `style.load` | `ARCHITECTURE.md` |
| Server = Bun + Next.js standalone; chunks served from `.next/static/` not `standalone/.next/` | `DEPLOY.md` |

---

## 5. How to pick this up

1. **Read these in order** (1 hour total):
   - `docs/DEPLOY.md` (15 min) — server, deploy, cache
   - `docs/ARCHITECTURE.md` (20 min) — code structure, data flow, recipes
   - `docs/ERRORS-LOG.md` (15 min) — past bugs, what to watch for
   - `docs/FINDINGS.md` (10 min) — UX/a11y review log
2. **Skim** `docs/REFACTOR-PLAN.md` to see what's been done.
3. **Run locally**:

   ```bash
   cd Lumes
   bun install
   bun run build        # local sanity build
   bun run test         # current baseline: 22 files / 59 tests
   bun run lint         # should be clean
   ```

4. **For a deploy**:

   ```bash
   rsync -az --delete --exclude='.git' --exclude='node_modules' \
     --exclude='.next' --exclude='db/*.db' --exclude='*.log' \
     --exclude='tests' Lumes/ lumes@152.53.145.9:/opt/apps/lumes/
   ssh lumes@152.53.145.9
   cd /opt/apps/lumes && bun run build && systemctl --user restart lumes.service
   ```

5. **For a feature**:
   - Add to zustand store + right-rail `RightSidebar`
   - Read "Adding a new map layer" in `ARCHITECTURE.md`
   - Read "Adding a new API route" in `ARCHITECTURE.md`

---

## 6. The 80/20 next steps

If you have one afternoon, do these three things to ship a meaningful
improvement:

1. **Continue shell extraction** only where it reduces orchestration
   without duplicating query or map state. `SituationPanel` and the
   inspector are already separate and covered by focused tests.
2. **Add a "What does the map show" indicator** at the top of the
   right rail. The user has been confused by what's currently
   filtered. The `FilterStatus` component is half of this; the
   other half is showing a small map legend ("Showing 18 critical
   fires + 12 high-severity") in a status bar.
3. **Add URL persistence for filters** — currently filters are lost
   on page reload. The user has asked for this. It's a 2-hour
   change with `useSearchParams` + `router.replace`.

These three together take ~8 hours and would visibly improve the
product. Everything else is polish.

---

## 7. Contact

- **Live site**: <https://lumes.pt>
- **Server**: 152.53.145.9 (lumes@…)
- **Source**: `Lumes/` in this repo
- **Production build**: `/opt/apps/lumes/.next/`
- **Database**: `/opt/apps/lumes/db/custom.db`
- **Logs**: `/opt/logs/lumes.log`, `/opt/logs/lumes.err`

If something's broken, check:

1. `systemctl --user status lumes.service`
2. `tail -50 /opt/logs/lumes.err`
3. `curl -s http://127.0.0.1:3001/api/source-health | jq`

Welcome aboard. 🔥
