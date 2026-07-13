# 3D incident-context source due diligence

**Initial audit date:** 2026-07-12
**Last re-audit:** 2026-07-13
**Scope:** Phase 2 local building context for the optional, feature-flagged 3D Incident Focus mode.
**Decision:** Do not make the OpenFreeMap public instance a production dependency for Lumes. Keep it as a research candidate and preserve camera-only focus as the Phase 1 fallback. A self-hosted deployment may be reconsidered only after a separate licensing, operations, and coverage review.

## Free-option decision matrix (2026-07-13)

“Free” can mean free data, free software, or a free hosted service. They have
different operational consequences for a public-safety map:

| Option | Direct provider fee | 3D building path | Production assessment |
| --- | --- | --- | --- |
| OpenFreeMap public instance | $0; commercial use is stated as allowed | OpenMapTiles-compatible `building`/height fields | Good prototype/beta candidate; no SLA/support and the public service is provided as-is, so not the authoritative emergency dependency |
| Self-hosted Protomaps/OSM PMTiles | No tile-provider fee; storage, egress, refresh, and operations still cost money | Published `buildings` layer with `height`/`min_height` | Best long-term free-data route if Lumes accepts the operations work and passes Portugal coverage/mobile tests |
| CARTO grant | Potentially $0 if CARTO approves a qualifying grant | Existing CARTO source already contains building fields | Lowest code risk, but eligibility and written entitlement are unresolved; a donation/public-benefit model is not automatic approval |
| Direct OSMF raster/vector tiles | $0 tile charge | Not a suitable building/extrusion source for this design | Do not use as Lumes production infrastructure; OSMF says capacity is limited, best-effort, and heavy/commercial/donation use may be blocked |
| MapTiler or Stadia free tier | $0 only within restrictive free-plan terms | Possible depending on plan/style | Exclude for public production: current free tiers are for non-commercial/development/R&D use |
| Lumes-owned operational geometry | $0 external tile cost | Extrude only Lumes-owned evacuation/risk/command polygons; no buildings | Safe provider-independent enhancement, but it is operational context rather than settlement/building context |

### Recommendation

For a true no-provider-cost Phase 2, choose **self-hosted Protomaps/OSM
PMTiles** and treat storage/egress/refresh as the actual budget. Do not add it
to production yet: the existing Portugal samples show uneven height coverage
and the browser/mobile and attribution operations still need proof.

For immediate experimentation, use **OpenFreeMap only in a separate,
feature-flagged development or beta environment**, never as the authoritative
map dependency. If Lumes becomes a qualifying nonprofit, submit a **CARTO
grant request** in parallel; that is the lowest-risk implementation path if
written approval is granted.

### User-selected experiment route (2026-07-13)

The user selected option 1, the **OpenFreeMap public instance**, for the
development/beta experiment only. This selection does not change the
production decision above: no OpenFreeMap request, style switch, building
layer, service-worker cache entry, or provider registry is authorized in the
production application. The disposable spike record is
[`specs/archive/spikes/SPIKE-openfreemap-3d-context.md`](../../specs/archive/spikes/SPIKE-openfreemap-3d-context.md).

The next safe implementation step is an isolated browser interaction test
against a non-production flag, with attribution and a forced camera-only/2D
fallback. It must be removed or replaced before any public emergency use.

If the goal is to unblock useful 3D work without any external provider, the
only safe scope is camera focus plus optional extrusion of Lumes-owned
operational polygons. It must be labelled as operational context, not as a
complete building or settlement model.

## Candidate: OpenFreeMap public instance with OpenMapTiles/OSM data

### Why it was considered

OpenFreeMap publishes MapLibre-compatible styles and vector tiles, supports self-hosting, and its Liberty style includes a `building-3d` `fill-extrusion` layer. This makes it a plausible source for optional incident-local building context without replacing Lumes' current CARTO styles.

Official references:

- [OpenFreeMap](https://openfreemap.org/)
- [OpenFreeMap Quick Start](https://openfreemap.org/quick_start/)
- [OpenFreeMap Terms of Service](https://openfreemap.org/tos/)
- [OpenStreetMap licensing and attribution](https://www.openstreetmap.org/copyright)
- [OpenMapTiles project](https://openmaptiles.org/)

### License and attribution

The provider states that commercial usage is allowed and that the OpenFreeMap project is MIT-licensed. The map data comes from OpenStreetMap, which is ODbL-licensed and requires attribution. OpenMapTiles attribution and included-project license obligations also apply.

The provider's required attribution text is:

> OpenFreeMap © OpenMapTiles Data from OpenStreetMap

The current style's `attribution` field is an HTML equivalent of that text. Lumes must retain its existing map/source attribution contract and add this attribution only if this provider is enabled. Attribution must remain visible in desktop and mobile 3D states, including fallback and error states.

This record is not a legal approval. Before enabling a provider in production, confirm the exact OpenMapTiles and OSM obligations for the selected distribution path and keep the relevant license files with the deployment record.

### Style and building schema evidence

Read-only audit of `https://tiles.openfreemap.org/styles/liberty` on 2026-07-12 found:

- source: `openmaptiles`
- source URL: `https://tiles.openfreemap.org/planet`
- normal building layer: `building`, source-layer `building`, `fill`, minimum zoom 13, maximum zoom 14
- extrusion layer: `building-3d`, source-layer `building`, `fill-extrusion`, minimum zoom 14
- extrusion height: feature property `render_height`
- extrusion base: feature property `render_min_height`
- available building properties in TileJSON: `colour` (String), `hide_3d` (Boolean), `render_height` (Number), `render_min_height` (Number)

The current style uses `render_height` and `render_min_height` directly. Lumes must not assume that every building has a meaningful height, base, or footprint: the layer can contain absent, zero, or approximate values. Missing-height features must remain a 2D footprint or be omitted from extrusion rather than receiving a fabricated height.

### Portugal coverage sample

The provider's current TileJSON advertised this template:

`https://tiles.openfreemap.org/planet/20260621_080001_pt/{z}/{x}/{y}.pbf`

Using a valid descriptive User-Agent, representative z14 tile requests returned HTTP 200 for:

| Area | z/x/y | Result |
| --- | --- | --- |
| Lisbon | 14/7776/6277 | `200`, `application/vnd.mapbox-vector-tile` |
| Porto | 14/7799/6133 | `200`, `application/vnd.mapbox-vector-tile` |
| Monchique | 14/7802/6359 | `200`, `application/vnd.mapbox-vector-tile` |

This proves tile availability at the sampled coordinates, not building completeness, footprint accuracy, or height coverage. A future Phase 2 spike must decode a small set of Portugal tiles and measure building-feature presence and usable-height coverage in incident, settlement, and rural contexts before any product commitment.

### Rate limits, availability, and terms

- The project homepage says the public instance has no stated view/request limits.
- No numeric rate limit, capacity guarantee, incident response commitment, or SLA was found in the public material reviewed.
- The homepage explicitly says there are no SLA guarantees or personalized support.
- The Terms of Service provide the service “as-is,” with no warranty of accuracy or availability, and state that the service may be discontinued without notice.
- The Terms of Service prohibit automated collection without permission. Lumes must not bulk-download, prefetch, mirror, or use the public instance as an ingestion source without written permission and a reviewed operating model.
- A read-only audit request without a descriptive User-Agent received HTTP 403; the same request with `lumes-provider-audit/0.1 (+https://lumes.pt)` succeeded. This is not treated as a documented provider contract, but it reinforces the need for explicit, attributable requests and a provider-error fallback.

For a public safety product, “no stated limits” is not equivalent to capacity assurance. The public instance is therefore rejected as the default production dependency.

### Failure behavior and retirement path

The layer must be independently removable. If style, source, or tile requests fail:

1. Keep the existing Lumes CARTO style and all operational layers active.
2. Remove only the optional building source/layer and show a non-blocking “3D buildings unavailable” state when the user requested 3D context.
3. Keep the incident camera focus, markers, evacuation zones, risk layers, fire stations, and attribution usable in 2D.
4. Persist no provider-specific data in SQLite/Prisma and require no migration to disable it.
5. Retire the provider by flipping the independent layer flag; do not change the national overview or the Phase 1 camera controller.

### Decision and next gate

**Phase 2 decision:** reject the OpenFreeMap public instance for production use at this time. It remains a useful schema/style reference and a possible input to a separately operated, self-hosted deployment.

Before reconsideration, require all of the following:

- written confirmation of permitted Lumes browser use and automated request behavior, or a self-hosted deployment under reviewed terms;
- decoded Portugal tile samples with measured building and height coverage;
- a provider health/error budget and monitoring plan;
- a cached/fallback strategy that does not turn missing context into missing incident data;
- mobile performance evidence at the supported 3D capability threshold;
- attribution and license review recorded alongside the layer registry.

Until those gates pass, Phase 1 remains camera-only and the existing 2D map remains the default.

## Candidate: self-hosted Portugal extract from Protomaps Basemap

### Why it is the next candidate

The Protomaps Basemap is an OSM-derived PMTiles tileset that explicitly
includes a `buildings` layer. Its published schema documents `kind`, `height`,
`min_height`, and `layer` properties, and says low zooms contain merged
buildings while higher zooms contain individual OSM-equivalent buildings. This
matches the Phase 2 requirement better than adopting a second hosted visual
style: Lumes could keep CARTO/EOX as the basemap and add only an incident-local
building source after extracting and serving a Portugal-focused archive.

Official references:

- [Protomaps project overview](https://protomaps.com/about)
- [Protomaps basemap layers](https://docs.protomaps.com/basemaps/layers)
- [Building a custom basemap](https://docs.protomaps.com/basemaps/build)
- [PMTiles concepts](https://docs.protomaps.com/pmtiles/)
- [PMTiles cloud storage and CORS](https://docs.protomaps.com/pmtiles/cloud-storage)
- [Protomaps MapLibre integration](https://docs.protomaps.com/basemaps/maplibre)
- [OpenStreetMap attribution and ODbL](https://www.openstreetmap.org/copyright)

### Distribution and licence position

The candidate is **self-hosted only**, not the Protomaps hosted API. The hosted
API requires a key, has a soft one-million-tile-request monthly limit, and
requires GitHub sponsorship for commercial use. Protomaps documents the
escape hatch: download or extract the basemap and serve it from infrastructure
owned by the application. This avoids an unreviewed public API dependency, but
it transfers storage, CDN, CORS, monitoring, and update duties to Lumes.

The basemap project and tooling are BSD-licensed, while the OSM-derived data
is distributed under ODbL/Produced Work terms. The current Protomaps MapLibre
example uses:

`<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>`

Lumes would need a reviewed attribution registry covering Protomaps, OSM,
any Natural Earth or other included source, the PMTiles/basemap assets, and
the storage/CDN distribution path. This is not legal approval.

### Data and building schema evidence

The published Basemap Layers page documents:

- source-layer: `buildings`;
- `kind`: `address`, `building`, or `building_part`;
- `height`: numeric, possibly quantized at low zooms;
- `min_height`: numeric, possibly quantized at low zooms;
- `layer`: relative building layer position;
- merged buildings at z0–14 and individual OSM-equivalent buildings at z15+.

The schema is promising, but documentation is not coverage proof. A Phase 2
spike must decode representative Portugal tiles around Lisbon, Porto,
Monchique, rural settlements, and fire-incident points, then measure:

- building-feature presence;
- valid positive-height coverage;
- valid `min_height`/height relationships;
- footprint density at the intended incident-local zoom range;
- tile size, request count, and first-context latency on supported mobile
  profiles.

Missing or zero height must remain a 2D footprint or be omitted from
extrusion; Lumes must not invent height values.

### Sample extraction evidence (2026-07-12)

Using the official daily-build metadata at
`https://build-metadata.protomaps.dev/builds.json`, the pinned source for this
spike is:

- archive: `https://build.protomaps.com/20260712.pmtiles`
- archive size: `136729392436` bytes
- BLAKE3: `45aedee89c33bdf4360fa4e8b1a4d1e375609578a2c91d3ca471c2ea06555519`
- build/version: `4.14.11`
- OSM replication time: `2026-07-12T04:00:00Z`

The archive header was read through HTTP Range Requests; the full planet file
was not downloaded. Small `pmtiles extract` samples at z14–z15 were then
decoded with GDAL's PMTiles driver. Counts below include only `kind=building`
and `kind=building_part` features for the footprint denominator:

| Sample bbox | Extract archive | Range requests | Observed range transfer | Building/part features | Positive `height` | Height coverage | `min_height` present |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lisbon `-9.25,38.68,-9.05,38.82` | 9.6 MB | 24 | 15.0 s | 107,739 | 27,320 | 25.36% | 98 |
| Porto `-8.72,41.12,-8.55,41.20` | 6.7 MB | 14 | 2.3 s | 95,246 | 14,270 | 14.98% | 37 |
| Monchique `-8.62,37.24,-8.50,37.36` | 523 KB | 21 | 2.6 s | 1,571 | 26 | 1.65% | 0 |
| Rural sample `-7.90,40.10,-7.80,40.20` | 314 KB | 17 | 2.3 s | 113 | 7 | 6.19% | 0 |

The samples prove technical availability and show that a bounded source can be
served with small range-based extracts. The transfer timings are CLI archive
extraction observations, not browser first-context or GPU benchmarks; network
conditions and request concurrency are not controlled. They do **not** prove
nationwide building completeness, and the low rural height coverage is not
sufficient to make extrusions authoritative. Any Phase 2 layer would need to
render missing height as a 2D footprint or omit it, visibly report weak context
availability, and fall back to camera-only focus. The extracted files remain
disposable research artifacts outside the repository.

### Operations, limits, and failure behavior

Self-hosting has no upstream SLA: availability, cache headers, range-request
support, CORS, storage cost, CDN capacity, PMTiles refresh, and rollback become
Lumes responsibilities. Protomaps documents HTTP Range Requests as essential
for PMTiles and recommends CORS restricted to the application origin. Each
range request counts as a storage GET, so the incident-local bounding box and
zoom cap are required for cost and performance control.

If the provider, archive, or tile endpoint fails:

1. Keep the current CARTO/EOX style and every operational overlay active.
2. Remove only the optional building source/layer.
3. Show `3D buildings unavailable` without changing incident state or camera
   focus.
4. Keep camera-only 3D and ordinary 2D as working fallbacks.
5. Retire the provider by disabling its independent layer flag and removing
   the PMTiles source; no database migration or incident-data replay should be
   required.

### Decision and next gate

**Decision:** retain self-hosted Protomaps as the preferred Phase 2 research
candidate, but do not approve it for production or add `pmtiles`, a building
source, a registry, or a storage bucket yet.

Approval requires the decoded Portugal coverage/height report, a small-device
performance budget, an operational owner for archive refresh and CDN/CORS,
written attribution/licence review, a provider health/error budget, and a
tested dark→light→dark style-restoration path. Until those gates pass, Phase 1
remains camera-only.

### Self-hosted operations spike (2026-07-13)

The disposable operations spike is recorded in
[`specs/archive/spikes/SPIKE-protomaps-self-hosted.md`](../../specs/archive/spikes/SPIKE-protomaps-self-hosted.md).
The pinned archive returned valid `206` Range responses and stable ETag and
Last-Modified headers, but the public build host did not return
`Access-Control-Allow-Origin` or `Cache-Control` for requests carrying the
Lumes origin. This is useful storage evidence, not browser approval: a
Lumes-controlled object store/CDN must supply the browser contract before any
PMTiles MapLibre integration can be tested.

### Provider-gate continuation (2026-07-12, extraction and operations audit)

The candidate remains **KEEP GATED**. Official Protomaps documentation confirms
that a dated Version 4 archive can be clipped with `pmtiles extract`, but no
official Portugal-specific archive or coverage/height completeness guarantee
was found. The basemap schema is technically suitable (`buildings`, `kind`,
`height`, `min_height`, and `layer`), while the project explicitly does not
promise every underlying OSM tag or building attribute.

The next bounded spike is now explicit:

1. Pin a dated source archive and checksum; extract mainland Portugal and the
   islands without adding the result to the application yet.
2. Decode representative z14–z16 samples for Lisbon, Porto, Monchique, rural
   settlements, and real incident bounding boxes.
3. Measure building-feature presence, positive-height coverage,
   `height >= min_height`, tile bytes, range-request count, and first-context
   latency.
4. Benchmark camera-only versus extrusion mode on supported desktop and mobile
   capability profiles, including expected object-storage range latency.
5. Record ODbL Produced Work/OSM attribution, Protomaps and included-source
   notices, archive refresh/rollback, CORS, Range, ETag, cache, and health
   operations before considering provider approval.

Until that evidence exists, no PMTiles dependency, building source, storage
bucket, layer registry, or style-restoration implementation is authorized by
this plan.

## Gate re-audit (2026-07-13)

The current repository was re-audited after Phase 1 camera-only work and the
reliability/refactor tranche. The existing evidence still supports the same
decision: no provider has passed all approval gates. The Protomaps samples are
technical research evidence, not browser/GPU performance or legal approval;
the rural positive-height coverage remains too weak to make an extrusion layer
authoritative. The current MapLibre wrapper has no provider-specific source,
style switch, PMTiles dependency, or storage bucket, so there is no safe
provider-independent building change to ship in this tranche.

Phase 2 remains gated on controlled browser/mobile extrusion benchmarks,
operational ownership for archive refresh and Range/CORS/CDN behavior, and
written attribution/licence review. Phase 1 camera-only focus and the normal
2D operational map remain the only enabled paths.

## Candidate: existing Lumes CARTO building source

### Why it is the lowest-risk Phase 2 experiment

The current Lumes CARTO styles already load a vector source that contains
building geometry. A bounded `fill-extrusion` layer can therefore reuse the
existing source instead of introducing OpenFreeMap, Protomaps, Overture,
another MapLibre style, or a second tile provider. This preserves the current
MapLibre instance, theme switching, raster handling, operational overlays, and
existing attribution path.

Read-only style/TileJSON audit on 2026-07-13 found:

- source id: `carto`;
- source URL: `https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json`;
- source-layer: `building`;
- existing flat layers: `building` and `building-top`;
- height fields: `render_height` and `render_min_height`;
- suppression field: `hide_3d`;
- advertised maximum zoom: 14;
- source attribution: CARTO and OpenStreetMap attribution in the TileJSON/style metadata.

The proposed experiment is a transient layer named `lumes-incident-buildings`
that is added only during Incident Focus, only around zoom 13–14, and only
when height values are present and positive. It must be inserted after the
existing `building-top` layer and before operational GeoJSON layers so incident
markers, evacuation boundaries, stations, risk, news, and community reports
remain above it. The layer must be independently removable and re-created after
`style.load` without touching incident data.

### Coverage evidence and product fallback

Small decoded samples were useful in Lisbon and Porto, but sparse around
Monchique and a rural window. The evidence is representative sampling, not a
nationwide completeness guarantee. A missing building feature must never be
presented as evidence that no house or settlement exists. The UI should say
`Contexto de edifícios indisponível` / `Building context unavailable` and retain
camera-only focus whenever the layer has weak coverage, invalid heights, tile
errors, or a capability rejection.

### Licence and attribution gate

This experiment does not remove the existing CARTO licence question. CARTO's
official basemap guidance says commercial use requires an Enterprise licence;
the public-benefit/donation model and any paid professional layer therefore
need an explicit written entitlement review before production enablement. This
record is technical due diligence, not legal approval.

### Decision and next gate

**Decision:** make the existing CARTO source the first Phase 2 experiment, but
keep it gated. Do not add a building source, extrusion layer, registry, or
production flag until the CARTO terms, browser/mobile performance, coverage,
style-restoration, tile-error, and attribution tests pass. If the legal or
coverage gate fails, retain camera-only focus and evaluate the already-recorded
self-hosted Protomaps/Overture alternatives as a separate project.

### Official CARTO entitlement and quota re-audit (2026-07-13)

The current official CARTO documentation makes the legal boundary stricter
than a successful unauthenticated tile request suggests:

- CARTO's basemap FAQ says commercial use requires an Enterprise licence. Free
  non-commercial use is limited to CARTO grantees with a written grant; a
  public-benefit or donation model does not automatically establish that grant.
- The linked Basemap Terms (current legal index: [CARTO legal
  terms](https://carto.com/legal/)) grant access through a paid order form or
  written grant, allow CARTO to change service features, set a default
  1,000,000 tile-request monthly cap unless an order form changes it, and
  require prominent CARTO and OpenStreetMap attribution. The exact
  entitlement-specific attribution text must be recorded before use.
- The live style and TileJSON are technically reachable without a key, but
  this proves availability only. It does not prove Lumes has permission to
  use the basemap or to add a public extrusion layer.
- The remote style URL is mutable and not version-pinned. The current source
  and `building` fields are therefore a runtime capability, not a stable API
  contract. A future layer must fail closed to camera-only/2D if the source,
  layer, fields, or maxzoom change.

Official references:

- [CARTO basemap FAQ](https://docs.carto.com/faqs/carto-basemaps)
- [CARTO legal index](https://carto.com/legal/)
- [CARTO Basemap Terms](https://carto.com/legal/bmap/)
- [CARTO attribution guidance](https://carto.com/attribution/index.html)
- [CARTO API limits](https://docs.carto.com/carto-for-developers/key-concepts/apis)

**Gate result:** the existing source remains a technically suitable first
candidate for an offline/read-only audit, but a live browser extrusion test is
not authorized until Lumes records a written Enterprise entitlement or CARTO
evaluation/grant permission, entitlement-specific attribution, a tile-budget
owner, runtime contract checks, Portugal coverage/height evidence, mobile/GPU
benchmarks, and style-restoration/tile-error fallback proof. No registry,
building layer, provider flag, or production request was added.

### Official documentation recheck (2026-07-13)

The current CARTO documentation was re-read before closing this continuation:

- The basemap FAQ explicitly says commercial use requires an Enterprise
  licence, while free non-commercial use is for CARTO grantees. The FAQ also
  confirms that the basemap is OSM-derived and MapLibre-compatible, but that
  compatibility is not a Lumes entitlement.
- CARTO's attribution page says attribution is required for every CARTO plan
  and that both CARTO and applicable providers must be credited. The exact
  attribution string for Lumes' entitlement is still not recorded.
- The current developer API page documents a 3,500 requests/minute Maps API
  rate limit and `429` responses when limits are exceeded. This is an API/WAF
  safeguard, not a grant of basemap rights or a production tile budget for
  Lumes; the owner and alert threshold are still undefined.

References:

- [CARTO basemap FAQ](https://docs.carto.com/faqs/carto-basemaps)
- [CARTO attribution guidance](https://carto.com/attribution/)
- [CARTO API limits](https://docs.carto.com/carto-for-developers/key-concepts/apis)

**Continuation decision:** keep the CARTO building experiment **KEEP GATED**.
The next actionable step is an entitlement request and written attribution/
quota record. Until that exists, MapLibre remains the renderer, the current
2D/CARTO map remains authoritative, and Phase 1 camera-only Incident Focus is
the only enabled 3D-adjacent capability. The request packet is now prepared at
[`carto-entitlement-request.md`](./carto-entitlement-request.md); it must be
sent and answered by an authorised project owner before this gate can change.

## Self-hosted PMTiles controlled-storage/browser fixture (2026-07-13)

The second Protomaps spike used a disposable local proxy around the pinned
`20260712.pmtiles` archive. It forwarded bounded `Range` requests and supplied
the CORS, `Cache-Control`, ETag, Last-Modified, and `Accept-Ranges` contract
that a Lumes-owned object store/CDN would need. Browser contexts blocked
service workers, so the result did not rely on an existing service-worker
cache. Full details are in
[`SPIKE-protomaps-self-hosted.md`](../../specs/archive/spikes/SPIKE-protomaps-self-hosted.md).

MapLibre's PMTiles protocol rendered the documented `buildings` source-layer
and positive-height extrusion at a Lisbon incident-local view. Synthetic
incident, evacuation, risk, and station layers were inserted after the
extrusion layer and remained queryable in desktop, tablet, mobile, and mobile
reduced-motion contexts. The focus camera raised pitch to approximately 40°
(52° with reduced motion's immediate transition), and the controlled failure
path returned HTTP 503 and then preserved every operational overlay while
resetting to 2D.

The four-profile run made 42 bounded requests totaling 2,433,799 bytes, with
successful range latency of 385--956 ms. This proves a viable browser protocol
shape when Lumes controls the storage contract; it does **not** prove a
production bucket/CDN, nationwide or rural height completeness, GPU/heap
budget, legal entitlement, or refresh/rollback operations. No runtime source,
provider registry, dependency, service-worker route, bucket, or production
flag was added. **Decision: keep Phase 2 gated; use this as the implementation
shape for a future approved storage fixture.**

### Storage gate owner action (2026-07-13)

The workspace has a `wrangler` executable but no visible PMTiles, S3/R2, or
storage credentials/configuration. This is an authorization boundary, not a
MapLibre defect. An authorized project owner must provide the external storage
path before this gate can move:

1. Select the Lumes-owned object store/CDN and a public hostname; do not put
   credentials in the repository or service worker.
2. Publish a pinned, bounded Portugal extract rather than the 136 GB planet
   archive. Record archive version, hash, OSM/Protomaps attribution, refresh
   owner, retention, and rollback artifact.
3. Configure `206` Range responses, `Accept-Ranges`, stable ETag and
   Last-Modified headers, explicit `Cache-Control`, and CORS restricted to the
   approved Lumes origins. Expose only the headers the browser needs.
4. Run the disposable browser fixture against the real hostname and attach
   request/byte/latency, mobile capability, weak-coverage, failure, and
   rollback evidence to this record.
5. Obtain written legal/attribution approval and an owner for monthly egress,
   refresh, incident response, and retirement. Only then can the plan's
   provider registry and Phase 2 source/layer work be opened.

Until those actions are complete, the existing CARTO/2D map and Phase 1
camera-only focus remain authoritative. No provider-specific runtime code is
permitted.
