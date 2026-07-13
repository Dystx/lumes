# Spike: OpenFreeMap 3D incident context

## Question

Can Lumes use the public OpenFreeMap Liberty style as a disposable,
feature-flagged development/beta experiment for incident-local building
context without replacing the authoritative CARTO/2D map or changing the
camera-only production path?

## Result

Partially answered.

The style is technically usable as an experiment, but the public service is
not approved as a production dependency for a public-safety application.

## Findings

- The style endpoint was reachable with an attributable User-Agent on
  2026-07-13.
- The style exposes an `openmaptiles` source, a normal `building` fill layer
  at zoom 13--14, and a `building-3d` `fill-extrusion` layer from the same
  `building` source-layer starting at zoom 14.
- The public service advertises commercial use, but its terms are as-is, do
  not provide an SLA or support commitment, allow discontinuation, and
  restrict automated collection without permission.
- Existing Portugal tile samples establish availability at representative
  Lisbon, Porto, and Monchique coordinates, not completeness or reliable
  height coverage. The documented PMTiles samples also show uneven positive
  height coverage, especially in rural contexts.

## Evidence

Read-only style smoke check:

```text
source: openmaptiles
building: fill, source-layer=building, minzoom=13, maxzoom=14
building-3d: fill-extrusion, source-layer=building, minzoom=14
terms: HTTP 200
```

The detailed provider evidence and attribution obligations are recorded in
[`docs/providers/3d-context-sources.md`](../../providers/3d-context-sources.md).

Disposable browser harness results (2026-07-13):

- The OpenFreeMap Liberty style loaded in 1440x900, 768x900, and 390x844
  contexts with both normal and reduced-motion preferences when service
  workers were blocked.
- Measured ready latency was approximately 2.9--3.8 seconds from navigation
  start to the ready state in the local static harness.
- Provider request counts/response bytes were approximately 36/3.92 MB on
  desktop, 23/2.68 MB on tablet, and 21/2.13 MB on mobile. These are harness
  observations, not a production budget.
- At the Lisbon sample window, the 3D building layer returned 490, 265, and
  212 rendered features in desktop, tablet, and mobile contexts respectively.
  Synthetic incident, evacuation, risk, and station overlays remained
  queryable above the building layer in every profile.
- The simulated context failure reset pitch/bearing to 0 and retained all
  synthetic operational overlays.
- Aborting all provider tile requests before the style loaded prevented the
  static harness from rendering its synthetic overlays. This is a negative
  result for a whole-style dependency and is why Lumes must not replace its
  authoritative style with OpenFreeMap for this feature.
- The six-context disposable runner emitted the result payload but needed
  manual process cleanup afterward; this is a spike-harness lifecycle issue,
  not a Lumes runtime change.

## Implications for the plan

- Keep the existing national CARTO/2D map and Phase 1 camera-only Incident
  Focus as the authoritative path.
- If an experiment is built, isolate it behind a development/beta-only flag
  and an independent context-layer flag. It must never be required to render
  incidents, stations, risk, evacuation, or alert layers.
- Do not add OpenFreeMap requests to the production service worker cache,
  server ingestion, SQLite/Prisma schema, or core source-health contract.
- Keep attribution visible in every experimental 3D state and preserve a
  2D/camera-only fallback when style or tile requests fail.

## What was NOT explored

- Browser first-context latency and GPU cost on supported desktop and mobile
  profiles.
- Complete Portugal building/height coverage and footprint accuracy.
- Written permission for Lumes' automated browser request pattern.
- Long-term availability, quotas, incident response, and attribution review
  for a public deployment.
- A real Lumes integration with OpenFreeMap; the browser harness intentionally
  did not modify `EmberMap`, CSP, service-worker caching, or production data.

## Recommendation

Proceed only with a disposable non-production browser spike if the goal is to
validate interaction and fallback behavior. Do not merge it as a production
provider. For production-quality building context, continue evaluating a
self-hosted Portugal-scoped PMTiles deployment or a written CARTO entitlement;
until one of those gates passes, leave Phase 1 camera-only.
