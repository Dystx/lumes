# Lumes Frontend Visual and Data Trust Audit

> Audit date: 2026-07-10  
> Scope: live `https://lumes.pt`, local source, responsive screenshots, API responses, accessibility checks, and Lighthouse artifacts  
> Status: audit and design direction only; no UI implementation is included in this document

## Executive verdict

The deployment is now serving CSS, client JavaScript, the service worker, and map tiles correctly. The remaining product problem is not a single broken component: it is a mismatch between a citizen-facing map and an operator-oriented control system.

The largest visible defects are:

1. Right-side Explore/filters can cover the map chrome without a safe-area contract. Controls disappear behind the drawer instead of moving or being intentionally dismissed.
2. The global trust banner reports “retrying” when the optional NASA FIRMS source is merely unconfigured, even though ANEPC, IPMA, weather, warnings, regional commands, and OSM are healthy.
3. The data vocabulary overstates activity. The current response contains 16 incidents, all `contained`, while compact UI copy still says “active fires”. Raw placeholders such as `--- (Arouca)` reach the priority list.
4. The typography is distinctive but not operationally calm. Fraunces display headings, Bricolage body text, very small uppercase labels, and multiple 9–11px data treatments create visual noise and reduce scan speed.
5. Transient “Live data restored” feedback sits over the map’s primary status/count area and competes with incident selection.

## Evidence collected

### Live visual states

- Wide desktop (1440×900): map renders, but the right rail and map chrome do not share an explicit inset. The legend is large and persistent; Explore covers the right map area and hides map controls.
- Desktop (1280×800): the drawer leaves a narrow map corridor. The map remains usable, but controls are not repositioned relative to the drawer.
- Tablet (1024×768): the compact toolbar works and map remains visible. Toast feedback occupies the top center and can cover map context.
- Phone (390×844): the map and bottom sheet work, but the count/trust pill, toast, controls, and sheet compete for the same vertical map surface.

### Current data response

At audit time:

- ANEPC: healthy, 16 records.
- IPMA fire risk: healthy, 278 records.
- IPMA weather: healthy, 183 records.
- IPMA warnings: healthy, 2 records.
- ANEPC regional commands: healthy, 5 records.
- OSM fire stations: healthy, 91 records.
- NASA FIRMS: error because `FIRMS_MAP_KEY` is not configured.
- Incident payload: 16 records, all `contained`; `ingestedAt` is current while event timestamps vary.
- At least one display name is a raw placeholder (`--- (Arouca)`).

The core data is available. The current UI collapses optional-source failure into a broad retrying/degraded state, which makes the service look less trustworthy than the evidence supports.

### Source and code measurements

- `src/app/page.tsx`: 1,844 lines.
- `src/components/ember-map.tsx`: 1,580 lines.
- `IncidentDetailPanel.tsx`: 898 lines.
- `DashboardPanel.tsx`: 32 uses of faint text tokens and many 9–11px labels.
- Desktop controls use fixed `right-3`/`right-6`; the 360px drawer is positioned independently at `z-30`.
- Legend is positioned independently at `bottom-28 left-6 z-10`.

### Quality evidence

- Unit baseline: 23 files / 61 tests passing.
- Responsive interaction matrix: 320×568, 390×844, 768×1024, 1024×768, 1280×800, 1440×900 passing.
- Axe matrix: 0 violations on home, status, newsletter, and privacy states.
- Lighthouse artifacts: home performance 0.70, status 0.87, privacy 0.87; home LCP about 1.89s, CLS about 0.018. The home page is acceptable but materially heavier than the public content pages.
- Chrome DevTools MCP was not available in this environment, so no INP trace or DevTools dependency graph was collected. The Lighthouse and headless-browser results above are the authoritative available performance evidence.

## Design direction

### 1. Map chrome and drawer contract

Create one `MapChrome` layer owned by the responsive shell. It receives:

```ts
type MapChromeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
```

The shell computes the inset from the actual open panel, not from independent hardcoded offsets:

- wide, rail closed: right inset = 48px;
- wide, Explore open: right inset = 48px + 360px + 16px;
- compact drawer open: right inset = drawer width + 16px;
- phone sheet open: bottom inset = sheet height + safe-area padding.

Map controls, status pill, legend, and playback either move into the remaining map rectangle or hide when their region is too small. They must never be rendered underneath a blocking drawer. The z-index contract becomes map canvas 0, map chrome 10, rail 20, drawer 30, blocking modal 40.

The legend becomes contextual: collapsed by default on wide screens, reduced to incident severity only when the map is busy, and expanded only on user request. Layer-specific legends appear inside Explore when the corresponding layer is enabled.

### 2. Trust and data vocabulary

Split source health into two tiers:

- `core`: ANEPC incidents, IPMA risk/weather, warnings, and regional commands;
- `optional`: NASA FIRMS, OSM stations, aerial, biomass, and experimental layers.

The Situation headline uses core trust. Optional failures appear as a precise Explore/source message such as “Satellite layer unavailable — configure FIRMS_MAP_KEY”, never as “live data retrying”.

Use distinct terms and counts:

- `Visible incidents`: current query result;
- `Active`: statuses detected/active;
- `Contained`: operationally contained but still tracked;
- `Resolved`: hidden by default.

Normalize source values before rendering:

- trim `localidade`, `municipality`, and display names;
- convert `---`, `—`, empty strings, and sentinel values to null;
- fallback display name to municipality, then district, then a localized “Unnamed incident”;
- show `received` and `observed` times separately when their age differs materially;
- expose source and confidence in a compact trust row, not in the headline.

### 3. Typography system

Recommended direction: replace the current editorial display treatment with a single neutral operational sans for interface text, headings, and incident names. Keep a display face only for the brand mark if desired. Use a tabular numeric face only for counts and timestamps.

Typography rules:

- 16px base body on public pages, 14px on dense app surfaces;
- 14px body/data, 12px secondary, 11px metadata;
- no 9px text except chart axes or non-essential map attribution;
- no all-caps for sentence-level labels;
- 44px minimum interactive height;
- consistent line-height and Portuguese diacritic rendering;
- numeric counts use tabular figures and never rely on color alone.

Font options to decide before implementation:

1. **Recommended:** IBM Plex Sans for UI + IBM Plex Mono for data. Clear, civic, and strong at small sizes; one additional font family.
2. **Lowest-risk:** system sans stack for UI + existing mono. Best loading reliability, less brand character.
3. **Minimal change:** retain Bricolage body, remove Fraunces from app headings, and raise all secondary text sizes. Smallest visual delta but does not fully address the user’s font concern.

### 4. Feedback and motion

Move “Live data restored” to a non-blocking status region below the count pill or into a short-lived toast that does not cover map controls. Keep the persistent indicator beside the count, with a reason on demand.

Animation policy:

- no repeated map-wide entrance animation on every refresh;
- animate only new/changed incidents and drawer transitions;
- respect reduced motion;
- do not let a toast or layout transition move the map viewport.

### 5. Information architecture

The default experience should answer three questions in order:

1. What is happening now?
2. Where is it?
3. What can I do next?

Situation owns only trust, counts, priority incidents, and all incidents. Explore owns search, query filters, map layers, and source context. Inspector owns the selected incident’s state, safety action, follow/share, conditions, and evidence. Updates owns news and change history. Analytics and diagnostics remain progressive disclosure.

## Prioritized implementation backlog

### P0 — visual correctness and trust

- Add `MapChromeInsets` and remove every map-control offset that does not consume it.
- Add browser assertions that no map-control bounding box intersects the open Explore drawer.
- Split core vs optional source health and change the headline trust indicator accordingly.
- Normalize placeholder incident names and distinguish active/contained/visible counts.
- Replace the current font treatment after selecting one of the three options above.
- Move/shorten the live-restored toast so it never covers status, controls, or selection targets.

### P1 — citizen usability

- Reduce the legend to contextual severity by default and move layer legends into Explore.
- Make selected incident trust evidence explicit: source, observed age, received age, and confidence.
- Add loading, no-result, stale, and optional-source-unavailable states to every map layer panel.
- Add a first-run explanation for filters versus map layers.
- Make the drawer width and map minimum width explicit at 1280px and 1024px.

### P2 — maintainability and performance

- Extract `MapChrome`, `ExploreDrawer`, and `HomeShell` from `page.tsx`.
- Split `ember-map.tsx` into map setup, layer registration, interaction, and popup modules.
- Replace remaining `any` casts at data boundaries with typed adapters.
- Lazy-load optional layer data and advanced analytics only when Explore opens.
- Add a Chrome DevTools MCP trace for INP, render-blocking resources, and dependency chains.

## Acceptance matrix for the next implementation slice

| Surface | Required proof |
| --- | --- |
| Map + Explore | No overlap between map chrome and drawer at 1280×800 and 1440×900 |
| Core trust | Missing FIRMS key does not mark ANEPC incident status as retrying |
| Data labels | No `---`, empty, or sentinel names in priority lists |
| Typography | No 9px body labels; all primary controls remain readable in PT/EN |
| Phone | Toast, map controls, summary sheet, and bottom nav do not collide at 390×844 |
| Accessibility | Keyboard focus remains in the active drawer; Escape closes only the topmost blocking overlay |
| Performance | Home LCP stays under current ~1.9s baseline while reducing initial optional-layer work |

## Decision needed before implementation

Please choose the typography direction: IBM Plex Sans (recommended), system sans, or minimal Bricolage cleanup. Once selected, the next implementation plan should cover the P0 map chrome/data trust slice first, then typography and IA polish.
