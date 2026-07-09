// lumes.pt service worker
//
// Strategies:
//   - HTML navigation: network-first, fallback to cached /offline.html
//   - Static assets (/_next/static, /static, /icon-*, /manifest): cache-first
//   - /api/* GETs: stale-while-revalidate; mutations pass through
//   - Cross-origin (tiles, ANEPC, FIRMS, etc.): bypass
//
// Versioning: bump CACHE_NAME whenever you ship SW changes. Old
// caches are purged on activate.

const CACHE_NAME = "lumes-v2";

// Pre-cache the offline page and the static shell. The homepage
// itself is too dynamic to precache — it's navigated to while online.
const PRECACHE = [
  "/offline.html",
  "/manifest.json",
  "/status",
  "/privacy",
];

const STATIC_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const API_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

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
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
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
      })()
    );
    return;
  }

  // Static assets: cache-first with stale-while-revalidate.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    url.pathname === "/manifest.json" ||
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
            Date.now() - new Date(dateHeader).getTime() < STATIC_CACHE_MAX_AGE_MS;
          if (ageOk) return cached;

          // Stale: serve cached, refetch in background.
          event.waitUntil(
            fetch(req)
              .then((res) => {
                if (res.ok) cache.put(req, res);
              })
              .catch(() => {})
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
      })()
    );
    return;
  }

  // API GETs: stale-while-revalidate with a freshness cap.
  if (url.pathname.startsWith("/api/")) {
    // Skip SSE (long-lived) and cron endpoints.
    if (
      url.pathname === "/api/realtime" ||
      url.pathname.startsWith("/api/cron/")
    ) {
      return;
    }
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) {
          const dateHeader = cached.headers.get("date");
          const ageOk =
            !dateHeader ||
            Date.now() - new Date(dateHeader).getTime() < API_CACHE_MAX_AGE_MS;
          if (ageOk) {
            // Stale-while-revalidate: fetch in background.
            event.waitUntil(
              fetch(req)
                .then((res) => {
                  if (res.ok) cache.put(req, res);
                })
                .catch(() => {})
            );
            return cached;
          }
        }
        // Cache miss or stale: fetch live.
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          // Network down: serve stale cache if any.
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })()
    );
    return;
  }

  // Everything else: pass through.
});
