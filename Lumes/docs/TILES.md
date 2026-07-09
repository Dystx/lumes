# Tile caching strategy

The map component (`src/components/ember-map.tsx`) currently uses
**CARTO basemaps** (free CDN) for vector tiles and **EOX Maps** for
Sentinel-2 satellite imagery. Both providers serve billions of tile
requests daily; their CDNs scale. The question for lumes.pt is:

> When 30,000 concurrent users all pan the map of Portugal at the
> same time, what happens?

This document covers the three viable strategies, from least
operational work to most.

## Strategy 1 — Trust the upstream CDNs (default, sufficient for ≤ 5 k concurrent)

**How it works.** The frontend hits CARTO / EOX directly. Both have
generous free tiers and geographically distributed CDNs. Browser
caching carries most of the load.

**Limits.** CARTO's free tier enforces per-IP rate limits. At
~5,000 concurrent users all panning the map, you'll trigger them.

**When to choose.** Launch and beta phase. Don't over-engineer a
launch-day site.

**Verification.**

```sh
curl -I "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
# Expect: cf-cache-status: HIT, age: 1234
```

If the upstream's cache hit ratio starts dropping (visible in their
public status pages), move to Strategy 2.

## Strategy 2 — Front the upstream with a Cloudflare Worker cache

**How it works.** A small Cloudflare Worker in front of CARTO/EOX
proxying tile requests, caching successful responses to **R2** for
30 days. The frontend points at `tiles.lumes.pt/{z}/{x}/{y}.png`
instead of the upstream URL. Cloudflare serves 100 % of repeated
tile requests from R2 + edge cache.

**Cost.** Workers Free covers ≤ 100 k req/day — covers our window.
R2 free egress, $0.015/GB-mo storage. Total: **€0** at typical load.

**When to choose.** The launch has settled, ~5-10 k concurrent is
normal, you need a guaranteed fast experience for Portugal.

**Implementation.** See [`deploy/tile-cache-worker.js`](../deploy/tile-cache-worker.js)
and copy it into the Cloudflare dashboard **Workers & Pages → Create →
Worker → paste → Deploy**. Then add a DNS record for `tiles.lumes.pt`
pointing at the Worker (or proxy through Pages).

**Limits.**
- R2: 10 GB free, 1 M free reads/mo, 10 M free writes/mo. We
  estimate ~5-10 GB of unique tiles to fully cover Portugal at
  zooms 5-15. Free tier holds comfortably for the first months;
  upgrade to paid R2 ($0.015/GB-mo) only when traffic grows.
- Worker CPU time: 10 ms/invocation on Free. Tile proxying fits in
  ~5 ms; no concern.
- CARTO's terms of service require attribution when proxying.
  Use the EOX tile for satellite (which is BSD-licensed) and keep
  CARTO with attribution displayed in the map's bottom-right.

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
| 1. Trust CDNs | €0 (or up to €30 if CARTO rate-limits force a paid plan) |
| 2. Worker + R2 | **~€5** (R2 storage + reads overage) |
| 3. Self-hosted | €0 (already-paid disk) |

Strategy 2 is the right answer for lumes.pt at viral scale.
Strategy 3 once you're a national-public-service tier and can't
afford a single upstream failure.

## TL;DR

For beta and launch: Strategy 1.
For the first viral event: Strategy 2 (one Cloudflare Worker, no
recurring cost).
For long-term self-sufficiency: Strategy 3.
