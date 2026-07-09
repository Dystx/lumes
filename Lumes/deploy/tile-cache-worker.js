// Cloudflare Worker — proxies + caches map tile requests in front of
// the upstream basemap providers (CARTO for vector basemaps,
// EOX Maps for Sentinel-2 satellite imagery).
//
// Deploy:
//   1. Cloudflare dashboard → Workers & Pages → Create Worker → paste this
//   2. Settings → Bindings → Add R2 bucket:
//        Variable name: TILES
//        Bucket:       lumes-tiles
//   3. Settings → Triggers → Custom Domain → tiles.lumes.pt (or *.lumes.pt)
//   4. Update src/components/ember-map.tsx to point at tiles.lumes.pt
//
// Cost: Free for the first 100k requests/day. R2 free tier covers ~10GB
// of tile storage. At viral-event traffic you'll upgrade to R2 paid at
// ~€5/mo. No surprises beyond that.
//
// References:
//   - Cloudflare Workers: https://developers.cloudflare.com/workers/
//   - R2:                 https://developers.cloudflare.com/r2/

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;       // 30 days
const STALE_WHILE_REVALIDATE = 60 * 60 * 24 * 7;   // 7 days
const BROWSER_TTL_SECONDS = 60 * 60 * 24 * 7;      // 7 days

// Upstream basemap style + tile URLs.
const UPSTREAM_CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style";
const UPSTREAM_CARTO_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style";
const UPSTREAM_EOX =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g";

// Cache keys. Origin + path is enough since the response is content-
// addressed via file name (style.json, /{z}/{x}/{y}.{ext}).
const cache = caches.default;

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---------- CARTO dark vector basemap ----------
    if (url.pathname.startsWith("/carto-dark/")) {
      return serveProxy(request, env, ctx, {
        origin: UPSTREAM_CARTO_DARK,
        rewrite: (p) => p.replace(/^\/carto-dark/, ""),
        cacheKeySuffix: "carto-dark",
      });
    }

    // ---------- CARTO light vector basemap ----------
    if (url.pathname.startsWith("/carto-light/")) {
      return serveProxy(request, env, ctx, {
        origin: UPSTREAM_CARTO_LIGHT,
        rewrite: (p) => p.replace(/^\/carto-light/, ""),
        cacheKeySuffix: "carto-light",
      });
    }

    // ---------- EOX satellite raster ----------
    // URL pattern: /eox/{z}/{y}/{x}.jpg   (note y before x — tile servers vary)
    const eoxMatch = url.pathname.match(/^\/eox\/(\d+)\/(\d+)\/(\d+)\.(jpe?g|png)$/);
    if (eoxMatch) {
      const [, z, y, x, ext] = eoxMatch;
      const upstreamUrl = `${UPSTREAM_EOX}/${z}/${y}/${x}.${ext}`;
      return serveTile(request, env, ctx, upstreamUrl, `eox:${z}:${y}:${x}:${ext}`);
    }

    // ---------- Default: 404 ----------
    return new Response("not found", { status: 404 });
  },
};

async function serveProxy(request, env, ctx, opts) {
  const upstreamPath = opts.rewrite(new URL(request.url).pathname);
  const upstreamUrl = `${opts.origin}${upstreamPath}${new URL(request.url).search}`;
  return serveTile(request, env, ctx, upstreamUrl, `${opts.cacheKeySuffix}:${upstreamPath}`);
}

async function serveTile(request, env, ctx, upstreamUrl, keySuffix) {
  // Method guard
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }

  // Browser says "fresh" — honour that.
  const ifNoneMatch = request.headers.get("if-none-match");

  // Try Cloudflare's edge cache first.
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    if (ifNoneMatch && cachedResponse.headers.get("etag") === ifNoneMatch) {
      return new Response(null, {
        status: 304,
        headers: cachedResponse.headers,
      });
    }
    return cachedResponse;
  }

  // Cache miss — fetch upstream.
  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "lumes.pt-tile-cache/1.0 (+https://lumes.pt)",
        Accept: request.headers.get("accept") ?? "*/*",
      },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheTtlByStatus: { "200-299": CACHE_TTL_SECONDS, "404": 60, "5xx": 0 } },
    });
  } catch (err) {
    return new Response(`upstream fetch failed: ${err.message}`, { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  }

  // Build a response with appropriate cache-control.
  const headers = new Headers(upstream.headers);
  headers.set("cache-control",
    `public, max-age=${BROWSER_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`
  );
  // Allow cross-origin (workers on *.lumes.pt are first-party; this is defensive)
  headers.set("access-control-allow-origin", "*");

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers,
  });

  // Store in edge cache. Use cache.put() which doesn't return the cached
  // response but writes it for future matches.
  ctx.waitUntil(cache.put(request, response.clone()));

  return response;
}

export default worker;
