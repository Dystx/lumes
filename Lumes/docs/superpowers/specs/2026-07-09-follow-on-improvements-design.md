# Lumes Follow-on Improvements Design

> Review basis: local code review and read-only browser inspection on 2026-07-09. This document extends the reliability-first refactor; it does not replace it.

## Goal

Make Lumes a trustworthy citizen-facing wildfire service at every viewport by removing duplicate ownership, bounding every public data/action path, and ensuring the UI never implies fresher or more complete data than it has.

## Current evidence

- `src/app/page.tsx` mounts a desktop `EmberMap` and a second mobile `EmberMap` at the same time, sharing one `mapRef`; the mobile instance omits desktop layer props and `onFlyToCleared`.
- At 1280px, opening Explore leaves the map mostly black until MapLibre receives a resize; the drawer also exposes duplicate quick controls (`Critical only`/`Active` and a second Quick filter row).
- At 390px, the Incidents sheet renders district, resource, phase, distribution, and system-health analytics before the priority list; the bottom navigation overlays the sheet content.
- Compact/mobile map summaries receive a timestamp but not the API `dataState` or degradation reason.
- `createDataStateMeta()` uses response time rather than source `fetchedAt`, and `useFetch` does not propagate response metadata into the normalized client state.
- `/api/aerial` accepts non-finite/unbounded bbox values; `mergeAircraft` can loop indefinitely. `/api/incidents/risks` can fan out 200 upstream requests. `/api/risk` and related routes accept non-finite coordinates and leak upstream exception text.
- `/api/alerts` exposes all active subscriptions, accepts deletion of arbitrary IDs, writes subscriptions at `0,0`, and compares severity labels against event types.
- `/api/reports` public reads expose pending rows, coordinates, descriptions, names, and unbounded limits; moderation is now disabled until an attributable staff identity exists.
- Newsletter unsubscribe mutates from a GET email query parameter; subscribe can return pending confirmation while `sendEmail` is an unconditional stub, and provider/DB failures are not normalized.
- A clean CI database is not schema-pushed before the `/api/health` probe; the browser job therefore fails on a fresh runner. Bun is pinned to `latest` while the lockfile is frozen.
- `src/app/page.tsx` remains ~1,900 lines, `src/components/ember-map.tsx` ~1,575 lines, `use-live-data.ts` remains legacy, and many page/API boundaries use `any` casts.
- `html lang="en"` is hardcoded while public pages and unsubscribe/confirm HTML are Portuguese-only.

## Design decisions

1. **One map owner.** Introduce a responsive `MapScene` boundary. It owns exactly one MapLibre instance and exposes one complete prop contract to desktop, tablet, and mobile chrome. CSS may change presentation, but it must not mount a second map.
2. **One trust model.** Normalize `DataTrustState` as `{ state, source, sourceUpdatedAt, observedAt, reason }`, where source time comes from upstream `fetchedAt`/`lastSuccess`, not response creation time. Every map count, situation summary, inspector, and status page consumes the same value.
3. **Public APIs fail closed.** Public reads are bounded and projected; mutating endpoints use explicit ownership/token semantics or remain disabled. Upstream errors never cross the API boundary.
4. **Citizen-first information architecture.** Situation shows freshness, one headline count, and 3–5 priority incidents. Explore owns query filters and map layers. Analytics, history, diagnostics, and source detail are progressive disclosure.
5. **Compact is not phone-only.** Keep map-first behavior at 768–1279px, but use a tablet shell with a wider contextual drawer and two-column incident list. Phone keeps the 56px summary and 92vh detail sheet.
6. **Locale is explicit.** The public shell and HTML language must reflect the active locale. If route-level locale persistence is not implemented in this phase, public pages must clearly remain Portuguese-only rather than presenting a misleading PT/EN switch.

## Component and data boundaries

| Boundary | Owns | Must not own |
| --- | --- | --- |
| `src/components/map/map-scene.tsx` | One map instance, prop parity, resize, layer data | Query UI, drawer state, API fetching |
| `src/lib/data-trust.ts` | State derivation, source timestamps, safe labels | React rendering or persistence |
| `src/components/shell/situation-panel.tsx` | Headline + priority list | Filters, layers, district/resource analytics |
| `src/components/shell/explore-drawer.tsx` | Query/layer controls and focus | Incident evidence/actions |
| `src/components/detail/IncidentDetailPanel.tsx` | Selected incident evidence and safety actions | Global query state |
| `src/lib/api/contracts.ts` | Response envelopes, bounded query schemas, redaction helpers | Route-specific persistence |
| `src/components/public/public-page-shell.tsx` | Locale-aware public chrome and reading measure | Route-specific copy/data fetching |

## Non-goals

- No database migration until alert ownership and newsletter delivery decisions are approved.
- No replacement of MapLibre, Prisma/SQLite, Caddy, Cloudflare, or the current PT/EN translation catalog.
- No deployment, external provider setup, production data mutation, or staff-auth system in this follow-on design.

## Approval gates

This design is ready to become an implementation plan when the product owner confirms:

- whether alerts are per-device anonymous tokens or authenticated accounts;
- whether the public surface should support full PT/EN now or explicitly be Portuguese-only;
- which transactional email provider is authorized for newsletter delivery.

