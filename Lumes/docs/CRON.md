# Cron-driven ingest

This document explains how the incident ingest pipeline runs in production.
Background: prior to this change, ingestion ran synchronously on every page
load, triggering 100+ SQL upserts per request. That's the bug this design
fixes.

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                │
  │   Cron ───►  /api/cron/ingest  ───►  lib/ingest.runIngest()     │
  │   (any)    (HTTP endpoint)              │                       │
  │   :60s           │                      ▼                       │
  │                  │              ANEPC ArcGIS fetch              │
  │                  │              normalizeFeature               │
  │                  │                      │                       │
  │                  ▼                      ▼                       │
  │            persistIncidents(...)  ───►  Prisma DB               │
  │                                                                │
  │   Browser ──►  /api/incidents  ──►  read-only live ANEPC        │
  │   (page)         (no persist)        (cached 30s)               │
  │                                                                │
  └─────────────────────────────────────────────────────────────────┘
```

Two things to schedule:
1. The ingest cron (every 60 seconds).
2. (Optional) Database backups — see "Backup" section below.

Everything else stays the same: the homepage reads from `/api/incidents`,
which now does the upstreams live but **never writes to Prisma**. Read
endpoints (`/api/dashboard`, `/api/history`) read from Prisma as before.

## Pick the cron driver

The cron driver depends on where you deploy.

### Option A — System crontab (self-host on Hetzner, OVH, etc.)

If you're running `next start` directly behind Caddy on a VPS, the simplest
path is a `crontab` entry that invokes the bundled CLI:

```cron
# Run ingest every minute. Single-line JSON output is logged.
* * * * * cd /opt/lumes && bun scripts/ingest.ts >> /var/log/lumes/ingest.log 2>&1
```

For this to work:
- `bun` must be on PATH (the project already uses it — `bun.lock` is present).
- `DATABASE_URL` must be set in the cron environment. Either `crontab`'s
  default environment or an explicit `DATABASE_URL=…` prefix:
  ```cron
  * * * * * cd /opt/lumes && DATABASE_URL='file:/opt/lumes/db/custom.db' bun scripts/ingest.ts >> /var/log/lumes/ingest.log 2>&1
  ```
- The SQLite file must be writable by the cron user (usually the same as
  the web user).

Verify with:
```sh
crontab -l
journalctl -u cron -n 20
cat /var/log/lumes/ingest.log
```

### Option B — systemd timer (more robust than cron)

If your box has systemd, prefer a timer over crontab — it gives you
proper logging, retry on failure, and a clean status command.

`/etc/systemd/system/lumes-ingest.service`:
```ini
[Unit]
Description=lumes.pt ingest pass
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/lumes
Environment=DATABASE_URL=file:/opt/lumes/db/custom.db
ExecStart=/usr/local/bin/bun /opt/lumes/scripts/ingest.ts
User=lumes
StandardOutput=journal
StandardError=journal
```

`/etc/systemd/system/lumes-ingest.timer`:
```ini
[Unit]
Description=Run lumes.pt ingest every minute

[Timer]
OnBootSec=10s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true

[Install]
WantedBy=timers.target
```

Activate and verify:
```sh
sudo systemctl daemon-reload
sudo systemctl enable --now lumes-ingest.timer
systemctl list-timers lumes-ingest.timer
journalctl -u lumes-ingest.service -n 20
```

### Option C — HTTP cron (Vercel, Cloudflare, Render)

If you deploy to a PaaS without shell access, use the HTTP endpoint:

```
GET  https://lumes.pt/api/cron/ingest
Authorization: Bearer <CRON_SECRET>
```

Configure the secret before deploying (`openssl rand -hex 32` will give a
value to put in your platform's env-var UI). The endpoint is fail-closed:
without `CRON_SECRET` set, **every** request returns 401.

Then schedule it with whatever scheduler the platform offers:

| Platform | Where to schedule |
| --- | --- |
| Vercel | `vercel.json` → `crons: [{"path": "/api/cron/ingest", "schedule": "* * * * *"}]` |
| Cloudflare Pages | `wrangler.toml` → `triggers.crons = ["* * * * *"]` (note: minute-cron via account dashboard → Workers → Cron Triggers) |
| Render | "Cron Jobs" tab in the dashboard |
| Railway | A second service running `bun scripts/ingest.ts` in a loop |

Vercel in particular caps hourly invocations on the Hobby plan; check the
platform's docs for the exact limit. One call per minute is 1 440/day,
which is well within all paid tiers and most free tiers.

## Verify the ingest is alive

After the deploy, in production:

```sh
# Manual trigger (using the secret you set)
curl -s "https://lumes.pt/api/cron/ingest?secret=$CRON_SECRET" | jq

# What you should see:
# {
#   "source": "anepc-prociv-arcgis",
#   "fetchedAt": "2026-07-05T...",
#   "totalRaw": 173,
#   "upserted": 173,
#   "created": 12,
#   "updated": 161,
#   "snapshotsCreated": 3,
#   "errors": [],
#   "latencyMs": 412
# }
```

A handful of `created` and zero-to-few `snapshotsCreated` per minute is
the healthy signature. Heavy `errors` arrays mean ANEPC upstream is
having a bad time and the script is gracefully degrading.

## What the refactor changed in `/api/incidents`

The read endpoint no longer calls `persistIncidents()`; that work has
moved to `scripts/ingest.ts` (called by the cron) and to
`/api/cron/ingest` (HTTP wrapper around the same code).

What stayed the same:
- Response shape (`{ incidents, distribution, count, source, ... }`).
- In-process 60-second cache to prevent ANEPC stampede.
- Concurrent-fetch lock.

What changed:
- All `Cache-Control` headers downgraded from `s-maxage=60` to
  `s-maxage=30, stale-while-revalidate=120`. This makes a CDN (Cloudflare
  in front of Hetzner, or Vercel's edge cache) absorb most of the read
  traffic, even though ANEPC is still fetched live every minute.

The net effect:
- DB write rate: previously 100+ upserts per page load → now zero on the
  read path, 1 cron invocation per minute doing the same work.
- DB read rate: unchanged.
- ANEPC upstream rate: ~one fetch per minute per process (still gated by
  the in-process 60s cache), regardless of how many users hit the page.

## Backup

Add a daily `pg_dump`-equivalent for SQLite. The simplest backup of a
SQLite database is the `VACUUM INTO` command, which produces a clean
copy without locking the live database:

```cron
# 04:00 local time
0 4 * * * sqlite3 /opt/lumes/db/custom.db ".backup /var/backups/lumes/custom.$(date +\%Y\%m\%d).db"
```

Or use `litestream` for continuous replication to S3 / Backblaze. That's
outside this doc's scope but is the standard production answer.

## Local development

When iterating locally without a cron, you can run the ingest in a
separate terminal:

```sh
bun scripts/ingest.ts
# in another terminal
bun run dev
```

Or run `bun scripts/ingest.ts --watch` (one-shots aren't watched) and
just hit Cmd-R in dev when you want to refresh data.

## If you ever migrate to Postgres

`scripts/import-sqlite-to-postgres.ts` (already in the repo) handles the
one-time data migration from SQLite to Postgres. The cron-driven ingest
pipeline above doesn't change either way — `runIngest()` uses the same
Prisma client regardless of which provider is configured.
