# lumes.pt

**Citizen wildfire intelligence for Portugal.** Real-time fire map,
official ANEPC bulletins, IPMA weather, NASA FIRMS satellite
detections, and community reports — in one place.

🌐 **https://lumes.pt** (when deployed)

## What it does

- **Live map** of active wildfires with severity, deployed
  resources (operational, ground, aerial), incident status, and
  geographic context.
- **Fire risk forecast** (IPMA RCM) for all 278 mainland
  municipalities.
- **Active weather warnings** (IPMA) — heat, wind, thunderstorms,
  etc.
- **NASA FIRMS satellite detections** as an independent
  corroborating source.
- **24-h timeline** of incident state changes, captured as
  snapshots on every ANEPC update.

Built for citizens, journalists, and (informally) civil-protection
volunteers who need to know what's burning right now.

## Architecture (in one paragraph)

Next.js 16 + React 19 + Prisma + SQLite + Caddy + Cloudflare. The
read path uses aggressive edge caching; writes (incident ingest
from ANEPC, community reports) are isolated to cron-driven jobs and
explicit user actions. Three second-cron cadence feeds the database
without ever triggering 100-query bursts on the request path.
Full architecture rationale is in
[`docs/research/hosting-options-2026.md`](./docs/research/hosting-options-2026.md).

## Documentation

The full operating document set:

- **[`docs/DEPLOY.md`](./docs/DEPLOY.md)** — provider-agnostic deploy guide
- **[`docs/HOSTING-NETCUP.md`](./docs/HOSTING-NETCUP.md)** — Netcup-specific companion
- **[`docs/CRON.md`](./docs/CRON.md)** — cron ingest pipeline, three scheduling recipes
- **[`docs/RUNBOOK.md`](./docs/RUNBOOK.md)** — what to do when something breaks
- **[`docs/CLOUDFLARE.md`](./docs/CLOUDFLARE.md)** — front the VPS with Cloudflare
- **[`docs/TILES.md`](./docs/TILES.md)** — map-tile caching strategy
- **[`docs/research/hosting-options-2026.md`](./docs/research/hosting-options-2026.md)** — 14k-word architectural deep-dive

## Local development

```sh
# 0. Prereqs: bun, sqlite3, git
#    Install bun: curl -fsSL https://bun.sh/install | bash

# 1. Install dependencies
bun install

# 2. Set up local .env
cp .env.example .env   # (if .env.example doesn't exist, see DEPLOY.md §5)

# 3. Create the SQLite schema + run import if you have existing data
bunx prisma db push
bun scripts/import-sqlite-to-postgres.ts  # only if migrating from a populated db

# 4. Start the ingest cron in one terminal
bun scripts/ingest.ts --watch   # (or once via `bun scripts/ingest.ts`)

# 5. Start Next.js in another terminal
bun run dev
```

Open http://localhost:3000

## Project structure

```
src/
├── app/
│   ├── api/                  # API routes (read-only + cron entry)
│   │   ├── incidents/        # live ANEPC incidents
│   │   ├── dashboard/        # aggregated metrics
│   │   ├── cron/ingest/      # bearer-auth cron endpoint
│   │   ├── weather/          # IPMA
│   │   ├── satellite/        # NASA FIRMS
│   │   └── ...
│   ├── components/           # map, etc.
│   ├── lib/                  # db, persistence, ingest
│   └── page.tsx              # homepage
prisma/                       # schema
scripts/                      # ingest.ts, sqlite-to-postgres import
deploy/                       # setup-server.sh, install-lumes.sh, deploy.sh
docs/                         # all the docs above
public/                       # static assets
```

## Contributing

Issues, fixes, and new data-source connectors welcome. Open a PR
and the CI on this repo will verify build/lint pass.

For sensitive coordinate validation or ANEPC API quirks, ping the
maintainers directly.

## License

Source-available. The incident data sourced from ANEPC, IPMA, and
NASA FIRMS retains its original licence (typically open-data /
attribution-required). See `docs/CLOUDFLARE.md` §3 for upstream
attribution requirements when proxying.

## Status

[![CI](https://github.com/lumes-app/lumes-pt/actions/workflows/ci.yml/badge.svg)](https://github.com/lumes-app/lumes-pt/actions)
[![Deploy](https://github.com/lumes-app/lumes-pt/actions/workflows/deploy.yml/badge.svg)](https://github.com/lumes-app/lumes-pt/actions)

Synthetic data (biomass grid, composite risk) is model-derived and marked as such in UI/legend for transparency. Real sources preferred when available.
