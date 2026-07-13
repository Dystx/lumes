# 3D Incident Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, feature-flagged 3D Incident Focus mode that helps users understand a selected wildfire locally without changing Lumes’s national, operational, top-down map default.

**Architecture:** Keep one MapLibre instance owned by `MapScene` and expose a small imperative camera/controller boundary from `EmberMap`. Phase 1 changes only camera state and UI; Phase 2 first evaluates a transient `fill-extrusion` layer against the existing CARTO `building` source (no new provider or style), then considers a dedicated licensed building source only if that path fails its legal or coverage gates; Phase 3 adds terrain and slope context only after source, device, and attribution gates pass. No phase enables global rotation, touch pitching, cinematic tours, or a second map instance.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Bun, MapLibre GL JS 5.24, Zustand, Tailwind with Ember tokens, Framer Motion, Vitest, Playwright/axe, custom service worker.

## Global Constraints

- Preserve the existing Portugal-wide, top-down map as the default experience.
- Keep `dragRotate: false`, `pitchWithRotate: false`, and `touchPitch: false` globally; 3D is an explicit mode, not a global interaction change.
- Preserve incident markers, selected halo, evacuation zones, risk, stations, satellite, aerial, biomass, composite-risk, news, and community overlays.
- Never allow buildings or terrain to obscure incident markers, evacuation boundaries, or safety-critical labels.
- Use existing `--ember-*` tokens, icon wrappers, PT/EN translations, 4/8px spacing, and 44px minimum targets from `docs/DESIGN.md`.
- Respect `prefers-reduced-motion`; a reduced-motion user must receive a short or instant camera transition, never a forced cinematic animation.
- Provide an accessible 2D fallback and an explicit “Return to Portugal overview” action.
- Keep the change isolated from the already oversized `src/app/page.tsx`; page orchestration may pass typed props but must not own MapLibre imperative logic.
- Do not copy source code, palette, or complete visual design from the `london-3d` repository. Its README is treated only as interaction inspiration; no repository-level license was confirmed at the inspected `main/LICENSE` path, so reuse rights must not be assumed.
- Review and record the licenses, attribution requirements, coverage, rate limits, and terms for every building, terrain, style, glyph, raster, and tile provider before enabling those layers in production.
- No database migration, deployment, production flag enablement, or new external provider is part of Phase 1.

---

## 1. Operational rationale

### Phase 1 execution status (2026-07-11)

Implemented and verified: the feature-flagged camera-only mode, typed camera
boundary, readiness/capability policy, localized Inspector/map controls,
responsive mobile sheet transition, Escape priority, focus restoration, and
default-off rollback. Buildings, terrain, style switching, and new providers
remain deliberately unimplemented and gated for later phases.

Final Phase 1 verification (2026-07-11): the flagged production build passed
the focused browser flow at 1440px, 768px, and 390px, including normal and
reduced-motion runs, mobile visible action labels, expanded-legend spacing,
tablet-toolbar spacing, Escape/focus restoration, and national reset. The
default-off production build passed the flag-off browser gate, six-viewport
responsive checks, and the 24-page axe matrix with zero violations. Lint,
TypeScript, and all 75 unit/contract tests also passed. The Prisma test schema
fallback warning and Next workspace-root warning are known environment
warnings; neither changed the acceptance result.

3D is justified only when it answers a local operational question that the national overview cannot answer quickly: “What settlements, roads, stations, or evacuation areas are immediately around this incident?” A controlled pitch and zoom can provide local orientation while retaining the map’s trust model and live overlays. It must not become a city-tour, cinematic flyover, fire-spread simulation, or decorative globe.

The feature therefore has a strict product rule:

> 3D is a temporary inspection lens for one incident; 2D remains the authoritative operational workspace.

This order protects the current priorities: incident correctness, source freshness, filtering, selection/inspector reliability, responsive layout, accessibility, and map architecture. If any 3D layer fails, the incident remains fully usable in 2D.

The reference demo demonstrates useful interaction ideas—landmark/incident fly-to, controlled pitch, local building context, an exit/reset action, and responsive controls—but its OpenFreeMap/OpenMapTiles data path and visual treatment are not Lumes dependencies. Lumes will use documented MapLibre camera and layer APIs against its own styles and providers.

## 2. Exact user flow

### Entry from the incident inspector

1. The user starts in the existing Portugal overview. The camera is top-down (`pitch = 0`) and the current basemap and overlays are unchanged.
2. The user selects an incident from a marker, cluster, priority row, or search result. The existing Inspector opens; no camera movement is triggered merely by selection.
3. When `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS=1`, WebGL is supported, the incident has valid coordinates, and the device passes the soft capability policy, the Inspector shows an outlined secondary action:
   - PT: `Explorar área em 3D`
   - EN: `Explore area in 3D`
4. The user activates the action. The controller captures the current camera once, announces `A abrir foco 3D do incidente` / `Opening 3D incident focus`, and switches the mode state to `entering`.
5. The controller performs a bounded transition toward the incident. In normal motion it uses a short `flyTo`/`easeTo` sequence that increases zoom and pitch without changing bearing; in reduced motion it uses `jumpTo`-equivalent behaviour with no prolonged animation.
6. Once the camera reaches the target, the map displays a persistent mode badge: `Foco 3D · <incident name>` / `3D focus · <incident name>`. The badge includes an accessible exit button and does not cover the Inspector, attribution, markers, or map controls.
7. The user can inspect the local area. Phase 1 retains all current operational layers and does not add buildings or terrain. Later phases may add bounded local context, but only beneath safety overlays.

### Leaving 3D Incident Focus

The mode has two distinct exit actions so the user does not lose context accidentally:

- `Sair do foco 3D` / `Exit 3D focus`: restore the saved pre-focus local camera (center, zoom, bearing, pitch, and padding) and return to ordinary 2D mode.
- `Voltar à vista de Portugal` / `Return to Portugal overview`: reset to the documented national camera (`center [-8.0, 39.5]`, `zoom 6.2`, `bearing 0`, `pitch 0`) and clear the saved focus camera.

8. Pressing `Escape` exits only 3D mode when no higher-priority dialog or sheet owns Escape. Focus returns to the button that opened 3D.
9. Closing the incident Inspector exits 3D mode and restores the saved local 2D camera. Selecting another incident while already focused exits the old target and starts a new bounded focus transition only after the user explicitly confirms or presses the new incident’s 3D action.
10. If WebGL, capability, geometry, provider, or layer checks fail, the 3D action is hidden or disabled with a plain-language explanation; the Inspector and 2D map remain fully functional.

## 3. Recommended technical approach

### Recommendation

Use the existing CARTO/EOX map instance and implement Phase 1 as a **camera-only controlled mode**. For Phase 2, first run a bounded extrusion experiment against the current CARTO `carto` source and `building` source-layer. Only if that experiment fails licensing, coverage, or performance gates should the plan evaluate a separate self-hosted building archive. Do not switch to a second basemap/style for this feature.

This is the lowest-risk path because:

- the current map already has a single-instance boundary and a documented `style.load` restoration path;
- the current style swap already removes and recreates Lumes sources/layers, so introducing another style would multiply restoration and attribution risk;
- an existing-source building layer can be disabled or removed independently without touching incident data or the current basemap;
- operational layer order can be asserted explicitly with `getLayersOrder()`/`moveLayer()`;
- the mode can fall back to camera-only 3D or ordinary 2D when building coverage is weak.

### MapLibre APIs to use

The implementation should use documented MapLibre functionality only:

- `flyTo`, `easeTo`, `jumpTo`, `getCenter`, `getZoom`, `getBearing`, `getPitch`, and `getPadding` for camera capture and transitions;
- `addSource`, `addLayer`, `removeLayer`, `removeSource`, `moveLayer`, and `getLayersOrder` for optional context layers;
- `style.load`/`isStyleLoaded` for idempotent restoration after a style change;
- `maplibregl.supported()` or the version-appropriate documented WebGL-support check before exposing the action;
- `fill-extrusion` only for a licensed, coverage-tested building source;
- `setTerrain`/`raster-dem` and `hillshade` only in Phase 3 after a separate terrain gate.

Reference documentation: [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), [MapLibre fill-extrusion style specification](https://maplibre.org/maplibre-style-spec/layers/#fill-extrusion), and the [MapLibre 3D terrain examples](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/).

## 4. Approach comparison

| Approach | Advantages | Risks / cost | Decision |
| --- | --- | --- | --- |
| Existing CARTO `building` source + transient `fill-extrusion` | Reuses a source already loaded by the current style; no second provider, PMTiles archive, or building tile request; preserves current overlays and attribution path; can be disabled per device/coverage | CARTO terms still need approval; source maxzoom is 14 and rural height/feature coverage is weak; style contract can change; requires runtime schema/TileJSON checks | **First Phase 2 experiment**, not production-approved |
| Dedicated licensed building vector source + `fill-extrusion` in current Lumes style | Provider-neutral fallback if the existing CARTO path fails; explicit ordering; independently removable; can be self-hosted and pinned | Requires extraction/hosting or another provider, Range/CORS/cache operations, attribution, refresh/rollback, and a second source to restore after style swaps | **Fallback Phase 2 path only after separate approval** |
| Separate 3D-compatible basemap/style | May provide ready-made building source, glyphs, and a coherent 3D style; less initial layer authoring | `setStyle` can remove the current style and rebuild it; all custom sources/layers, raster handling, icons, attribution, advanced hosts, and latest GeoJSON must be restored; styles may have incompatible labels/colours/licences; service-worker and cache invalidation become harder | **Rejected for Phase 1 and not preferred for Phase 2**; consider only as a separately approved experiment |

The reference demo’s OpenFreeMap/OpenMapTiles route is therefore not pasted into Lumes. The existing CARTO source is the first bounded experiment, but its terms still require explicit review. If a future provider is selected, the plan must include a licence/terms record, visible attribution, Portugal coverage sample, field schema, rate-limit statement, and rollback to camera-only 3D.

## 5. Full UI specification

### Desktop (`xl` / 1280px+)

- Keep the existing Situation rail, map, and Explore/Inspector rails.
- Put `Explorar área em 3D` inside the selected incident Inspector below the primary incident context and before secondary evidence actions. It is a secondary action, never the primary incident status CTA.
- Add a compact map status pill in the existing map-chrome boundary: `Foco 3D` plus the incident name and an `Sair` button. The pill must be inset from the rail/drawer collision boundaries documented by the current map-chrome plan.
- Keep attribution visible in the existing MapLibre attribution control. Do not place the exit action over attribution.
- Do not show a cinematic tour, compass-driven free rotation, audio, day/night palette, or decorative 3D overlay.

### Tablet (`768–1279px`)

- Keep the map-first layout. The Inspector opens as a sheet/drawer using the existing responsive shell.
- Place the CTA in the incident sheet and pin the mode status/exit action to the map-safe chrome region with 44px target size.
- When a sheet would cover the selected incident, use the existing map padding/inset contract before moving the camera; do not add a second map or full-screen 3D route.

### Mobile (`<768px`)

- The default remains the existing fixed map with the 56px summary and 92vh incident detail sheet.
- Place the CTA in the detail sheet with copy that explains the mode is optional and local: `Explorar esta área em 3D` / `Explore this area in 3D`.
- While active, show a safe-area-aware bottom status control with `Sair do foco 3D` and a second action for `Voltar à vista de Portugal`. Both controls are at least 44×44px.
- Do not enable gesture rotation or touch pitching. Panning and zoom remain the existing map interactions; pitch is controller-owned.
- If the soft device gate rejects the device, show an inline unavailable state with the 2D action still prominent.

### UI states

Every UI surface has these explicit states:

1. hidden when the feature flag is off;
2. available and idle;
3. entering with a stable label and disabled repeat activation;
4. active with mode badge and exit actions;
5. unavailable with a reason (WebGL, reduced capability, missing incident geometry, provider unavailable, or 3D data unavailable);
6. exiting/restoring;
7. 2D fallback with no loss of incident selection or operational overlays.

All copy is added to both PT and EN in `src/lib/i18n.ts`; no hardcoded English labels are introduced in map components.

## 6. Phase 1 MVP

Phase 1 is a **camera-focus MVP**, not a building or terrain product.

Included:

- `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS`, default `false` in all environments;
- explicit Inspector CTA for a selected incident with valid point geometry;
- a pure controller that captures/restores camera state;
- bounded center/zoom/pitch transition, with pitch capped at 45° by default and never above 55° in Phase 1;
- bearing preserved from the current camera (no automatic rotation);
- persistent mode status and explicit local exit/national overview actions;
- Escape handling and focus restoration through the existing overlay stack;
- 2D fallback when WebGL/capability/geometry checks fail;
- reduced-motion handling through the existing `mapMotionOptions` policy;
- unchanged incidents, risk, evacuation, station, satellite, aerial, biomass, composite-risk, news, and community layers;
- existing CARTO/EOX styles, attribution, and service-worker behaviour unchanged;
- unit, contract, responsive, accessibility, and feature-flag browser coverage.

### Explicitly excluded from Phase 1

- building footprints or `fill-extrusion`;
- terrain, DEM, hillshade, slope, contour, or elevation queries;
- a second 3D basemap or `setStyle` call initiated by the mode;
- OpenFreeMap/OpenMapTiles or any new external provider;
- free rotation, compass rotation, touch pitch, keyboard camera tour, or automatic orbit;
- cinematic tours, audio, day/night palette changes, weather particles, or decorative atmosphere;
- fire-spread prediction, smoke simulation, or claims about line-of-sight/safety;
- route navigation, evacuation route calculation, parcel/ownership detail, indoor geometry, or persistent camera preferences;
- changing the global map defaults or enabling 3D by URL for ordinary users;
- database changes, new telemetry containing private coordinates, or production flag enablement.

## 7. Required MapLibre wrapper changes

`src/components/ember-map.tsx` remains the adapter around the MapLibre instance, but it must not become the owner of 3D UI or business rules.

Required boundary changes:

1. Extend `EmberMapHandle` with typed imperative methods:

```ts
export interface CameraSnapshot {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  padding: maplibregl.PaddingOptions;
}

export interface IncidentFocusTarget {
  incidentId: string;
  center: [number, number];
  zoom: number;
  pitch: number;
}

export interface EmberMapHandle {
  // Existing methods remain unchanged.
  enterIncidentFocus: (target: IncidentFocusTarget) => CameraSnapshot | null;
  exitIncidentFocus: (snapshot: CameraSnapshot | null) => void;
  returnToPortugalOverview: () => void;
  getCameraSnapshot: () => CameraSnapshot | null;
  isMapReady: () => boolean;
}
```

2. Delegate camera calculations and transitions to `src/lib/map/incident-focus-controller.ts`; the wrapper only supplies the MapLibre instance and current reduced-motion preference.
3. Keep the current map constructor interaction defaults unchanged.
4. Keep existing style effects and source update effects working when `mode` changes; entering Phase 1 must not call `setStyle`.
5. Add a future-safe restoration hook (`restoreOperationalLayers`) around the existing `style.load` path so Phase 2 building layers and advanced hosts can rehydrate idempotently. The current `addEmberSourcesAndLayers` cleanup must not remove an optional layer without the registry re-adding it.
6. Emit a typed `lumes:map-style-restored` event after a successful style restoration, in addition to the existing `lumes:map-ready`, so `AdvancedMapLayers` and future 3D layers can rebind after a CARTO theme swap.
7. Keep source updates replayable: the latest incident/risk/station/satellite data must be available to restore functions rather than relying on a one-time `load` event.

## 8. Proposed components, hooks, and controller modules

### New modules

- `src/lib/features.ts`: typed feature flags, including `incidentFocus3d`, defaulting to `false` and reading only the approved public build-time flag.
- `src/lib/map/incident-focus-controller.ts`: pure camera policy and transition orchestration. Exports `CameraSnapshot`, `IncidentFocusTarget`, `IncidentFocusState`, `captureCameraSnapshot`, `buildIncidentFocusCamera`, `enterIncidentFocus`, `exitIncidentFocus`, and `returnToPortugalOverview`.
- `src/lib/map/incident-focus-capability.ts`: browser/device policy. Exports `IncidentFocusCapability = { allowed: boolean; reason: ... }` and `getIncidentFocusCapability({ webglSupported, reducedMotion, hardwareConcurrency, deviceMemory, viewportWidth })`.
- `src/lib/use-incident-focus.ts`: React hook that connects selected incident, `EmberMapHandle`, feature flag, capability state, and overlay focus return without importing MapLibre UI code into `page.tsx`.
- `src/components/map/incident-focus-controls.tsx`: Inspector CTA, status pill, exit actions, loading/unavailable states, keyboard labels, and PT/EN copy.
- `src/lib/map/operational-layer-registry.ts`: Phase 2/3 registry for custom source/layer specifications, latest data replay, attribution, and deterministic restoration after `style.load`.

### Existing modules to adapt

- `src/components/ember-map.tsx`: thin MapLibre adapter and restoration boundary.
- `src/components/map/map-scene.tsx`: pass the typed map handle and keep the single-instance/resize contract.
- `src/app/page.tsx`: pass selected incident and callbacks only; no camera calculations or mode-specific JSX beyond shell placement.
- `src/components/mobile/mobile-view.tsx`: place the mobile CTA/status in the existing sheet/chrome boundary.
- `src/components/advanced-layers-host.tsx`: listen for `lumes:map-style-restored` before Phase 2 layers are introduced.
- `src/lib/map-motion.ts`: extend the existing reduced-motion policy with named incident-focus durations and maximum pitch constants.
- `src/lib/i18n.ts`: add PT/EN labels and unavailable reasons.
- `docs/DESIGN.md` and `docs/ARCHITECTURE.md`: document the optional mode, layer order, and default-off contract.

## 9. Layer-ordering requirements

The exact provider style layer IDs must be discovered at runtime; do not assume a CARTO or future provider names its background/labels identically. After every initial load and style restoration, the registry must assert and repair the logical order below with `moveLayer` where the target IDs exist:

1. Provider background, water, land, roads, and base labels.
2. Optional terrain/hillshade/color-relief context (Phase 3 only), beneath operational data.
3. Optional building extrusion (Phase 2 only), with low opacity and a zoom range that prevents national-view clutter.
4. Fire-risk circles/heat or municipality context.
5. Evacuation fills, then evacuation boundary lines.
6. Satellite/FIRMS detections and other ground context.
7. Fire-station symbols and labels.
8. Community, institutional, news, and other signal symbols.
9. Incident cluster circles and counts.
10. Individual incident symbols and the selected incident halo.
11. Labels, focus affordances, popups, and interaction overlays.

Buildings must never be inserted above incident icons, selected halo, evacuation lines, or safety-critical labels. If a provider style cannot support this order, the building layer is disabled and the camera-only mode remains available.

Phase 2 building layer requirements:

- use a separate source ID such as `lumes-buildings` and layer ID such as `lumes-buildings-extrusion`;
- require a documented `height`/`min_height` field mapping or a deterministic low-height fallback that is explicitly labelled as approximate;
- guard invalid values with expressions that produce height `0` and filter out features without valid geometry;
- use `minzoom` so buildings do not render at the national overview;
- keep opacity and colour within existing Ember map tokens, not the reference demo palette;
- record provider attribution in the MapLibre attribution control and the public data-sources surface.

## 10. Camera state and reset behaviour

The controller owns a small state machine:

```ts
type IncidentFocusMode = "overview" | "entering" | "active" | "exiting";

interface IncidentFocusState {
  mode: IncidentFocusMode;
  incidentId: string | null;
  savedCamera: CameraSnapshot | null;
}
```

Rules:

- Save the camera only at the first successful entry, not on every render or live data update.
- Keep the current bearing unless the current bearing is unavailable; do not rotate to a cinematic heading.
- Target zoom is derived from the current zoom and viewport, clamped to a safe local range (Phase 1: 9–13) so a selected point cannot jump to an unusable street view.
- Target pitch is 45° in normal mode, capped at 55° by the controller; the exact value is a named constant covered by unit tests.
- Use `flyTo` for the bounded center/zoom move and `easeTo` for the short pitch completion, or one `flyTo` when the reduced-motion policy requests no prolonged motion.
- Call `map.stop()` before a new entry/exit so an old transition cannot finish after the user has changed incidents.
- On `exitIncidentFocus`, restore the saved camera with `pitch: 0` unless the saved camera was already pitched by the user’s existing controls; Phase 1’s global controls remain top-down.
- On `returnToPortugalOverview`, use the documented national camera and clear `savedCamera`.
- Live incident updates must never reset the camera or exit focus; only explicit user actions or invalidated target geometry may do so.
- If the selected incident disappears from the visible query set, exit focus before the existing selection-reconciliation logic clears the Inspector.

## 11. Mobile, accessibility, and reduced motion

- Do not rely on colour, depth, or animation alone to communicate mode; pair the mode badge with text and an icon.
- All controls use semantic buttons, visible focus rings, `aria-label`, and `aria-pressed` where appropriate.
- Announce entry, unavailable reasons, and exit in an `aria-live="polite"` status region; do not announce every camera frame.
- `Escape` closes only the topmost blocking overlay or the active 3D mode, following `src/lib/overlay-stack.ts`.
- Restore focus to the exact Inspector CTA that opened the mode.
- Respect Portuguese and English copy, including diacritics and the current public-shell locale contract.
- Use `prefers-reduced-motion: reduce` to set duration `0`/`essential: false`; keep the camera readable by using `jumpTo` or a single short update.
- Keep the existing touch gesture policy. Do not call `dragRotate.enable()` or `touchPitch.enable()` in the feature.
- On mobile, use safe-area insets and the existing map-chrome offsets so the status/exit control never covers attribution, bottom navigation, or the incident sheet.
- Keep 44×44px minimum targets and test at 320×568, 390×844, 768×1024, 1024×768, 1280×800, and 1440×900.

## 12. Performance safeguards and device capability checks

### Capability policy

Hard-block only when WebGL is unavailable, the map is not ready, or incident coordinates are invalid. Use a soft low-capability policy for building/terrain layers:

- WebGL support must be true.
- On phones, require at least `hardwareConcurrency >= 4` when that property is available; otherwise keep camera-only 3D and do not load buildings.
- When `navigator.deviceMemory` exists and is below 4 GiB, keep camera-only 3D and do not load buildings/terrain.
- Treat `prefers-reduced-motion` as a motion policy, not a reason to hide the feature.
- Do not disable desktop focus solely because the viewport is narrow; use the mobile limits above.
- Expose a deterministic test override in unit/browser tests, not a production URL switch.

### Runtime safeguards

- Never create a second MapLibre instance.
- Do not load building or terrain sources until the user enters focus and the provider/coverage gate passes.
- Limit Phase 2 buildings to a local bounding box around the selected incident and a bounded zoom range.
- Keep `fill-extrusion-opacity` low enough for operational overlays to remain legible; disable the layer if tiles fail or geometry count exceeds the agreed local budget.
- Cancel pending transitions and tile work on exit or target change.
- Avoid React state updates per frame; store map camera transitions in the controller and publish only mode/phase changes.
- Keep the existing lazy boundaries for aerial, biomass, and composite risk; 3D must not pull optional data into the critical path.
- Add Lighthouse/Playwright checks for no unexpected layout shift, no horizontal overflow, and no material increase in initial load when the flag is off.

## 13. Risk register and mitigations

| Risk | Why it matters in Lumes | Mitigation / acceptance gate |
| --- | --- | --- |
| Style reloads | `setStyle` can rebuild the style and remove custom sources/layers; current theme switching already calls `addEmberSourcesAndLayers` after `style.load` | Phase 1 never switches style. Before Phase 2, centralize an idempotent registry, replay latest GeoJSON data, restore ordering, and test a dark→light→dark swap while focus is active. |
| Custom layer restoration | Advanced biomass/risk/aerial hosts listen to `lumes:map-ready`, which is not enough for later style swaps | Emit `lumes:map-style-restored`, make every optional host idempotent, and assert source/layer counts and visibility after each restore. |
| Service-worker caching | Same-origin style/metadata proxies or static provider manifests could be served stale; current SW deliberately bypasses cross-origin tiles, APIs, and Next chunks | Keep Phase 1 on existing URLs. For Phase 2, either keep provider requests cross-origin (SW bypass) or add explicit network-owned same-origin routes; bump `CACHE_NAME` only when a cached asset contract changes, and test fresh-browser activation. |
| Map attribution | CARTO, MapLibre, EOX/Sentinel-2, OSM, FIRMS, building, and terrain providers may each require attribution | Build a typed attribution registry, merge it into the existing AttributionControl, expose a mobile-visible attribution disclosure, and block a provider without terms/attribution proof. |
| Weak/incomplete building data | Portugal-wide building coverage, height properties, rural settlements, and tile latency may vary | Treat buildings as optional context. Require coverage samples around incident types, valid height/base fields, and a tile-error fallback to camera-only 3D/2D. Never render fake precision or claim a missing building means no settlement. |
| Operational overlays obscured | Extrusions can hide ground markers, evacuation lines, labels, or selected halo | Enforce the layer order above, use low opacity, add screenshot/browser checks at pitched zoom, and retain a one-click 2D fallback. |
| Weak devices/battery | 3D tiles and extrusions can exhaust mobile GPU/memory | Soft capability gate, no buildings/terrain on low-capability devices, bounded local tile loads, transition cancellation, and no persistent animation. |
| Misleading safety inference | A pitched view can look authoritative while not representing fire spread or visibility | UI copy says `local context`/`contexto local`; exclude fire-spread, line-of-sight, and evacuation-route claims from this feature. |
| Provider terms/licence drift | External tiles/styles can change terms, URLs, or availability | Record provider terms and attribution in a reviewed document; add a kill switch and keep Phase 1 provider-independent. |

## 14. Phased roadmap

### Phase 1 — Controlled incident camera focus

Dependency: reliability-first refactor, map ownership/resize contract, selection/Inspector correctness, current responsive and a11y gates.

Deliverables:

- feature flag off by default;
- Inspector CTA, mode badge, local exit, Portugal overview reset, Escape/focus return;
- camera controller, snapshot/restore, reduced-motion policy, capability checks;
- no building source, terrain source, style switch, or new provider;
- tests and documentation listed in the implementation sequence below.

### Phase 2 — Local 3D buildings

Dependency: Phase 1 acceptance, CARTO licence/attribution review, runtime style/TileJSON contract validation, incident-local coverage/height-field validation, deterministic style restoration, and a mobile GPU budget. A separate building archive is a fallback only if the existing CARTO experiment fails these gates.

Deliverables:

- first, a transient `fill-extrusion` layer using the existing CARTO `carto` / `building` source with `render_height`, `render_min_height`, and `hide_3d` validation;
- if CARTO is rejected, a separately approved, pinned building archive and dedicated source;
- local bounding box and zoom gate around the selected incident;
- optional building availability state and tile-error fallback;
- operational layer registry and style-restoration event;
- desktop/tablet default enabled only for approved capability; mobile camera-only by default;
- browser screenshots and layer-order assertions at pitched zoom.

### Phase 3 — Terrain and slope context

Dependency: Phase 2 stability, licensed DEM/raster source, attribution, tile-cost budget, and an explicit product review that the layer explains terrain rather than predicting spread.

Deliverables:

- optional `raster-dem`/`setTerrain` source;
- hillshade, slope, or contour context below safety overlays;
- local-only loading around a focused incident;
- reduced-motion and low-capability fallback to flat 2D or camera-only 3D;
- documentation that terrain context is observational and not a fire-spread forecast.

## 15. Phase 1 acceptance criteria

Phase 1 is accepted only when all of the following are true:

1. With the feature flag off, the default Portugal map, camera, source requests, layer visibility, and existing screenshot/interaction contracts are unchanged.
2. With the flag on and a valid incident selected, the Inspector exposes the CTA in PT and EN; activation sets mode to `entering` then `active`, centers the incident, increases zoom, and sets pitch within the tested 45–55° bound.
3. Bearing remains unchanged; `dragRotate`, `pitchWithRotate`, and `touchPitch` remain disabled globally.
4. Incident markers, selected halo, evacuation zones, risk data, fire stations, satellite/FIRMS, aerial, biomass, composite-risk, news, and community overlays remain present and readable.
5. `Sair do foco 3D` restores the saved local camera; `Voltar à vista de Portugal` restores center `[-8.0, 39.5]`, zoom `6.2`, bearing `0`, pitch `0`; Escape follows the overlay-stack rule and restores focus.
6. Reduced-motion users receive no prolonged camera animation and no persistent animated 3D effect.
7. Unsupported WebGL, invalid coordinates, unavailable map readiness, or soft low-capability decisions leave the 2D map usable and expose an understandable unavailable/fallback state.
8. No building, terrain, style, or new external provider request occurs when Phase 1 is enabled.
9. The mode status and controls are keyboard reachable, labelled, focus-visible, screen-reader announced, localized, and safe at all required viewports with no horizontal overflow.
10. Existing `style.load` theme changes do not leave the map in a partially restored state; the current operational source/layer contract and `lumes:map-ready` behaviour remain green.
11. Attribution remains visible for current CARTO/MapLibre/EOX/OSM/FIRMS sources, and the plan blocks any future 3D provider without its attribution record.
12. Unit, typecheck, lint, build, responsive, axe, and focused incident-flow browser gates pass. The feature is not enabled in production as part of this plan.

## 16. Files likely to be created or modified

### Phase 1 implementation surface

- Create: `src/lib/features.ts`
- Create: `src/lib/map/incident-focus-controller.ts`
- Create: `src/lib/map/incident-focus-capability.ts`
- Create: `src/lib/use-incident-focus.ts`
- Create: `src/components/map/incident-focus-controls.tsx`
- Modify: `src/components/ember-map.tsx`
- Modify: `src/components/map/map-scene.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/mobile/mobile-view.tsx`
- Modify: `src/lib/map-motion.ts`
- Modify: `src/lib/i18n.ts`
- Modify: `docs/DESIGN.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `tests/lib/incident-focus-controller.test.ts`
- Create: `tests/lib/incident-focus-capability.test.ts`
- Create: `tests/lib/incident-focus-contract.test.ts`
- Create: `tests/e2e/incident-focus.test.ts`
- Modify: `tests/e2e/responsive-interactions.test.ts`
- Modify: `tests/e2e/a11y.test.ts`

### Phase 2/3 reserved surface

- Create: `src/lib/map/operational-layer-registry.ts`
- Modify: `src/components/advanced-layers-host.tsx`
- Modify: `src/components/ember-map.tsx`
- Modify: `public/sw.js` only if a same-origin cached manifest or proxy is introduced
- Create: `docs/providers/3d-context-sources.md` containing licence, attribution, coverage, fields, rate limits, fallback, and retirement procedure
- Create: `tests/lib/map-layer-order.test.ts`
- Create: `tests/e2e/incident-focus-buildings.test.ts`

## 17. Implementation sequence and quality gates

### Task 1: Lock the capability and camera contracts

**Files:** create `src/lib/features.ts`, `src/lib/map/incident-focus-controller.ts`, `src/lib/map/incident-focus-capability.ts`, `tests/lib/incident-focus-controller.test.ts`, `tests/lib/incident-focus-capability.test.ts`.

- [x] Add the default-off flag and exact `IncidentFocusMode`, `CameraSnapshot`, `IncidentFocusTarget`, and capability reason unions from this plan.
- [x] Write unit tests for national reset, snapshot round-trip, zoom/pitch clamps, unchanged bearing, invalid coordinates, reduced motion, safe insets, and low-capability outcomes.
- [x] Run the focused controller/capability suite; it passes after the red-first implementation.
- [x] Keep this task pure: no MapLibre import in the controller/capability modules and no browser UI.

### Task 2: Add the MapLibre imperative boundary without changing defaults

**Files:** modify `src/components/ember-map.tsx`, `src/components/map/map-scene.tsx`, `src/lib/map-motion.ts`; create `tests/lib/incident-focus-contract.test.ts`.

- [x] Add the typed handle methods and route all camera work through the controller.
- [x] Preserve the existing map constructor options and all existing source-update effects.
- [x] Add typed style-restoration event plumbing without introducing a `setStyle` call in the mode.
- [x] Assert in contract tests that one MapLibre owner remains, `dragRotate`/`touchPitch` defaults remain disabled, and the new handle methods are exposed.
- [x] Run the map contracts, typecheck, and lint gates.

### Task 3: Add the Inspector and map-chrome UI

**Files:** create `src/components/map/incident-focus-controls.tsx`, `src/lib/use-incident-focus.ts`; modify `src/app/page.tsx`, `src/components/mobile/mobile-view.tsx`, `src/lib/i18n.ts`.

- [x] Render the CTA only for a selected valid incident and an enabled capability.
- [x] Implement entering, active, exiting, unavailable, and fallback states with PT/EN labels and live-region announcements.
- [x] Keep the page component as a typed composition boundary; the hook owns mode state and the component owns presentation.
- [x] Add desktop, tablet, and mobile placements using the existing map-chrome and sheet contracts.
- [x] Run typecheck, lint, and focused component/unit tests before browser work.

### Task 4: Prove responsive, accessibility, and reduced-motion behaviour

**Files:** create `tests/e2e/incident-focus.test.ts`; modify `tests/e2e/responsive-interactions.test.ts`, `tests/e2e/a11y.test.ts`.

- [x] Add browser coverage for share-link selection → Inspector → enter → local exit → national reset, Escape/focus return, mobile sheet collapse, and flag-off invisibility.
- [x] Run the required responsive viewport matrix and axe checks, plus the focused reduced-motion flow.
- [x] Verify mode controls do not overlap attribution or map controls; mobile mode removes the detail sheet from the active map.

**Phase 1 continuation evidence (2026-07-13):** compact/tablet focus now
temporarily owns the map tab even when the Inspector was opened from
Incidents, Alerts, or More. The previous tab is restored after exit/overview,
the compact sheet is kept collapsed while focus is active, and non-map tab
buttons are disabled during the camera mode. A second guard exits through the
same camera-restore path when a live refresh leaves the focused incident with
invalid geometry while retaining its ID. The focused UI/hook contracts pass,
the feature-enabled standalone browser flow passes at 1440px, 768px, and
390px (including the non-map-tab entry path), and the serialized suite passes
**148 files / 723 tests**. Provider/building/terrain work remains gated.

**Phase 1 verification continuation (2026-07-13):** the mobile ownership guard
also now derives the sheet height from its focus-aware collapsed state, covering
entry from an already-expanded map peek. The feature-enabled CI contract now
preserves the default-off smoke and runs normal-motion plus reduced-motion
browser flows against a rebuilt flag-enabled standalone artifact. Current
focused contracts and the serialized suite pass (**149 files / 725 tests**);
Phase 1 remains camera-only and provider/building/terrain work remains gated.

**Phase 1 verification continuation (2026-07-13, desktop chrome):** the
feature-enabled desktop browser flow caught an actual overlap between the
focus status and the attribution card. The shared `MapChrome` primitive now
supports a bounded `topOffset`, applied only to the desktop focus status at
48px. Normal and reduced-motion feature-enabled standalone flows pass with
the non-overlap assertion; the current serialized suite passes **149 files /
726 tests**. Phase 1 remains camera-only and all provider/building/terrain
gates remain closed.

**Phase 1 verification continuation (2026-07-13, style restoration):** active
camera-only focus now preserves its exitable state while an existing MapLibre
style transition temporarily reports `mapReady=false`. The feature-enabled
browser flow exercises dark↔light changes during focus and verifies that the
status remains visible and operational incident data becomes ready again in
both normal and reduced-motion modes. The current serialized suite passes
**149 files / 727 tests**. Phase 1 remains camera-only and provider/building/
terrain work remains gated.

**Phase 1 verification continuation (2026-07-13, edge viewports):** the
feature-enabled browser flow now covers the remaining 1280×800 and 320×568
edge viewports in addition to 1440×900, 768×900, and 390×844. The compact
assertion treats intentionally hidden map controls as absent, while still
requiring the focus status and checking every rendered control/attribution box
for overlap. Reduced-motion checks wait for the actual focus/tab restoration
state. CI sets `LUMES_3D_FIXTURE=1` for this gate so the UI proof uses the
stable repository incident fixture rather than depending on a live ANEPC
occurrence. The default-off smoke remains unchanged; Phase 1 is still
camera-only and provider/building/terrain work remains gated. The serialized
suite was rerun after the test/CI/doc tranche: **149 files / 727 tests passed**.

### Task 5: Gate Phase 2 building context before production building code

**Files:** create `docs/providers/3d-context-sources.md`; create `src/lib/map/operational-layer-registry.ts`; create `tests/lib/map-layer-order.test.ts` only after a provider is approved.

- [x] Record at least one candidate provider’s licence/terms, attribution text, Portugal coverage sample, height/base schema, rate limit, error behavior, and retirement path.
- [x] Reject the candidate if it cannot guarantee the data and terms required for public use; keep camera-only mode as the fallback.
- [x] Record the existing CARTO style/TileJSON contract (`carto` source, `building` source-layer, height/base fields, maxzoom, and attribution) as the first bounded Phase 2 experiment.
- [ ] Keep the registry and production building layer blocked until CARTO licensing, coverage, mobile performance, and style-restoration gates are explicitly approved.
- [x] If CARTO fails, evaluate the already-gated Protomaps/Overture fallback; do not introduce a second provider merely to imitate the London demo.

**Fallback evaluation evidence (2026-07-13):** the provider record now
contains a self-hosted Protomaps Basemap assessment, pinned archive/sample
measurements, schema/attribution/operations requirements, and the explicit
decision to keep it gated. This closes the conditional evaluation task; it does
not approve a provider or authorize a PMTiles dependency.

**Provider-gate evidence (2026-07-12):** `docs/providers/3d-context-sources.md` records the OpenFreeMap public-instance audit. The Liberty style exposes `building-3d` with `render_height`/`render_min_height`, and z14 tile requests returned HTTP 200 for Lisbon, Porto, and Monchique. The public instance has no SLA, no published numeric capacity guarantee, and terms that allow discontinuation and restrict automated collection, so it is rejected for production use. Phase 1 remains camera-only; no building source, style swap, registry, or provider-specific request was added.

**Provider-gate continuation (2026-07-12):** the same record now evaluates a
self-hosted Portugal extract from Protomaps Basemap as the preferred Phase 2
research candidate. Its documented `buildings` source-layer exposes
`height`/`min_height`, and PMTiles can be served from Lumes-controlled storage,
but coverage, height completeness, storage/CORS operations, attribution, and
mobile performance still require an isolated spike. No provider is approved,
and Phase 1 remains camera-only.

**Provider-gate continuation (2026-07-12, extraction/operations audit):**
Protomaps remains **KEEP GATED**. The official path supports clipping a dated
Version 4 archive with `pmtiles extract`, but there is no official Portugal
archive or coverage/height guarantee. The required next spike is to pin and
hash an archive, extract mainland/island samples, decode z14–z16 Lisbon/Porto/
Monchique/rural/incident tiles, measure feature and usable-height coverage,
range-request/byte/latency costs, benchmark desktop/mobile extrusion impact,
and record ODbL/OSM/Protomaps attribution plus archive/CORS/ETag/rollback
operations. No PMTiles dependency, building source, registry, or style swap is
authorized before those gates pass.

**Provider-gate evidence (2026-07-12, bounded PMTiles samples):** the dated
`20260712.pmtiles` archive was range-inspected and pinned by its published
BLAKE3 hash (`45aedee89c33bdf4360fa4e8b1a4d1e375609578a2c91d3ca471c2ea06555519`).
Disposable z14–z15 extracts decoded successfully for Lisbon, Porto, Monchique,
and a rural Portugal window. Positive-height coverage for building/part
features was 25.36%, 14.98%, 1.65%, and 6.19% respectively; `min_height` was
absent in the Monchique and rural samples. This proves technical sampling, not
complete coverage. CLI range-extraction observations were 15.0 s for Lisbon,
2.3 s for Porto, 2.6 s for Monchique, and 2.3 s for the rural window; these are
not browser or GPU benchmarks. The provider remains gated and Phase 1 remains
camera-only.

**Provider-gate continuation (2026-07-13, self-hosted storage contract):** a
disposable operations spike against the same pinned archive confirmed valid
`206` Range responses, a stable ETag, and a Last-Modified header. The public
build host did not return CORS or Cache-Control headers for the Lumes origin,
so it is not a browser-ready distribution endpoint. The spike is recorded in
`specs/archive/spikes/SPIKE-protomaps-self-hosted.md`; the next step requires a
Lumes-controlled object-store/CDN fixture. No bucket, dependency, PMTiles
source, service-worker route, or production flag was added.

**Gate re-audit (2026-07-13):** the current wrapper and provider records were
reviewed again after the reliability/refactor tranche. No provider has passed
all legal, coverage, operational, attribution, and mobile-performance gates;
the bounded PMTiles samples remain research evidence rather than browser/GPU
proof. No provider-independent building change is safe to ship, so Phase 1
remains camera-only, feature-flagged, and default-off while the 2D operational
map remains authoritative.

**Official CARTO documentation recheck (2026-07-13):** the current basemap FAQ
still limits commercial use to an Enterprise licence and free non-commercial
use to CARTO grantees. CARTO's attribution guidance requires CARTO and any
applicable provider attribution for every plan. The current API documentation
publishes a 3,500 requests/minute Maps API limit with `429` responses, but that
is an API safeguard rather than Lumes' entitlement or an approved production
tile budget. The provider record now captures these references and keeps the
existing-source extrusion experiment **KEEP GATED**. No registry, building
layer, provider flag, style switch, or production request was added.

**Existing-source experiment decision (2026-07-13):** a read-only audit found
that the current CARTO style already loads a `carto` vector source with a
`building` source-layer and `render_height`, `render_min_height`, and `hide_3d`
properties. This is the lowest-risk Phase 2 experiment because it avoids a new
provider, PMTiles archive, style replacement, and additional building tile
source. The source advertises maxzoom 14; sampled Lisbon/Porto tiles contain
usable heights, while Monchique and rural samples are sparse. Missing or weak
features must fall back to camera-only context and must never be interpreted as
proof that no settlement exists. CARTO's commercial-use terms remain an
unresolved gate, so this experiment is recorded but not approved for production
and no building layer is implemented in this tranche.

### Task 6: Phase 2 existing-source extrusion spike and Phase 3 terrain proposal

**Files:** modify `src/components/ember-map.tsx`, `src/components/advanced-layers-host.tsx`, `public/sw.js` only when required; create the provider-specific tests.

- [ ] After the CARTO legal/coverage gate is approved, add the transient existing-source extrusion behind operational overlays, bounded to focus mode and zoom 13–14; otherwise keep Phase 1 camera-only.
- [ ] Add tile-error/weak-coverage fallback and visible data-availability state.
- [ ] Keep terrain/slope behind buildings and operations; do not ship terrain until its separate provider and performance gate passes.
- [ ] Run full quality gates plus pitched-zoom screenshots on desktop and mobile-capability profiles.

### Rollback

The kill switch is the default-off feature flag. Disabling it removes the CTA and any 3D-specific source requests without changing the existing map. Phase 2/3 providers must also have an independent layer flag so a provider outage, licence change, or performance regression removes only that context layer and leaves camera-only focus/2D operation intact. Reverting the feature commits must not require a database migration.

## 18. Priority relative to current work

3D Incident Focus belongs **after** the current reliability and architecture priorities, not alongside the critical path:

1. Finish current source freshness, stale/fallback trust states, incident selection/Inspector reliability, filtering/reset contracts, responsive map chrome, accessibility, and `page.tsx`/`ember-map.tsx` boundary extraction.
2. Complete and keep green the map ownership, resize, service-worker, typecheck, lint, build, responsive, axe, and Lighthouse gates.
3. Implement Phase 1 as a small optional vertical slice only after the map wrapper exposes a stable camera/controller boundary.
4. Do not start Phase 2 buildings until data licence, coverage, attribution, style restoration, and mobile performance are independently approved.
5. Do not start Phase 3 terrain/slope until Phase 2 has production-quality fallback and the product team confirms that the context improves incident understanding rather than visual novelty.

This ordering keeps reliability, incident clarity, filtering, and the existing map architecture ahead of 3D novelty while preserving a clear path to the capability.

### Current provider-gate action (2026-07-13)

The CARTO Phase 2 gate is still **KEEP GATED**. The entitlement, attribution,
quota, caching, and retirement questions are collected in
[`docs/providers/carto-entitlement-request.md`](../../providers/carto-entitlement-request.md)
for an authorised project owner to send. The packet now includes current
official CARTO references, the request-demo URL, `rfp@carto.com`, and a
ready-to-send Lumes-specific request. A request packet is not approval; until
written answers are recorded, no building layer, provider flag, or
provider-specific browser test may be added.

### User-selected free experiment route (2026-07-13)

Option 1, the OpenFreeMap public instance, is selected for a disposable
development/beta spike only. This does not open the production Phase 2 gate.
The spike must remain outside the production service-worker cache and source
health, use an independent context flag, retain attribution, and fall back to
camera-only/2D operation on style, tile, capability, or performance failure.
The spike findings are recorded in
`specs/archive/spikes/SPIKE-openfreemap-3d-context.md`; no runtime provider
code is authorized by this decision.

**Spike result (2026-07-13):** a disposable static MapLibre harness loaded the
OpenFreeMap style across desktop/tablet/mobile and normal/reduced-motion
profiles. Synthetic incident, evacuation, risk, and station overlays stayed
readable above the `building-3d` layer. A whole-style provider abort prevented
those overlays from rendering, so the experiment confirms the required
architecture: keep Lumes' existing style authoritative and make any building
context independently removable. No `EmberMap`, CSP, service-worker, or
production source-health change was made.

**Provider-gate continuation (2026-07-13, controlled PMTiles browser fixture):**
a disposable local proxy around the pinned Protomaps archive supplied the
Range/CORS/cache/ETag contract that Lumes-owned storage would need. MapLibre's
PMTiles protocol rendered `buildings` extrusions and preserved synthetic
incident, evacuation, risk, and station overlays across desktop, tablet,
mobile, and reduced-motion contexts. The run made 42 bounded requests totaling
2,433,799 bytes; successful range latency was 385--956 ms. A controlled 503
failure path reset to 2D while preserving every operational overlay. This is
evidence for the isolated implementation shape only, not approval of a
provider, bucket, legal terms, nationwide coverage, or mobile/GPU budget. No
runtime source, dependency, service-worker route, registry, or production flag
was added; Phase 2 remains gated.

**Storage gate status (2026-07-13):** the workspace has the `wrangler`
executable but no visible PMTiles/S3/R2 storage configuration or credentials.
This is an external authorization boundary, not a MapLibre blocker. The owner
action is recorded in `docs/providers/3d-context-sources.md`: select an
Lumes-owned object store/CDN, publish a pinned bounded Portugal extract,
configure Range/CORS/ETag/Last-Modified/Cache-Control, assign refresh/egress/
rollback ownership, obtain written attribution/legal approval, and rerun the
fixture against the real hostname. Until then, no bucket, provider registry,
service-worker route, PMTiles dependency, or Phase 2 building layer is allowed.
