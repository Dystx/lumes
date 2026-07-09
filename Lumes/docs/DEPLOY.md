# Lumes.pt — Server Deployment Documentation

> Last updated: 2026-07-09 (full no-remote deploy complete; service active with /usr/local/bin/bun; Caddy headers; site working, no more error/unformatted. Gates: lint 0, tests 10/10, build success. Confirmed current code.)

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Internet                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ :443 (HTTPS)
                               ▼
                    ┌──────────────────────┐
                    │       Caddy          │  Reverse proxy
                    │  :80 → :443 + TLS    │  (auto Let's Encrypt)
                    │   + HTTP→HTTPS       │
                    └──────────┬───────────┘
                               │ :3001
                               ▼
                    ┌──────────────────────┐
                    │  Next.js Standalone  │  Bun runtime
                    │  bun server.js       │  (user systemd)
                    │   :3001              │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       /opt/apps/lumes/   /opt/logs/      /opt/apps/lumes/
         .next/          lumes.log       db/custom.db
       (build output)   lumes.err       (SQLite)
```

## Server details

| Item            | Value                                           |
|-----------------|-------------------------------------------------|
| Host           | 152.53.145.9                                    |
| OS             | Debian 13 (Trixie)                               |
| User           | `lumes` (systemd user)                           |
| App dir        | `/opt/apps/lumes/`                               |
| Bun            | `/usr/local/bin/bun` (v1.3.14)                   |
| Port (app)     | 3001 (set in `.env`)                             |
| Port (caddy)    | 80 + 443                                         |
| Cert           | Let's Encrypt (auto-renewed by Caddy)            |
| DB             | `/opt/apps/lumes/db/custom.db` (SQLite)          |
| Logs           | `/opt/logs/lumes.log`, `/opt/logs/lumes.err`      |
| Systemd unit   | `/home/lumes/.config/systemd/user/lumes.service` |
| Env file       | `/opt/apps/lumes/.env`                           |

## `lumes.service` systemd unit

```ini
[Unit]
Description=lumes Next.js standalone
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/apps/lumes
EnvironmentFile=/opt/apps/lumes/.env
ExecStart=/usr/local/bin/bun /opt/apps/lumes/.next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/logs/lumes.log
StandardError=append:/opt/logs/lumes.err
Environment=PATH=/home/lumes/.bun/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
```

## `.env`

```bash
DATABASE_URL=file:/opt/apps/lumes/db/custom.db
PORT=3001
NODE_ENV=production
CRON_SECRET=<32 hex chars>
FIRMS_MAP_KEY=<32 hex chars>
```

## Caddyfile (single site)

```caddy
:80 {
    redir 301 {
        / https://{host}{uri}
    }
}

:443 {
    reverse_proxy localhost:3001 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```

(Kept in `Lumes/Caddyfile` in the repo, deployed to `/etc/caddy/Caddyfile`.)

## Build output structure

`next.config.ts` declares `output: "standalone"`, which means `bun run build` produces:

```
.next/
├── BUILD_ID                        # git hash + timestamp
├── build-manifest.json
├── app-build-manifest.json
├── server/                          # SSR chunks (Node/Bun entrypoint)
│   ├── app/page.js
│   ├── chunks/ssr/_*.js
│   └── chunks/ssr/[root-of-the-server]__*.js
├── static/                          # static assets
│   ├── chunks/                      # <-- BROWSER LOADS THESE
│   │   ├── 0fd0e13950fbe483.js
│   │   ├── 1104eb3445058576.js
│   │   └── ...
│   ├── css/
│   └── media/
├── standalone/                      # deployable runtime bundle
│   ├── server.js                    # the entrypoint
│   ├── .next/                       # server files + copied static assets
│   │   └── static/                  # copied by deploy.sh
│   ├── public/                       # copied sw.js, manifest, offline assets
│   ├── node_modules/                # pruned prod deps
│   └── package.json
└── cache/                           # next/data cache
```

**Important:** Next does not copy browser chunks or `public/` into the
standalone directory. `deploy/deploy.sh` copies `.next/static/` to
`.next/standalone/.next/static/` and `public/` to `.next/standalone/public/`
before restarting the service. Both copies are required: without them CSS,
client chunks, or `/sw.js` return 404 from the standalone runtime.

## Deploy flow

### Local → Server

1. **Code changes** in `Lumes/`
2. **Local build** (sanity check): `bun run build`
3. **Rsync** to server:

   ```bash
   rsync -az --delete \
     --exclude='.git' --exclude='node_modules' --exclude='.next' \
     --exclude='db/*.db' --exclude='prisma/*.db' --exclude='*.log' \
     --exclude='.env*' --exclude='tests' \
     Lumes/ lumes@152.53.145.9:/opt/apps/lumes/
   ```

   Note: `--exclude='.next'` so we don't overwrite the server's build
   until we explicitly rebuild there.
4. **SSH to server** and rebuild:

   ```bash
   ssh lumes@152.53.145.9
   cd /opt/apps/lumes
   export PATH=/usr/local/bin:$PATH
   bun run build              # outputs to /opt/apps/lumes/.next/
   mkdir -p .next/standalone/.next/static .next/standalone/public
   cp -r .next/static/. .next/standalone/.next/static/
   cp -r public/. .next/standalone/public/
   systemctl --user restart lumes.service
   sleep 5
   curl -fsS http://127.0.0.1:3001/api/source-health
   ```

5. **Verify** with a fresh browser context (no service-worker cache).

### One-command deploy helper

`Lumes/deploy/deploy.sh` runs the above on the server. From a local checkout:

```bash
bash deploy/deploy.sh lumes@lumes.pt    # push from local (or use --server on box)
# or on the server:
bash deploy/deploy.sh                   # rebuild only (auto-detects)
```

Current state (2026-07-10): service active with `/usr/local/bin/bun`; standalone static and public assets are bundled at deploy time; FIRMS key is required for full satellite coverage.
```

## The "chunks not loading" incident (2026-07-09)

### What broke

User reported: "moon is not defined" and the page was blank with
errors like "activeFilterItems is not defined".

### Root cause (3 layers)

1. **Next.js standalone build** puts the server in `.next/standalone/`,
   but omits browser chunks and `public/` files. The standalone runtime
   therefore returns 404 unless deploy copies both assets into it.

2. **Service worker** in `public/sw.js` was using `CACHE_NAME = "lumes-v1"`
   which aggressively cached every `/_next/static/chunks/*` URL
   ("cache-first" strategy in the fetch handler).

3. **Each build** produces **different chunk hashes** (Turbopack names
   them by content). After the rebuild on 2026-07-09, the new HTML
   referenced chunks like `c209e4c3bba68515.js`, but the user's
   browser still had the OLD `lumes-v1` cache with the OLD chunk
   URLs (e.g. `771dedee3f5e1621.js` from a previous build).

4. The OLD chunks were **deleted from disk** during the build, so
   the cached requests 404'd. The page tried to load JS modules that
   didn't exist → "X is not defined" ReferenceError chains.

### Why "activeFilterItems is not defined" was the *real* error

The variable `activeFilterItems` was declared and used **inside
`DashboardPanel()`** in `src/app/page.tsx`. The DashboardPanel
component is a separate function from `Home()`. Because the
`DashboardPanel` chunk was the one that failed to load, the whole
component never mounted, and the React error boundary caught the
crash and displayed "Something went wrong" — the user saw this as
"the page is broken".

The error was NOT a missing variable. It was a **transitive
failure of a missing JS file that should have been served but
wasn't, because the browser had cached a reference to a chunk that
no longer exists**.

### The fix (3 parts)

1. **Bumped the SW cache** in `public/sw.js`:

   ```diff
   - const CACHE_NAME = "lumes-v1";
   + const CACHE_NAME = "lumes-v2";
   ```

   This forces the old cache to be purged on next SW activation.

2. **Copy chunks and public assets into the standalone dir** during deploy:

   ```bash
   cp -r .next/static/. .next/standalone/.next/static/
   cp -r public/. .next/standalone/public/
   ```

   This is required for the standalone server to serve the browser runtime.

3. **Bun restart**: `systemctl --user restart lumes.service`

### How to avoid this in future

- **Bump `CACHE_NAME` in `public/sw.js` on every deploy** with breaking
  build changes. Add a CI check that fails if `BUILD_ID` changed
  but `CACHE_NAME` didn't.
- **Add a `Cache-Control: no-cache, must-revalidate`** header to
  `/_next/static/chunks/*` in Caddy so the browser always asks the
  server if the file is still there. (Currently relying on
  `stale-while-revalidate` which still allows stale responses.)
- **Add a "service worker update" prompt** in the UI (currently
  the SW does `skipWaiting()` immediately, which can race with
  active requests).

## Operational cheatsheet

| Task                        | Command                                                                    |
|-----------------------------|----------------------------------------------------------------------------|
| View live logs              | `tail -f /opt/logs/lumes.log`                                              |
| View error logs             | `tail -f /opt/logs/lumes.err`                                              |
| Restart service             | `systemctl --user restart lumes.service`                                   |
| Service status              | `systemctl --user status lumes.service`                                    |
| Clear all caches            | `rm -rf .next && bun run build` then restart                              |
| Caddy status                | `systemctl status caddy`                                                  |
| Reload Caddy                | `systemctl reload caddy`                                                  |
| View .env                   | `cat /opt/apps/lumes/.env`                                                |
| Disk usage                  | `du -sh /opt/apps/lumes/.next /opt/apps/lumes/db /opt/logs`               |
| Check DB size               | `ls -lh /opt/apps/lumes/db/custom.db`                                     |
| Health endpoint             | `curl -s http://127.0.0.1:3001/api/source-health \| jq`                   |
| Manually fire ingest        | `curl -s -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3001/api/cron/ingest` |
| Manually fire prune         | `curl -s -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3001/api/cron/prune`  |

## Cron

`lumes-ingest.timer` fires every 60s, calls `/api/cron/ingest`
(fetches fresh incidents from upstream RSS/API).
`lumes-prune.timer` fires daily at 04:17, calls `/api/cron/prune`
(deletes snapshots older than 7 days).

Both auth via `x-cron-secret` header (env: `CRON_SECRET`).
