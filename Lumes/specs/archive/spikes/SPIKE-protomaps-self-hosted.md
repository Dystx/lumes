# Spike: self-hosted Protomaps/OSM PMTiles suitability

## Question

Can a pinned Protomaps Basemap archive provide a viable foundation for
incident-local building context when Lumes controls the storage/CDN path and
keeps the current CARTO/2D map authoritative?

## Result

Partially answered.

The archive format and source endpoint support bounded HTTP Range reads, but
the public build host is not browser-ready for Lumes: the observed responses
did not include CORS or cache-control headers. A Lumes-controlled object store
and CDN configuration remain necessary before browser or GPU testing.

## Findings

### Provenance pin

- Archive: `https://build.protomaps.com/20260712.pmtiles`
- Build version: `4.14.11`
- Archive size: `136729392436` bytes
- Published BLAKE3: `45aedee89c33bdf4360fa4e8b1a4d1e375609578a2c91d3ca471c2ea06555519`
- Uploaded: `2026-07-12T08:57:54.702Z`
- OSM replication: `2026-07-12T04:00:00Z` (recorded in the provider audit)

The newer 2026-07-13 archive was deliberately not substituted so the spike
remains comparable with the existing Portugal sample evidence.

### Storage and Range observations

Read-only requests on 2026-07-13 used an attributable User-Agent and
`Origin: https://lumes.pt`:

| Request | Status | Bytes | Observed latency |
| --- | ---: | ---: | ---: |
| `bytes=0-127` | 206 | 128 | 422 ms |
| `bytes=128-4095` | 206 | 3,968 | 439 ms |
| `bytes=1000000-1000511` | 206 | 512 | 558 ms |
| `bytes=100000000-100000511` | 206 | 512 | 476 ms |
| `bytes=1000000000-1000000511` | 206 | 512 | 546 ms |

The responses reported `Accept-Ranges: bytes`, a stable ETag
(`"66e84c4c2c074f66e638eb86cffbe8d9-510"`), and `Last-Modified: Sun, 12 Jul
2026 08:57:54 GMT`. They did not report `Access-Control-Allow-Origin`,
`Access-Control-Allow-Methods`, or `Cache-Control`.

### Existing data evidence

The prior provider audit already decoded disposable z14--z15 samples for
Lisbon, Porto, Monchique, and a rural mainland window. It found uneven
positive-height coverage (25.36%, 14.98%, 1.65%, and 6.19%). Those results are
technical samples, not nationwide completeness or browser/GPU proof, and are
retained in [`docs/providers/3d-context-sources.md`](../../providers/3d-context-sources.md).

### Controlled storage and browser fixture (2026-07-13)

A second disposable spike used the same pinned archive through a local
Lumes-controlled HTTP fixture. It forwarded bounded browser `Range` requests
to the public build host and returned application-controlled CORS,
`Cache-Control`, ETag, Last-Modified, and `Accept-Ranges` headers. Browser
contexts blocked service workers, so the result did not rely on an existing
service-worker cache.

The fixture loaded MapLibre's PMTiles protocol and a `buildings`/
`height`/`min_height` extrusion layer at a Lisbon incident-local view. Synthetic
incident, evacuation, risk, and fire-station overlays were deliberately added
after the extrusion layer. The harness ran at desktop (1440x900), tablet
(768x900), mobile (390x844), and mobile with reduced motion. All four cases
reported rendered building features, all four operational overlay types, no
MapLibre errors, a pitched incident focus, and a reset to near-zero pitch with
the overlays preserved after the building layer was hidden.

The four-profile run made 42 bounded requests totaling 2,433,799 transferred
bytes. Successful range latency was 385--956 ms in this run. The controlled
failure path returned HTTP 503 once per case; each case preserved the
operational overlays and reset to 2D. This is browser/protocol evidence for a
correctly configured Lumes-owned storage path, not evidence that the public
build host itself is suitable or that a production bucket/CDN has been
selected.

The fixture displayed `Protomaps © OpenStreetMap` attribution. The harness was
removed after the run; no PMTiles dependency, production source, building
layer, service-worker route, provider flag, bucket, or runtime MapLibre change
was added.

## Implications for the plan

- Do not point a browser directly at `build.protomaps.com`; it lacks the CORS
  contract required by Lumes.
- A production candidate needs Lumes-controlled object storage/CDN with
  Range, CORS restricted to the application origin, ETag, explicit cache
  policy, health checks, and rollback to a pinned archive.
- Keep the PMTiles source outside the service worker cache until those headers,
  refresh, and retirement operations are owned and tested.
- The building context must remain independently removable while the current
  CARTO/2D map, incidents, risk, evacuation, stations, and alerts continue to
  work.

## What was NOT explored

- A production Lumes-owned object store/CDN, including real cache policy,
  invalidation, health checks, rollback, access controls, and egress costs.
- A new Portugal/mainland/island extraction or a full archive checksum; the
  archive is 136 GB and the `pmtiles` and `blake3` CLIs are not installed.
- GPU/frame/heap comparison between camera-only and extrusion modes.
- Production storage cost, CDN configuration, refresh automation, or legal
  attribution approval.

## Recommendation

Keep self-hosted Protomaps as the preferred free-data production candidate,
but keep Phase 2 gated. The controlled fixture proves that MapLibre/PMTiles
can work when Lumes owns the storage headers and the building context is
independently removable; it does not approve a provider. The next gate is an
explicitly approved, small Portugal-focused extract in Lumes-owned storage,
with written ODbL/Protomaps attribution, refresh and rollback ownership,
cost/egress limits, and mobile/GPU evidence. Do not add a bucket, dependency,
MapLibre source, service-worker route, or production flag yet.
