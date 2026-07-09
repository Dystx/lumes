# Contributing to lumes.pt

Welcome. This file explains the smallest set of conventions needed
to land a change without friction. If anything here is unclear,
the code itself is the second source of truth.

## What kind of contributions we want

- **New data sources** (a connector for a service we don't yet
  ingest). See §2 below for the API route convention.
- **Bug fixes** in persistence, normalisation, or visualisation.
- **Map features** — additional overlays (wind direction,
  evacuation zones, municipal boundaries, etc.).
- **Performance work** — the cheapest win is always "cache more
  aggressively".

## What we don't accept without prior discussion

- **Framework swaps**, **build-tool changes**, **styling system
  rewrites**. Open an issue first to discuss the trade-off.
- **Type-loosening** (`as any`, `// @ts-ignore`) without a comment.
- **Direct commits to `main`.** Always via a PR.

## Developer setup

```sh
bun install
bun run dev          # next dev + watch
bun run lint         # eslint
bun run test         # vitest (auto-runs once bun install + db push done)
bun run build        # production build
```

Local SQLite DB lives at `db/custom.db`; schema is in
`prisma/schema.prisma`. Run `bunx prisma db push` to apply schema
changes during development.

## 1. Branch + commit conventions

```sh
git checkout -b feat/add-meteo-portugal-overlay
# or
git checkout -b fix/incidents-cron-jitter
# or
git checkout -b docs/recovery-runbook
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(api): add /api/cron/ingest bearer-auth endpoint
fix(persistence): don't snapshot when state unchanged
docs(deploy): document Netcup VPS 1000 G12 flow
refactor(ingest): extract runIngest() to lib/ingest.ts
test(persistence): add state-transition snapshot tests
chore(deps): bump @prisma/client to 6.12
```

A PR title should match the commit type — the merge-to-main
commit is auto-generated from the squash, so write the title like
a commit message.

## 2. Adding a new data source

The project has 11 API routes, all under `src/app/api/<source>/route.ts`.
Adding a new source means writing one more. Use the existing ones
as templates.

The convention is:

```ts
// src/app/api/<source>/route.ts

import { NextResponse } from "next/server";

const UPSTREAM_URL = "...";
const CACHE_TTL_MS = 60 * 60 * 1000;  // pick an appropriate TTL
let cache: { data: any; ts: number; status: "ok" | "error"; error?: string } | null = null;

export async function GET() {
  // 1. Serve from in-process cache when fresh.
  if (cache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: {
        "Cache-Control": "public, s-maxage=<N>, stale-while-revalidate=<M>",
      },
    });
  }

  // 2. Fetch upstream with a bounded timeout.
  // 3. Normalise the payload to LiveIncident-like shape.
  // 4. Cache and return with the same Cache-Control header.
}
```

The two non-negotiables:
- **`Cache-Control` header on every response.** Pick `s-maxage`
  to match how often the upstream publishes.
- **`AbortSignal.timeout(N)` on the upstream fetch.** ANEPC,
  IPMA, FIRMS, and OSM all hang sometimes. Cap it at 15 s.

Then add a `<source>` block to `src/app/api/source-health/route.ts`
so operators can see at a glance whether your source is up.

## 3. Persistence changes

The persistence layer (`src/lib/persistence.ts`) is the single
most important code in the project. Any change that touches
Prisma writes should:

- Pass `tests/lib/persistence.test.ts`. New behaviour must have a
  new test in the same file.
- Not use upsert loops that issue N round-trips. Use
  `createMany` / `updateMany` where possible.
- Handle `stale` incidents in a single bulk update, not per-row.

If you're migrating to Postgres, write a test that hits both
SQLite and Postgres paths against a test schema.

## 4. Visual / UI changes

- Tailwind 4 + shadcn/ui. No new styling libraries without prior
  discussion.
- Map component (`src/components/ember-map.tsx`) is the most
  complex file; touch it carefully and add screenshots / screencast
  in the PR.
- MapLibre / vector tile conventions: keep `tile.json` style
  URLs cacheable (Cache-Control: max-age=2592000).

## 5. PR checklist

Before requesting review, the PR must:

- [ ] Pass `bun run lint`
- [ ] Pass `bun run test`
- [ ] Pass `bun run build` (the CI builds it for real)
- [ ] If it touches `src/lib/persistence.ts`, modify or extend the
      tests in `tests/lib/persistence.test.ts`
- [ ] If it adds a new data source, add a row to the source-health
      endpoint
- [ ] If it adds an API route, set `Cache-Control` headers
- [ ] Update `docs/RUNBOOK.md` if it adds a new failure mode or
      recovery procedure
- [ ] Include a screenshot / screencast if it changes the UI

Reviewers can request changes on any of these.

## 6. Committing data sources

Do **not** commit:

- Real coordinates of ongoing incidents in test fixtures (use
  examples from the docs).
- Real ANEPC API responses (they may contain personally
  identifiable information about responders).
- API keys, including the `FIRMS_MAP_KEY` or any token. The
  `.env` is git-ignored for a reason.

## 7. Releases

There are no tagged releases yet. When we cut one, the version
process is:

- Bump `package.json` version.
- Tag with `git tag -s v0.x.y`.
- Notes in the GitHub Release describe what changed.

## 8. Code of conduct

Contributors are expected to be respectful. This is a public-
interest site that may eventually be used by people in genuine
distress during a fire event. Disrespect toward maintainers,
contributors, or users is grounds for a ban without warning.

## 9. Where to ask

GitHub Issues for everything. There's no Discord / Slack. Keep
discussion in the open so others can learn from it.
