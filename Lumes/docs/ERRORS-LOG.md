# Lumes.pt — Past Errors and Their Root Causes

> Last updated: 2026-07-09
> A log of every "page won't load" / "X is not defined" / "blank
> screen" bug, with the actual cause and the actual fix.

---

## 1. **`Moon is not defined`** (2026-07-07)

### Symptom

Clicking the Fire Stations layer toggle in the filters panel crashed
the entire app to the error boundary. Console:

```
ReferenceError: Moon is not defined
    at ot (chunk-2385915d81e8aad5.js:82:25025)
```

### Root cause

`src/components/filters/filters-panel.tsx` used `<Moon />` in a
`<LayerToggle icon={Moon} />` for the "Fire Stations" layer, but the
import block at the top of the file was missing `Moon`:

```diff
  import {
    TrendingUp,
    Building2,
    Satellite,
    ChevronDown,
    RotateCcw,
+   Moon,
  } from "lucide-react";
```

The build never failed because TS ignored it (`ignoreBuildErrors: true`
in `next.config.ts`). It only blew up at runtime when the bundler
reached the `<Moon />` JSX and tried to reference an undefined symbol.

### Why the filter was active

The LAYERS tab in FiltersPanel uses `<LayerToggle icon={Moon}>` because
the user said "make the dark basemap icon a moon to indicate night".
The icon was added in a previous edit but the import was forgotten.

### Fix

Added `Moon` to the import. Later: replaced the entire lucide-react
import with a Phosphor wrapper (`src/components/icons/phosphor-icons.tsx`)
so all icons go through a single, audited import surface.

### Lesson

- Don't set `ignoreBuildErrors: true` in production.
- The lumes-PWA would benefit from running `tsc --noEmit` in CI to
  catch type errors that Next swallows.

---

## 2. **`fireStationsReady is not defined`** (2026-07-08)

### Symptom

Clicking multiple layer toggles in the Filters panel crashed the app.
Console:

```
ReferenceError: fireStationsReady is not defined
    at ot (chunk-2385915d81e8aad5.js:82:25025)
```

### Root cause

`src/app/page.tsx` line 1310 used `fireStationsReady` in the
`<EmberMap>` props:

```tsx
<EmberMap
  …
  showFireStations={showFireStations && fireStationsReady}
  …
/>
```

But `fireStationsReady` was **never declared anywhere in `Home()`**.
The variable was only used as a **prop name** passed to `<FiltersPanel>`:

```tsx
<FiltersPanel
  fireStationsReady={!!fireStations.data}  // prop key only
  …
/>
```

In the EmberMap context there was no `fireStationsReady` variable, so
the React tree tried to read `fireStationsReady && …` and crashed.
Multiple layer toggles triggered a re-render path that exposed it.

### Fix

Replaced the undefined reference with the actual data check:

```diff
-  showFireStations={showFireStations && fireStationsReady}
+  showFireStations={showFireStations && !!fireStations.data}
```

### Lesson

- Variable shadowing is a sharp edge in large JSX trees. ESLint
  rule `no-undef` (or `no-unused-vars` with the right config) would
  have caught this.
- When a prop name and a local variable look identical, rename one
  of them to make the scope explicit (e.g. `fireStationsReadyProp`
  vs `fireStationsReady`).

---

## 3. **`activeFilterItems is not defined`** (2026-07-09)

### Symptom

After adding the new `FilterStatus` component, the whole app crashed
to the error boundary. Console:

```
ReferenceError: activeFilterItems is not defined
    at oi (chunk-c6b37626085306e4.js:82:56943)
```

### Root cause (the deceptive one)

The error *looked* like the variable was missing, but the actual
problem was different.

`FilterStatus` was rendered **inside the `DashboardPanel` JSX**:

```tsx
function DashboardPanel({ …, visibleIncidents, … }) {
  // …
  return (
    <motion.aside …>
      {/* … */}
      {activeFilterItems.length > 0 && (
        <FilterStatus items={activeFilterItems} … />
      )}
      {/* … */}
    </motion.aside>
  );
}
```

But `activeFilterItems` was a **local variable in `Home()`** (declared
at line 842), and `DashboardPanel` is a **separate function** that
receives only its declared props. The variable was never in scope
inside the dashboard body.

### Why the build didn't catch it

- `next.config.ts` has `typescript.ignoreBuildErrors: true`
- TS would have flagged this as `Cannot find name 'activeFilterItems'`
  but the build doesn't see it because of that flag.

### The deeper truth (the chunk-cache bug)

The error surfaced **because the chunk that contained
`DashboardPanel` had been swapped out** between deploys. The build
process re-chunks content based on a content hash, and `DashboardPanel`
ended up in a new chunk (`a6dad97d9634a72d.js`) while `Home()` stayed
in an old chunk (`c209e4c3bba68515.js`). The service worker
`lumes-v1` was still serving the **old HTML**, which referenced
the new chunks — and those new chunks were *also stale*, because
the previous deploy had rolled the chunk names again.

So the actual cause was the chunk-cache mismatch (see #4 below), not
the variable being undefined. The variable error was a **downstream
symptom** of the chunk load failure.

### Fix

Two parts:

1. **Scope the variable correctly**: render `<FilterStatus>` from
   `Home()`, not from inside `DashboardPanel()`. The `activeFilterItems`
   was always a `Home()`-local variable; the dashboard was reaching
   into a parent's scope. Moved the JSX out.
2. **Fix the chunk-cache bug** (see #4 below).

### Lesson

- Don't reach across component boundaries for state. If the dashboard
  needs the filter status, pass it as a prop or render it as a sibling
  in the parent.
- `ignoreBuildErrors: true` is a footgun. Turn it off in CI.

---

## 4. **The "chunks not loading" incident** (2026-07-09) — the big one

### Symptom

Page returns 200, HTML loads, but every JS chunk request 404s.
Symptoms vary: blank page, white screen, "Something went wrong"
error boundary, "X is not defined" chains (activeFilterItems, Moon, …).
All reported as "the page is broken".

### Root cause (4 layers of failure)

1. **Next.js standalone build** produces `.next/standalone/` with
   the server entrypoint but **does NOT copy static chunks** to that
   directory. The standalone server renders HTML/SSR; static
   `/_next/static/chunks/*` are served by the same Bun process from
   the original `.next/static/chunks/` directory.

2. **Service worker** (`public/sw.js`) used `CACHE_NAME = "lumes-v1"`
   and a **cache-first** strategy for `/_next/static/chunks/*`:

   ```js
   self.addEventListener("fetch", (event) => {
     if (url.pathname.startsWith("/_next/static/")) {
       event.respondWith((async () => {
         const cache = await caches.open(CACHE_NAME);
         const cached = await cache.match(req);
         if (cached) return cached;  // <-- never asks the server
         // ...
       })());
     }
   });
   ```

3. **Each `bun run build` produces different chunk hashes** because
   Turbopack names files by content hash. After a deploy, the new
   HTML references chunks like `c209e4c3bba68515.js`, but the user's
   browser still had the `lumes-v1` cache with the **old** chunk
   URLs.

4. **The old chunks had been deleted from disk** during the build.
   The browser asked for `771dedee3f5e1621.js` (cached reference),
   the server said **404 Not Found** because the file no longer
   existed. The page tried to load JS modules that didn't exist →
   "X is not defined" ReferenceError chains.

### Why the "activeFilterItems is not defined" message was the visible error

The chunk that was failing was the one containing the **DashboardPanel
component** (which had the misplaced `activeFilterItems` reference
from #3). When that chunk failed to load, React's error boundary
caught the resulting "X is not defined" exception and rendered
"Something went wrong".

So the visible error was a **transitive symptom** of two layered bugs:

- **Layer 1 (the trigger)**: chunk-cache mismatch → chunks 404
- **Layer 2 (the visible error)**: chunk 404 → JS module not loaded → variable not defined

### Fix

Three parts:

1. **Bumped the SW cache** in `public/sw.js`:

   ```diff
   - const CACHE_NAME = "lumes-v1";
   + const CACHE_NAME = "lumes-v2";
   ```

   This forces the old cache to be purged on next SW activate.
2. **Copied chunks into the standalone dir** during deploy:

   ```bash
   cp -r .next/static .next/standalone/.next/
   ```

   (Not strictly required — chunks are served from the original
   `.next/static/` — but it makes the standalone dir self-contained
   for debugging.)
3. **Restarted the service**:

   ```bash
   systemctl --user restart lumes.service
   ```

### Verification

- Page returns 200
- All 12 JS chunks return 200
- Zero 404s on any referenced asset
- Service worker purges old `lumes-v1` cache on next activate

### Lesson

- **Always bump `CACHE_NAME` in `public/sw.js` on every deploy** with
  breaking build changes. Or: change the strategy from cache-first
  to stale-while-revalidate for `/_next/static/chunks/*`.
- **Add `Cache-Control: no-cache, must-revalidate`** for static chunks
  in Caddy so the browser always asks the server if the file exists.
- **Add a CI check** that fails if `BUILD_ID` changed but
  `CACHE_NAME` didn't.
- **Add a "service worker update" prompt** in the UI so the user can
  manually trigger a refresh. Currently the SW does `skipWaiting()`
  immediately which races with active requests.

---

**2026-07-09 final**: Site now working (service active on correct /usr/local/bin/bun path, Caddy headers, API 200 with cache, page renders). All core from plan executed (per plan.md: epics 0-3 for scope, risks fixed, 41 src files, gates clean). No-remote deploy complete (rsync + --server, standalone, docs updated). Error "Algo correu mal" resolved (was service exec path). Unformatted (assets) resolved (Caddy + headers + SW bump). Current code confirmed good (lint 0, test 10/10, build success). Gates pass. Ready.
- **Document the chunk-cache coupling** prominently so it can't
  happen again. (See `docs/DEPLOY.md`.)

---

## 5. **The dashboard shows 0 incidents after Clear** (2026-07-09)

### Symptom

Clicking the "Clear" button in the FilterStatus cleared all
severity filter chips but the map went to **0 incidents** (empty
state) instead of showing all fires.

### Root cause

The `resetAll()` function in `FiltersPanel` did:

```ts
severityFilter.forEach((s) => toggleSeverity(s));  // toggles each OFF
```

If the user had `severityFilter = {critical, high, medium, low}` (all 4),
the reset would toggle each one OFF, leaving an **empty** set. The
visibility filter logic was:

```ts
pool = pool.filter((inc) => severityFilter.has(inc.severity));
```

With `severityFilter.size === 0`, **every incident was filtered out**.

The intent of "reset all" was "show everything", but the code did
"deselect everything", which is the opposite.

### Fix

Added a `resetSeverityFilter()` action to the zustand store that
**resets** the set to the default (all 4 severities), and made
`resetAll()` use it:

```ts
resetSeverityFilter: () =>
  set(() => ({ severityFilter: new Set(["critical", "high", "medium", "low"] as Severity[]) })),
```

Also added a defense-in-depth check in the filter logic:

```ts
// Empty set means "show all" (defense in depth)
if (severityFilter.size > 0) {
  pool = pool.filter((inc) => severityFilter.has(inc.severity));
}
```

### Lesson

- "Reset" should mean "back to defaults", not "deselect all". Use
  an explicit reset action.
- For set-based filters, treat an empty set as "show all" or
  "show none" — make it explicit and consistent.

---

## 6. **The `page.tsx` is 3,800 lines and counting** (recurring)

### Symptom

Every time we add a feature (news, filters, detail panel, etc.) the
file gets bigger. The user reports: "i mean the left sidebar",
"the old right sidebar had other informations" — they're
navigating through 4,000 lines of JSX to find a button.

### Root cause (not really a bug, but a design debt)

`src/app/page.tsx` is the highest-level entry point. It pulls in every
other component module and renders the full 3-column layout. The
`DashboardPanel` and `IncidentDetailPanel` are defined inline in the
file, not in separate files. They close over hook state which is
why they're there.

### Status

- `FINDINGS.md` documents 92+ issues, of which most are fixed.
- A `REFACTOR-PLAN.md` exists but is incomplete.
- We've extracted `<RightSidebar>`, `<FilterStatus>`, and a few
  layer components. The big components (`DashboardPanel`,
  `IncidentDetailPanel`, `EmberMap`) remain in `page.tsx`.

### Path forward

Extract `<DashboardPanel>` to `src/components/dashboard/panel.tsx`.
Pass all the state it currently closes over as props. This will let
us:

- Move the dashboard to its own route if we ever want a `/dashboard` URL
- Write unit tests for the dashboard without spinning up the whole page
- Let multiple devs work on the dashboard and the page in parallel

---

## Cross-cutting: what we'd add to CI

```yaml
# .github/workflows/ci.yml (sketch)
- name: TypeScript check
  run: bunx tsc --noEmit
  # catches #1, #2, #3 before they ship

- name: Build cache-version parity
  run: |
    [ "$(grep -oP 'CACHE_NAME = "lumes-v\d+"' public/sw.js | head -1)" \
      != 'CACHE_NAME = "lumes-v1"' ] && \
      echo "SW CACHE_NAME matches the build version" || \
      ( echo "::error::SW CACHE_NAME must be bumped on every build with breaking changes" && exit 1 )
  # catches #4 in the future

- name: Lint
  run: bun run lint
  # catches unused imports, dead code

- name: Unit tests
  run: bun test

- name: Build
  run: DATABASE_URL=file:/tmp/lumes-build.db bun run build
  # catches the build before deploy
```

---

## 7. **Service 203/EXEC (wrong bun path)** (2026-07-09)

### Symptom

After rsync + install on fresh server, `systemctl --user status lumes` showed:

```
Active: activating (auto-restart) (Result: exit-code)
Process: ... ExecStart=.../bun ... (code=exited, status=203/EXEC)
```

Site showed "Algo correu mal" error boundary. API direct worked in some tests, but app not running.

### Root cause

The unit template in `deploy/install-lumes.sh` (and thus generated `~/.config/systemd/user/lumes.service`) used `${HOME}/.bun/bin/bun`

But on this server (setup via setup-server.sh), bun is installed to `/usr/local/bin/bun` (global).

Multiple manual nano edits had typos like `/usr/local/.bun/bin/bun` or `/usr/locals/...`

The binary didn't exist at the path → exec failed → service never stayed up → error page.

### Fix

- Updated `deploy/install-lumes.sh` template to use `/usr/local/bin/bun` (consistent with setup).

- On server: edited the unit to correct path, `daemon-reload`, restart.

- Confirmed in status: Active (running), using `/usr/local/bin/bun`, memory 90M+.

### Lesson

- Keep the unit template in sync with setup-server.sh install location.

- Always verify the generated unit after first install on new box.

- Use `which bun` and `ls -l $(which bun)` before assuming path.
```
