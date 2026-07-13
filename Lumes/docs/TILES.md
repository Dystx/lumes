# Tile caching strategy

The map component (`src/components/ember-map.tsx`) currently uses
**CARTO basemaps** through an upstream CDN for vector tiles and **EOX Maps**
for Sentinel-2 satellite imagery. The technical CDN path is live, but CARTO
basemap entitlement is not inferred from a successful HTTP response: current
official guidance requires an Enterprise licence for commercial use or a
written grant for non-commercial use. Attribution and quota must therefore be
confirmed against the actual Lumes entitlement before treating this as a
production dependency.

> When 30,000 concurrent users all pan the map of Portugal at the
> same time, what happens?

This document covers the three viable strategies, from least
operational work to most.

## Strategy 1 — Trust the upstream CDNs (default only after entitlement review)

**How it works.** The frontend hits CARTO / EOX directly. Their CDN-backed
delivery can be operationally simple, and browser caching carries most of the
load, but the allowed usage, quota, and attribution come from the applicable
provider terms rather than this document.

**Limits.** The current CARTO Basemap Terms record a default 1,000,000 tile
requests per calendar month unless an order form changes the quota. The
application must instrument tile errors/request volume and confirm the current
entitlement; do not rely on an unsourced per-IP or concurrency assumption.

**When to choose.** Launch and beta phase. Don't over-engineer a
launch-day site.

**Verification.**

```sh
curl -I "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
# Expect: cf-cache-status: HIT, age: 1234
```

If measured provider errors, quota headroom, or cache-miss cost become
unacceptable, evaluate Strategy 2 with a controlled budget and attribution
review.

## Strategy 2 — Front the upstream with a Cloudflare Worker cache

**How it works.** A small Cloudflare Worker in front of CARTO/EOX
proxying tile requests, caching successful responses to **R2** for
30 days. The frontend points at `tiles.lumes.pt/{z}/{x}/{y}.png`
instead of the upstream URL. Cloudflare serves 100 % of repeated
tile requests from R2 + edge cache.

**Cost.** R2 has free egress, but the free operation allowances are not an
unlimited viral tier. Workers Free includes 100k requests/day; a viral event
can exceed that immediately. R2 currently includes 10 GB storage, 1 M Class A
operations (writes), and 10 M Class B operations (reads) per month. The actual
cost therefore depends on cache misses and origin reads, not browser tile
fetches alone.

**When to choose.** The launch has settled, ~5-10 k concurrent is
normal, you need a guaranteed fast experience for Portugal.

**Implementation.** See [`deploy/tile-cache-worker.js`](../deploy/tile-cache-worker.js)
and copy it into the Cloudflare dashboard **Workers & Pages → Create →
Worker → paste → Deploy**. Then add a DNS record for `tiles.lumes.pt`
pointing at the Worker (or proxy through Pages).

**Limits.**
- R2: 10 GB free storage, 1 M free Class A operations (writes), and
  10 M free Class B operations (reads) per month. We estimate ~5-10 GB of
  unique tiles to cover Portugal at zooms 5-15. A cache-miss budget must be
  measured before assuming the free tier is sufficient; paid storage is
  currently $0.015/GB-month, with operation charges applying above the free
  allowances.
- Worker CPU time: 10 ms/invocation on Free. Tile proxying fits in
  ~5 ms; no concern.
- CARTO's terms require prominent attribution when using its basemap. Use the
  entitlement-specific CARTO/OpenStreetMap wording and keep it displayed in
  the map's bottom-right. Do not proxy or mirror tiles until the applicable
  terms, request budget, and cache behavior are reviewed.

## Strategy 3 — Self-host tiles via tileserver-gl + OpenMapTiles

**How it works.** Render OpenMapTiles vector MBTiles covering
Portugal at low cost, serve them via `tileserver-gl` running on the
Hetzner box (or on a separate port on the same machine).
MapLibre consumes the tiles directly with no upstream dependency.

**Cost.** One-time setup of ~1-3 hours. Storage ~5-15 GB for
Portugal at zooms 0-15. Operational cost: €0/mo additional (the
Hetzner box has the disk).

**When to choose.** Lumes.pt is becoming a national-public-service,
you want full control, and you care about not depending on
commercial or free-but-fickle upstream CDNs.

**Recipe (high level).**

```sh
# On your local machine:
# 1. Download Portugal extract from Geofabrik (https://download.geofabrik.de/europe/portugal.html)
wget https://download.geofabrik.de/europe/portugal-latest-free.shp.zip
unzip portugal-latest-free-free.shp.zip -d portugal-osm

# 2. Generate MBTiles using OpenMapTiles tooling (or use Planetiler, which is simpler):
#    https://github.com/planetiler/planetiler
java -jar planetiler.jar --area=portugal-osm --output=portugal.mbtiles

# 3. Copy portugal.mbtiles to the box:
scp portugal.mbtiles lumes@<box-ip>:/opt/apps/lumes/data/

# 4. On the box, run tileserver-gl via the tile-cache service unit:
#    (file: deploy/tileserver.service — provided below)
sudo systemctl enable --now tileserver

# 5. The frontend reads from https://tiles.lumes.pt/data/v3.json
#    Update emb er-map.tsx accordingly.
```

**Limits.**
- Initial render of Portugal at zooms 0-15 takes 30-60 minutes on
  the box. After that, on-disk serving is essentially free.
- You lose the dynamic rendering of "live" tiles (e.g., real-time
  wind overlays). For lumes.pt's use case this is fine — the live
  data is on the GeoJSON overlay, not the basemap.
- You'll want to re-render once a quarter to capture OSM
  geometry changes (new roads, name changes, etc.).

## Concrete: a tile-cache Worker

A working tile-cache Worker is in [`deploy/tile-cache-worker.js`](../deploy/tile-cache-worker.js).
Drop it into Cloudflare → Workers → Create. Then:

1. Create R2 bucket `lumes-tiles`.
2. Bind R2 to the Worker (Settings → Bindings → R2 → Variable name
   `TILES`, bucket `lumes-tiles`).
3. Add a custom domain `tiles.lumes.pt` → route to the Worker.
4. Update `src/components/ember-map.tsx` so `SATELLITE_TILES` and
   the style URL point at `https://tiles.lumes.pt/...`

```ts
// In ember-map.tsx, replace:
const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
// with:
const SATELLITE_TILES =
  "https://tiles.lumes.pt/eox/{z}/{x}/{y}.jpg";

// And for basemaps, replace:
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
// with:
const DARK_STYLE =
  "https://tiles.lumes.pt/carto-dark/style.json";

// (Worker route /carto-dark/* → proxy to basemaps.cartocdn.com/gl/dark-matter-gl-style/*)
// (Worker route /eox/:z/:x/:y.jpg → proxy to tiles.maps.eox.at/wmts/1.0.0/.../{z}/{y}/{x}.jpg)
```

## Validation under load

Before declaring tile strategy done, simulate 1,000 concurrent users
all panning and zooming:

```sh
# Quick check: 1k requests in 5 s for a single tile
hey -n 1000 -c 200 -z 5s "https://tiles.lumes.pt/eox/8/127/85.jpg"
# Look for: p99 latency under 200 ms, ~0% error rate
```

For a deeper check, use `wrk -t12 -c400 -d60s ...` against multiple
representative tiles.

## Cost projection at viral scale

Assume viral event with 30,000 concurrent users pan-zooming for 6
hours, producing 30 M tile fetches total.

| Strategy | Cost |
| --- | ---: |
| 1. Trust CDNs | entitlement- and usage-dependent |
| 2. Worker + R2 | **usage-dependent** (Worker requests, R2 origin reads/writes, and storage) |
| 3. Self-hosted | €0 (already-paid disk) |

Strategy 2 is a candidate for lumes.pt at viral scale, but only after a
controlled cache-miss, Worker-request, and cost-budget test. It is not
automatically a zero-cost viral path.
Strategy 3 once you're a national-public-service tier and can't
afford a single upstream failure.

## TL;DR

For beta and launch: Strategy 1 only after provider entitlement,
attribution, and quota review.
For a first viral event: evaluate Strategy 2 with measured Worker/R2
cache-miss and cost budgets; it is not automatically free or unlimited.
For long-term self-sufficiency: Strategy 3.
