// lumes.pt service worker
//
// Strategies:
//   - HTML navigation: network-first, fallback to cached /offline.html
//   - App chunks (/_next/static): bypassed so deploys always use the server's
//     content-hashed response; Caddy/HTTP caching handles immutable chunks.
//   - Other static assets (/static, /icon-*): cache-first
//   - /api/*: always network-owned so live/fire-health state keeps its server
//     cache policy and stale data is never presented as current.
//   - Cross-origin (tiles, ANEPC, FIRMS, etc.): bypass
//
// Runtime data is safe to version independently of application code. The
// registration script is revalidated on every deployment, while Next chunks
// never enter this cache, so a manual cache-version bump cannot strand users
// on an old application build.
const CACHE_NAME = "lumes-runtime";

// Pre-cache the offline page and the static shell. The homepage
// itself is too dynamic to precache — it's navigated to while online.
const PRECACHE = ["/offline.html", "/status", "/privacy"];

const STATIC_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await cache.addAll(PRECACHE).catch((e) => {
				// Some precached resources might not exist on first install;
				// log but don't fail the install.
				console.warn("[sw] precache partial failure:", e);
			});
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const req = event.request;

	// Only GET; everything else (POST/PUT/DELETE) passes through.
	if (req.method !== "GET") return;

	const url = new URL(req.url);

	// Cross-origin (tiles, ANEPC, FIRMS, IPMA, etc.): bypass.
	if (url.origin !== self.location.origin) return;

	// HTML navigation: network-first with offline fallback.
	if (req.mode === "navigate") {
		event.respondWith(
			(async () => {
				try {
					const fresh = await fetch(req);
					// Update precache in background for next time.
					const cache = await caches.open(CACHE_NAME);
					cache.put(req, fresh.clone()).catch(() => {});
					return fresh;
				} catch {
					// Offline: try cache, then offline page.
					const cached = await caches.match(req);
					return cached || (await caches.match("/offline.html"));
				}
			})(),
		);
		return;
	}

	// Never cache Next's runtime chunks in the service worker. A deployment can
	// remove old hashes, and serving a cached module from a previous build is
	// worse than allowing the browser/CDN to request the current asset.
	if (url.pathname.startsWith("/_next/static/")) return;

	// Static assets: cache-first with stale-while-revalidate.
	const isStatic =
		url.pathname.startsWith("/static/") ||
		url.pathname.startsWith("/icon-") ||
		url.pathname === "/opengraph-image.png";
	if (isStatic) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE_NAME);
				const cached = await cache.match(req);
				if (cached) {
					// Check age — if older than max age, refetch in background.
					const dateHeader = cached.headers.get("date");
					const ageOk =
						!dateHeader ||
						Date.now() - new Date(dateHeader).getTime() <
							STATIC_CACHE_MAX_AGE_MS;
					if (ageOk) return cached;

					// Stale: serve cached, refetch in background.
					event.waitUntil(
						fetch(req)
							.then((res) => {
								if (res.ok) cache.put(req, res);
							})
							.catch(() => {}),
					);
					return cached;
				}
				// No cache: fetch + cache.
				try {
					const res = await fetch(req);
					if (res.ok) cache.put(req, res.clone());
					return res;
				} catch {
					return new Response("offline", { status: 503 });
				}
			})(),
		);
		return;
	}


	// Freshness-critical APIs (incidents, sources, health) must be handled by
	// the network and their own HTTP cache headers, never this runtime cache.
	if (url.pathname.startsWith("/api/")) return;

	// Everything else: pass through.
});
