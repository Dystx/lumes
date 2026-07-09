# Lumes Reliability-First Refactor Design

## Product model

Lumes answers four public-service questions: what is urgent, where it is, what to do, and whether the information is trustworthy. Trust and action take precedence over dashboard density.

## Layout model

- `>=1280px`: 360px Situation rail, map, 48px Explore rail with a 360px contextual drawer.
- `768–1279px`: map-first; no permanent rails.
- `<768px`: map with 56px situation summary, 52vh expanded summary, 92vh detail sheet, and Map / Incidents / Alerts / More navigation. Explore holds filters and layers.

## State model

- Incident query state is distinct from map-display state.
- A baseline query shows all severities, hides resolved items, and has no active chips.
- Selected/fly-to incidents clear when hidden by the query.
- Blocking overlays are ordered; only the topmost overlay responds to Escape and focus returns to its opener.

## Trust model

All API surfaces expose additive `dataState` metadata: `healthy`, `stale`, `fallback`, `empty`, or `retryable-error`, plus freshness/reason context. Publicly visible fallback/stale data must be labeled beside the count and in incident trust context.

## Visual system

Use Ember tokens, Bricolage/Fraunces typography, 4/8px spacing rhythm, 44px touch targets, and reduced motion. Public pages share an Ember shell and a 65–75ch reading measure.
