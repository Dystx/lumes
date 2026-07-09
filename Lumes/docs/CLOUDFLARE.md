# Cloudflare fronting for lumes.pt

How to put Cloudflare in front of your VPS to absorb 90 %+
of read traffic before it ever hits the origin. Free tier is enough
for everything below; Pro ($20/mo) is optional and helpful only at
the upper edge of viral traffic.

## 0. Why Cloudflare in front

Without Cloudflare, every request hits the origin VPS. A typical
4-vCPU / 8 GB box can comfortably handle ~5,000 concurrent users; a Portuguese
fire going viral can easily produce 5x that. Cloudflare:
- Serves cacheable responses (HTML, JSON, tiles) from 300+ edge POPs
- Replaces TLS handshake and DDoS protection work
- Allows the origin to focus on dynamic writes and unique reads
- Adds Web Analytics (free, GDPR-clean — no cookie banner required)

Cost: **€0/mo** for everything we use.

## 1. Sign up and add the zone

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up
   (free, no card needed for free tier).
2. Click **+ Add a Site**, enter `lumes.pt`.
3. Pick the **Free** plan.
4. Cloudflare will scan for existing DNS records. Approve what it
   finds, then add the A record pointing at your VPS:
   ```
   A    lumes.pt     <box-ip>     Proxied
   A    www          <box-ip>     Proxied
   ```
   The orange cloud icon means "proxied through Cloudflare".
5. Cloudflare gives you two nameservers (e.g. `maria.ns.cloudflare.com`).
   In your domain registrar, replace the existing nameservers with
   these. Propagation: 5 minutes to a few hours typically.

## 2. SSL/TLS configuration

In **SSL/TLS → Overview**:

- Mode: **Full (Strict)**
  Cloudflare → origin (VPS) TLS is verified end-to-end. Caddy
  on the VPS already issues and renews the cert via
  Let's Encrypt, so this works without additional config.
- Edge Certificates → Always Use HTTPS: **ON**
- Minimum TLS Version: **1.2** (TLS 1.3 will negotiate automatically)

In **SSL/TLS → Edge Certificates → Always Use HTTPS**: ON.

In **SSL/TLS → Universal** (or **Edge Certificates → HSTS**):
Enable HSTS with **6 months** max-age, **includeSubDomains** enabled,
**preload** enabled. This stops a downgrade attack entirely.

## 3. Cache Rules (replaces old Page Rules)

Use the new **Caching → Cache Rules** section. Create these four
rules in order:

### Rule 1 — Cache static assets forever

- **Name**: `Cache static assets`
- **Match**: `(http.request.uri.path matches "^/_next/static/.*$") or (http.request.uri.path matches "^/static/.*$") or (http.request.uri.path matches "^/(favicon\\.ico|robots\\.txt)$")`
- **Action**: **Cache eligible**, edge TTL **1 year**, browser TTL **1 year**, cache key includes nothing extra

Static files at `/_next/static/*` are content-hashed by Next.js and
safe to cache forever — they never change once deployed.

### Rule 2 — Cache API responses (the big one)

- **Name**: `Cache API read endpoints`
- **Match**: `(http.request.uri.path in {"/api/incidents" "/api/dashboard" "/api/source-health" "/api/weather" "/api/weather-warnings" "/api/fire-risk" "/api/satellite" "/api/fire-stations" "/api/regional-commands" "/api/stats" "/api/history"}) and (http.request.method eq "GET")`
- **Action**: **Cache eligible**, edge TTL **varies** by the
  `s-maxage` header sent by origin, browser TTL = edge TTL, **origin
  Cache-Control is honored** (Cloudflare reads your `Cache-Control:
  s-maxage=N` and uses that).

This is the rule that saves the origin. The routes already send
Cache-Control headers from the cron refactor; Cloudflare will use
them automatically.

### Rule 3 — Bypass cache for write/read-mutating endpoints

- **Name**: `Bypass mutations and live streams`
- **Match**: `(http.request.uri.path in {"/api/cron/ingest" "/api/follow" "/api/reports" "/api/alerts" "/api/realtime"}) or (http.request.method ne "GET" and http.request.uri.path eq "/api/*")`
- **Action**: **Bypass cache**

### Rule 4 — Cache static public files

- **Name**: `Cache public assets`
- **Match**: `(http.request.uri.path matches "\\.(js|css|svg|png|jpe?g|webp|woff2?)$") and (http.host eq "lumes.pt")`
- **Action**: **Cache eligible**, edge TTL **1 day**, browser TTL **1 hour**

## 4. Rate-limit rules (free tier supports 2 rules)

In **Security → WAF → Rate limit rules**:

### Rule 1 — protect the cron endpoint

- **Name**: `Rate-limit cron`
- **Match**: `http.request.uri.path eq "/api/cron/ingest"`
- **Action**: Block for 60 s when **requests exceed 10 per 10 s** from a single IP.

The intended rate is 1 / min; this catches abuse.

### Rule 2 — protect write endpoints

- **Name**: `Rate-limit user writes`
- **Match**: `(http.request.uri.path in {"/api/follow" "/api/reports" "/api/alerts"}) and (http.request.method eq "POST")`
- **Action**: Block for 60 s when **requests exceed 30 per 10 s** from a single IP.
- (A human following 3 incidents in 10 seconds is well under this.)

## 5. Web Analytics (free, GDPR-clean)

In **Analytics → Web Analytics → Add a site**:

- Domain: `lumes.pt`
- Auto-inject the JS snippet: **No** (Next.js can do it explicitly
  via the partytown / next/script integration; or you can paste the
  beacon in `app/layout.tsx`).
- The beacon is `cf-beacon` — a 1.2 KB script that does no cookie
  tracking. **No cookie banner is required under GDPR**, but
  consult legal counsel for your specific situation.

Web Analytics is great because it gives you real-user performance
data (Core Web Vitals) without any per-request cost — perfect for a
public-interest site.

## 6. Bot Fight Mode (Security → Bots)

Default protection is fine. If you find yourself hit by aggressive
scrapers (legitimate or not), set Bot Fight Mode to **Enabled**.

Cardinal Sin: do **not** enable **Super Bot Fight Mode** unless you
specifically need it — it can block Google and Bing crawlers if
misconfigured.

## 7. Verify

After DNS propagates (~10 minutes usually):

```sh
# Confirm Cloudflare is in front of the box:
dig lumes.pt +short
# Expect Cloudflare IPs (104.16.x.x or similar), not the VPS IP.

# Confirm cache is hitting the edge:
curl -I https://lumes.pt/api/incidents
# Look for: cf-cache-status: HIT (or DYNAMIC on first request)

# Force a cache-miss check (Cloudflare forwards the request):
curl -I -H "Cache-Control: no-cache" https://lumes.pt/api/incidents
# Expect: cf-cache-status: DYNAMIC, server: Caddy (came from origin)
```

## 8. Optional — Workers (only if going beyond the above)

The Free plan includes 100,000 Worker requests/day. That's enough
to add a tile-cache Worker without spending anything.

If you find yourself at the upper edge of viral traffic and need
to push cached responses from CF instead of origin, see
[`docs/TILES.md`](./TILES.md) for the Worker snippet that caches
tile upstream requests.

## 9. Cost summary

| Item | Cost |
| --- | ---: |
| Cloudflare Free | €0 |
| Cloudflare Pro (optional, only above ~50 k concurrent) | $20/mo ≈ €18 |
| Origin (4 vCPU / 8 GB VPS, ~€8.50-9/mo) | €9/mo |
| **Total** | **€8.99/mo** at typical traffic |

## 10. What this guide does NOT cover

- **Workers paid tier** ($5/mo): only needed at very high
  request volumes from Cloudflare Worker scripts.
- **Cloudflare R2**: not used by default. Only relevant if you
  decide to cache tiles through R2 instead of browser/edge cache.
  See `docs/TILES.md`.
- **Argo / Smart Routing** ($5/mo): not necessary unless you have
  multi-region origin.
- **Access / Zero Trust**: only relevant if you want to put auth
  in front of staging environments. Out of scope for production.

## 11. Maintenance — about 5 minutes a month

Every quarter or so, log into the Cloudflare dashboard and:
- Review cache hit ratio (target > 80 %)
- Review rate-limit hits (should be < 100/day for legitimate traffic)
- Confirm Web Analytics shows expected traffic levels
- Check for security events flagged by the WAF

That's it. Cloudflare is configured-and-forget for a non-adversarial
public-information site. The moment you attract adversarial attention
(viral misinformation, doxxing attempts, etc.) revisit the WAF
configuration — but for a Portuguese fire map, the WAF defaults are
plenty.
