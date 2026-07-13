# Lumes.pt — Design Tokens & Patterns

> Last updated: 2026-07-09

## Tokens (globals.css)

Use `--ember-*` exclusively for themeable values.

Core:
- --ember-bg, --ember-surface, --ember-surface-2
- --ember-border, --ember-border-strong
- --ember-text, --ember-text-muted, --ember-text-faint
- --ember-accent, --ember-accent-hover, --ember-accent-subtle
- --ember-critical, --ember-warning, --ember-info, --ember-success
- --ember-shadow-*

Map:
- --ember-map-bg, --ember-map-land, --ember-map-water, --ember-map-road, --ember-map-border

Sources:
- --ember-source-satellite, --ember-source-official, etc.

Typography:
- `font-sans` maps to IBM Plex Sans (`--font-ui`) for application UI.
- `font-mono` maps to IBM Plex Mono (`--font-data`) for counts, timestamps, and codes.
- `font-display` is reserved for the lumes.pt brand mark (Fraunces only); application headings use `font-sans`.
- `--type-body` is 14px, `--type-secondary` is 12px, and `--type-meta` is 11px.
- Use `text-meta` for compact metadata instead of raw 9px/10px utilities. Portuguese diacritics must remain intact in both font and system fallback stacks.

## Components

- All new UI in src/components/ or ui/
- Use existing: Card-like with border bg-surface, buttons with accent.
- Icons: only from @/components/icons (brand or phosphor wrapper).
- Avoid new shadcn unless extends existing.

## Layout

- Wide desktop (`xl`, 1280px+): Situation rail (`w-[360px]`), map (`flex-1`), Explore rail (`w-12` + optional `w-[360px]` drawer). The map must retain at least 500px when the drawer opens.
- Tablet (768–1279px): map-first; Situation, Explore, and detail use drawers/sheets rather than permanent rails.
- Mobile (<768px): fixed map canvas, 56px collapsed situation summary, expandable 52vh summary, and a 92vh detail sheet.
- Use a 4/8px rhythm: 16px panel padding, 24px section separation, 40px desktop controls, and 44px touch targets.
- Text scale: 14px normal body/data, 12px secondary, and 11px metadata/timestamps. Reserve all-caps labels for compact metadata.
- Default Situation content is freshness, one headline count, 3–5 priority incidents, and an all-incidents entry. Filters/layers belong to Explore; source diagnostics and history are secondary.

## Map Layers

- Add via addEmberSourcesAndLayers in ember-map.
- Toggle in ui-store + filters.
- Data via use*New hooks.

### Optional 3D Incident Focus

- The national map remains the default, top-down operational view.
- `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS=1` gates the optional camera-only
  incident focus mode; the production default is off.
- Phase 1 changes only camera pitch/zoom for a selected incident. It does not
  add buildings, terrain, a second basemap, rotation, or touch pitching.
- The Inspector owns the entry action; the map chrome owns local exit and
  Portugal-overview reset. All actions use existing Ember tokens and 44px
  targets.
- Incident markers, evacuation boundaries, risk, stations, satellite, aerial,
  biomass, composite-risk, news, and community layers remain above any future
  context layer. A future building/terrain layer must be disabled if it cannot
  preserve that ordering or provider attribution.

## Errors

- Use <SectionError> or boundary.
- No console in prod.
- Every data surface distinguishes loading, empty, stale/fallback, retryable error, and healthy states. Show stale/fallback context beside the live incident count.

## Accessibility

- All buttons have aria-label or text.
- Focus ring via tailwind.
- Keyboard support for filters/map (limited by maplibre).
- Only the topmost blocking overlay responds to Escape; restore focus to the opener when it closes.
- While Incident Focus is active, Escape exits the mode only when no higher-
  priority blocking overlay owns the key.
- Respect `prefers-reduced-motion`; persistent motion is reserved for newly critical incidents or live-connection changes.

## Public route locale contract

The live map supports Portuguese and English through the existing app locale state. Public routes (`/status`, `/newsletter`, and `/privacy`) are intentionally Portuguese-only until route-level locale negotiation is implemented; they must declare `lang="pt-PT"` and must not render a misleading language toggle. Confirmation and unsubscribe responses follow the same Portuguese public-shell contract.

Add tokens here before using new colors.
