# Lumes.pt — Project Handoff

> **Date**: 2026-07-13
> **Status**: Reliability/refactor tranche and authorized production release verified; 3D provider and attachment gates remain separate
> **Live at**: `https://lumes.pt` is serving the current verified standalone release
> **Last session focus**: reliability, trust states, responsive IA, API safety, attachment/provider gates, 3D due diligence, and standalone release packaging

> **Current-state note (2026-07-13):** The detailed baseline findings and test
> counts below are historical context. The canonical current plan is
> `docs/superpowers/plans/2026-07-10-full-frontend-improvement.md`; it records
> the newer responsive/axe/API evidence, the feature-flagged 3D Phase 1 work,
> and the remaining provider/attachment-gated checks. Do not use the
> older `37 files / 101 tests` count or the historical mobile/dashboard
> failures as current-state claims.

### Current continuation evidence (2026-07-13)

- The current local unit baseline is **149 test files / 727 tests** (`bun run test`, serialized with a capped heap).
- Test counts in the older continuation bullets below are dated checkpoint
  counts from the same execution sequence; they are not additional current
  baselines. Use this line and the summary table in section 2 as the canonical
  current count.
- The public API response matrix now covers populated municipality aggregation,
  reviewed-report projection with a clamped public limit, and redacted report
  persistence failure. `/api/reports` explicitly projects its public DTO at
  the route boundary, protecting callers even if a persistence adapter returns
  extra columns. The bounded suite passes **114 test files / 371 tests**.
- The Open-Meteo risk boundary now validates provider JSON before composite
  scoring. Direct risk requests fail closed on malformed successful payloads;
  batch incident risk retains finite `no_weather` per-incident results. The
  bounded suite now passes **115 test files / 380 tests**.
- Dashboard live and database-fallback paths now reuse the Portugal-region
  coordinate validator, omitting finite-but-invalid geometry such as `0,0`
  from priority output. The bounded suite now passes **115 test files / 382
  tests**.
- `/api/risk-fwi/[day]` now validates its top-level IPMA forecast envelope and
  known row fields. Malformed 200 payloads fail closed; all-unusable rows are
  explicit cacheable empty state. The bounded suite now passes **116 test files
  / 387 tests**.
- The client aerial normalizer now validates the response bbox and drops
  finite-but-foreign aircraft points before MapLibre publication; malformed bbox
  metadata is rejected. The bounded suite now passes **116 test files / 389
  tests**.
- `/api/weather` now drops malformed required IPMA metrics instead of publishing
  fabricated zero values. Valid mixed observations remain usable and all-invalid
  timestamps become explicit cacheable empty state. The bounded suite now passes
  **117 test files / 396 tests**.
- NASA FIRMS `frp` and `bright_ti4` values now require strict finite,
  non-negative numeric tokens; malformed, infinite, and negative scalar rows are
  dropped before satellite DTO publication. Valid mixed rows remain and all-
  invalid payloads are explicit cacheable empty state. The bounded suite now
  passes **117 test files / 398 tests**.
- The shared ANEPC adapter now rejects missing, partial, non-finite, negative,
  and non-integer status-code, personnel, asset, and duration values before core
  incident or persistence publication. Valid mixed rows and valid zero values
  remain usable; all-invalid successful responses remain cacheable empty state.
  The bounded suite now passes **117 test files / 402 tests**.
- `runIngest()` now skips persistence for empty, all-invalid, or no-fire ANEPC
  collections. Non-empty all-invalid responses record an explicit error, so
  stale-incident auto-resolution cannot run on corrupted provider input. The
  bounded suite now passes **117 test files / 404 tests**.
- `ptDateToISO()` now accepts complete Portuguese and ArcGIS-style timestamps,
  validates calendar/time ranges, and rejects missing or malformed dates rather
  than substituting the current time. Invalid rows are dropped before
  freshness/confidence scoring. The bounded suite now passes **117 test files /
  407 tests**.
- Lisbon-local timestamps now convert through `Europe/Lisbon` with seasonal
  offsets; future freshness is capped at `1`, incident IDs require non-negative
  integers, and partial provider corruption preserves valid upserts while
  disabling stale-incident cleanup. The bounded suite now passes **117 test
  files / 410 tests**.
- `runIngest()` now reports an explicit schema-drift diagnostic when a
  non-empty, structurally valid ANEPC response normalizes to no fire incident
  types. It still skips persistence, preserving the fail-closed stale-cleanup
  guard. The focused ingest suite passes **10 tests**; the full current count
  is **117 test files / 411 tests**.
- The shared ANEPC adapter now rejects explicitly non-`Point` GeoJSON
  geometries before canonicalizing property coordinates, while preserving the
  existing missing-geometry fallback. An adapter regression covers the
  boundary. Focused shared-boundary coverage passes **41 tests**; the full
  suite remains **117 test files / 411 tests**, with typecheck, lint, capped
  build, diff check, and asset preflight green. The adapter test explicitly
  preserves the missing-geometry property-coordinate fallback.
- Responsive incident-detail ownership is now viewport-gated at the `xl`
  breakpoint: the mobile `BottomSheet` owns detail below `xl`, while the
  desktop `RightSidebar` mounts only at `xl+`. The hydration-neutral
  `useIsWideDesktop()` hook prevents hidden overlay/focus effects and duplicate
  timeline/news detail instances; the browser request-count proof now passes.
- `tests/e2e/incident-ownership.test.ts` passes against a fresh Lumes dev
  server: one mounted detail surface and one timeline/news request at 390px
  and 1280px. The temporary server was stopped after the gate.
- A fresh Lumes dev server now resolves the stale/missing `.env` SQLite path to
  the project `db/custom.db`; `/api/stats` and an incident timeline returned
  HTTP 200, and the ownership browser gate passed at both viewports. The
  temporary server was stopped after verification.
- The desktop axe contrast failures in the source-health warning notice are
  fixed by replacing the conflicting `text-secondary` utility with an
  explicit type-size token while retaining the warning color. The full
  24-context axe matrix (six viewports × four routes) now passes with **0
  violations**; the temporary server was stopped after verification. A
  focused warning-notice contract, typecheck, lint, and the bounded
  single-worker suite pass at **100 test files / 307 tests**.
- The remaining `text-secondary` usages now use the explicit
  `--type-secondary` size token, avoiding Tailwind's secondary foreground
  collision while preserving the approved 12px scale. The mobile trust/error
  notice is mounted inside the active Incidents sheet. A focused Playwright
  flow now proves the real 390px pull gesture waits for both incident and
  dashboard responses, exposes a localized failure, and exercises timeline
  loading, retry, and recovery; it passes against a fresh local server.
- Incident timeline loading, heading, event-count, empty, retry, and
  source-breakdown copy now comes from the shared PT/EN catalog; the focused
  timeline contract and browser recovery proof remain green.
- The optional aerial route now catches merge/cache failures, logs only a
  redacted error name, and returns a typed `502`/`no-store` retryable envelope
  instead of allowing a provider rejection to escape. The focused aerial
  contract and the bounded single-worker suite pass at **100 test files / 308
  tests**.
- The lazy biomass-grid route now applies the same fail-closed boundary for
  synthetic-grid/cache failures, returning an empty FeatureCollection with a
  redacted `502`/`no-store` retryable envelope. The focused grid contract and
  full bounded suite now pass at **101 test files / 309 tests**.
- The curated news route now catches unexpected aggregation/cache failures,
  preserves the official source directory, and returns a redacted
  `502`/`no-store` retryable envelope. The focused news failure contract and
  bounded suite now pass at **102 test files / 310 tests**.
- The source-health aggregation now catches unexpected cache/probe failures and
  returns a redacted `502`/`no-store` core retryable envelope instead of HTML.
  Healthy fallback provenance remains green; the bounded suite now passes
  **102 test files / 311 tests**.
- The health liveness route now catches cache failures and returns a redacted
  `503`/`no-store` degraded response with an explicit cache check. The bounded
  suite now passes **102 test files / 312 tests**.
- The fire-stations optional layer now catches unexpected cache/serialization
  failures while retaining its curated fallback for provider outages. Its
  healthy/fallback/failure contracts are green; the bounded suite now passes
  **103 test files / 313 tests**.
- The six-viewport responsive interaction matrix was rerun against a correctly
  materialized standalone runtime after copying `.next/static` and `public`
  beside the nested `Lumes/server.js` entry. All six viewports pass, including
  reduced-motion, mobile sheet ownership, report failure/focus return,
  notification drawer focus/escape/focus return, marker Inspector focus return,
  drawer/chrome geometry, and desktop map readiness. The shared drawer/dialog
  primitives now focus synchronously before their animation-frame fallback so
  visible overlays cannot briefly leave focus on the opener.
- The NASA FIRMS satellite route now has a complete local provider-state
  contract: configured CSV parsing with malformed-row skipping, redacted
  non-OK/timeout/cache failures, and the no-store rate-limit envelope. The
  route now publishes a typed healthy/empty `dataState` on successful payloads;
  the focused six-test matrix, typecheck, lint, diff check, and bounded suite
  pass at **103 test files / 319 tests**.
- The curated news route now preserves structured municipality matches when an
  incident display label is longer than the municipality name, and its local
  matrix covers fire-keyword filtering, matched-place output, partial RSS
  failure, malformed/non-OK internal incidents, and the redacted cache-failure
  boundary. Focused news contracts, typecheck, lint, diff check, full bounded
  suite, and a post-change production build pass (**103 test files / 322
  tests**).
- The dashboard matrix now covers malformed live payload fallback, explicit
  empty state when both live and stored sources are empty, optional persistence
  count failure without poisoning the core 200 response, and an outer cache
  failure with a redacted no-store retryable envelope. The focused dashboard
  contracts, typecheck, lint, diff check, bounded suite, and post-change
  production build pass (**104 test files / 326 tests**).
- History and incident-timeline routes now have explicit persistence-state
  coverage for redacted non-cacheable failures, nullable history fields, and
  non-empty snapshot date serialization. Timeline success responses also have
  an explicit short public cache policy while failures remain non-cacheable.
  The focused route contracts and bounded suite pass (**104 test files / 331
  tests**).
- The aerial route now preserves non-empty aircraft features when one ADS-B
  provider reports an error and surfaces that partial-source reason alongside
  a healthy response. The focused aerial contract and bounded suite pass
  (**104 test files / 329 tests**); no provider behavior changed.
- Aerial partial-provider state now reaches the existing advanced-layer UI:
  partial source counts, empty/loading/error labels, and a localized warning
  are visible without disabling recovery. The typed status helper and UI
  wiring contracts pass, and the six-viewport responsive matrix is green
  against a correctly materialized standalone runtime.
- `tests/e2e/aerial-layer-state.test.ts` now browser-verifies the desktop
  Advanced → Aerial path with mocked provider responses: a 502 produces the
  localized optional-source warning and unavailable sublabel, toggling off/on
  clears the stale warning, and a healthy response restores the aircraft
  count. The focused flow passes against a fresh standalone runtime and is
  included in CI as `bun run test:e2e:aerial`.
- The optional composite-risk overlay now has a typed response normalizer,
  10-second abort-bounded fetches, explicit loading/empty/error surfaces, and
  fail-closed GeoJSON source updates below incident symbols. Route, normalizer,
  UI-contract, and rebuilt-standalone browser tests pass; the bounded suite is
  now **109 test files / 343 tests**. `bun run test:e2e:risk` is included in CI.
- The optional biomass overlay now has typed GeoJSON normalization, 10-second
  abort-bounded requests, explicit loading/empty/error surfaces, and
  fail-closed source updates below incident symbols. Route, normalizer,
  UI-contract, and rebuilt-standalone browser tests pass; the bounded suite is
  now **111 test files / 347 tests**. `bun run test:e2e:biomass` is included in
  CI, and the source remains explicitly synthetic.
- The optional aerial overlay now has a typed GeoJSON normalizer that rejects
  malformed coordinates/altitudes and preserves only safe feature properties.
  Its client request is abort-bounded, guarded against duplicate in-flight
  loads, clears stale map data on error/empty/invalid responses, and updates
  existing sources through the typed fail-closed helper. Focused aerial
  contracts, typecheck, lint, and the bounded single-worker suite pass at
  **112 test files / 350 tests**; no aerial provider behavior changed.
- The public follow `DELETE` route now applies the same 30-request/minute
  per-IP limiter as `POST` before returning its fail-closed unavailable state.
  The regression contract preserves CSRF rejection, `429`/`Retry-After`, and
  the redacted `no-store` envelope; focused public-action/API contracts,
  typecheck, lint, capped build, and the bounded suite pass at **112 test
  files / 351 tests**.
- The regional API matrix now covers healthy populated results, the explicit
  `resolved=1` filter, and blank-name rejection in addition to empty and
  persistence-failure states. The bounded suite now passes **112 test files /
  354 tests**; wire dates are asserted as ISO strings at the route boundary.
- The core IPMA fire-risk boundary now drops malformed or out-of-mainland
  records instead of coercing them to `0,0`, requires integer RCM values in
  `0..5`, classifies all-invalid payloads as cacheable empty state, and keeps
  valid mixed rows. The map adapter repeats the Portugal/finite-coordinate
  guard before publishing GeoJSON. Focused route/adapter tests, typecheck,
  lint, capped build, and the bounded suite pass at **112 test files / 360
  tests**.
- The shared CSRF helper now returns the same redacted invalid-request shape as
  the other public API boundaries: `403`, `dataState.empty`, and
  `Cache-Control: no-store`. Direct helper coverage plus alerts/follow caller
  contracts pass; the bounded suite now passes **113 test files / 362 tests**.
- IPMA weather station geometry is now atomic: a station contributes
  `stationLat` and `stationLon` only when both coordinates are finite and
  mainland-Portugal bounded; malformed station metadata no longer creates a
  partial nearest-station candidate, while weather metrics remain usable.
  Focused weather/context tests, typecheck, lint, capped build, and the
  bounded suite pass at **113 test files / 362 tests**.
- The SSE realtime route now performs its first incident poll immediately after
  sending `connected`, then retains the 30-second interval and abort cleanup.
  The transport contract proves heartbeat and new-incident delivery without
  weakening rate limits or stream headers; the bounded suite now passes **113
  test files / 363 tests**.
- The Overpass fire-station parser now rejects finite-but-out-of-envelope nodes
  (including `0,0`) against the existing mainland query bounds before publishing
  provider data, while leaving the curated island-inclusive fallback untouched.
  Focused healthy/fallback/failure contracts, typecheck, lint, capped build, and
  the bounded suite pass at **113 test files / 364 tests**.
- The shared ANEPC adapter now rejects finite-but-out-of-Portugal coordinates
  while preserving mainland, Madeira, and Azores geometry. The core incidents
  route and ingest path therefore cannot publish `0,0` or other foreign points;
  focused ANEPC/data-route contracts, typecheck, lint, capped build, and the
  bounded suite pass at **113 test files / 364 tests**.
- Regional-command geometry now fails closed when ArcGIS returns malformed
  coordinate leaves instead of coercing them to zero. Compact metadata remains
  available, valid opt-in geometry is preserved, and focused regional-command
  contracts, typecheck, lint, capped build, and the bounded suite pass at
  **113 test files / 365 tests**.
- NASA FIRMS requests now use a corrected western Portugal bound (`-9.5`, so
  Lisbon is included) and discard finite detections outside the requested
  envelope before publishing satellite GeoJSON. The configured/malformed,
  failure, timeout, cache, and rate-limit contracts remain green; the bounded
  suite stays at **113 test files / 365 tests**.
- The ADS-B merge now clips radius-provider and OpenSky results to the caller's
  bbox before deduplication and GeoJSON publication, so aircraft returned from
  the larger point-query radius cannot leak outside the requested map window.
  The focused merge/route contracts, typecheck, lint, capped build, and
  bounded suite pass at **114 test files / 366 tests**.
- FIRMS coordinate parsing now uses strict finite-number conversion, rejecting
  partial strings such as `38.72foo` before the existing Portugal-envelope
  check. Valid detections and all configured/failure/rate-limit behavior remain
  covered; the bounded suite remains **114 test files / 366 tests**.
- The core response matrix now explicitly covers malformed-success ANEPC data
  as cacheable empty state and redacted/no-store IPMA weather failures. The
  focused data-route matrix, typecheck, lint, capped build, and bounded suite
  pass at **114 test files / 368 tests**.
- The biomass-grid route now has explicit healthy-empty and populated-cell
  serialization coverage in addition to its redacted loader-failure contract.
  The focused grid contract and bounded suite pass (**104 test files / 331
  tests**); the source remains clearly labeled synthetic and no provider was
  wired.
- Incident-timeline success responses now use an explicit public
  `s-maxage=60, stale-while-revalidate=300` policy for both empty and populated
  snapshots; retryable persistence failures remain `no-store`. The focused
  timeline contract covers both success cache headers and the redacted failure
  boundary. `dataState.sourceUpdatedAt` now reflects the newest persisted
  snapshot timestamp rather than the response time.
- After this cache-policy change, the bounded full suite remains green at
  **106 test files / 336 tests**; `bun run typecheck`, `bun run lint`,
  `git diff --check`, and `NODE_OPTIONS=--max-old-space-size=2048
  NEXT_TELEMETRY_DISABLED=1 CI=1 bun run build` also pass. The build emitted
  only Next.js's existing multiple-lockfile root warning and left no temporary
  Lumes/test/build process running.
- The latest local tree also passes `NEXT_TELEMETRY_DISABLED=1 CI=1 bun run
  build` after the timeline/localization and typography changes. Next.js
  compiled the current route set and flattened the standalone server; no
  temporary Lumes build/server process remained afterward. This does not
  constitute a production deploy or restart.
- A follow-up production build after the `/api/aerial` failure-boundary change
  also passed; the generated route set includes the hardened aerial endpoint.
- The production build was rerun after the biomass-grid and curated-news
  failure boundaries as well; compilation, route generation, and standalone
  flattening all passed.
- The production build was rerun once more after the source-health boundary;
  compilation, route generation, and standalone flattening passed again.
- The production build was rerun after the health-cache boundary as well and
  passed compilation, route generation, and standalone flattening.
- The production build was rerun after the fire-stations boundary and passed
  compilation, route generation, and standalone flattening.
- The local release contract is also green: `bash
  deploy/preflight-assets.sh . filesystem` passes, and
  `tests/lib/deploy-contract.test.ts` passes all **13 tests**. Git-mode
  preflight is intentionally not claimed because this checkout contains
  unrelated dirty work; production mutation remains separately authorized.
- The read-only production verifier currently passes `/api/health`,
  `/api/source-health`, and `/sw.js`, but reports three deployment failures:
  the root HTML still has stale `s-maxage=31536000` caching, and
  `/manifest.json` returns an HTML 404 instead of the expected manifest asset.
  The local `public/manifest.json` is tracked, passes filesystem preflight, and
  is copied by `deploy/deploy.sh`; production still needs an authorized deploy
  and fresh-browser verification. No production deploy or service restart has
  been performed.
- A fresh read-only HTTPS verifier rerun confirms all hashed CSS/JS assets,
  `/sw.js`, and `/api/health` are reachable. `/api/source-health` currently
  reports `stale` because ingest freshness is outside its five-minute window.
  The same three release failures remain: stale root caching and the missing
  production manifest (HTTP 404 plus HTML content type).
- Fresh read-only verification on 2026-07-12 confirms the same release
  boundary: `https://lumes.pt/` is HTTP 200 with `s-maxage=31536000`,
  `/manifest.json` is HTTP 404/HTML, while hashed assets, `/sw.js`,
  `/api/health` (`ok`), and `/api/source-health` (HTTP 200, seven sources,
  `stale`) remain reachable. No production mutation was performed.
- A further read-only verifier rerun after the current local build confirms
  the same three release failures: stale root HTML caching and missing/HTML
  `/manifest.json`; all hashed assets, `/sw.js`, `/api/health` (`ok`), and
  `/api/source-health` (seven sources, `stale`) remain reachable. No deploy,
  restart, or scheduled-ingest mutation was performed.
- A disposable standalone runtime was materialized with the same nested-server
  asset-copy contract as `deploy/deploy.sh`. Local `/` returned `200` with
  `no-store`, `/manifest.json` returned `200` JSON, and `/sw.js` returned `200`
  JavaScript, all with control-asset cache protection. `/api/source-health`
  returned `200`; the local `/api/health` `503` was the expected stale-fixture
  state. The runtime was stopped; this confirms the remaining production
  manifest/cache failures are undeployed external state.
- `bun run test:e2e:status-fixtures:start` now passes the fixture-backed
  `/status` matrix: healthy, degraded, empty-source, upstream-fallback,
  malformed-success, and invalid-source-field states across both themes and
  320/390px viewports (28 combinations). It reuses `next start` against the
  current build and shuts down its temporary upstream/Next/browser processes
  cleanly.
- Incident list, notification, map-marker, and long-press detail selection now
  share the typed `decideIncidentSelection()` boundary where live-set
  semantics apply; the remaining page orchestration debt is broader
  action/state wiring, not duplicated selection semantics.
- Source-health DTO normalization and headline-trust state conversion now live
  in `src/lib/source-health-adapter.ts`, keeping that boundary out of the main
  page while preserving core-versus-optional precedence.
- `HistoryModal` is now an isolated component with its search behavior in
  `src/lib/history-view.ts`; historical selection intentionally remains able
  to target records outside the current live incident set.
- `ReportFireModal` is now isolated under `src/components/reports/`; its
  geolocation, pending, success, and failure behavior remains covered by the
  existing public-action contracts and full unit suite.
- Pure incident/satellite/community/evacuation GeoJSON construction now lives
  in `src/lib/map/geojson-builders.ts`; MapLibre lifecycle and style ownership
  remain in `src/components/ember-map.tsx`.
- Pure map style policy now lives in `src/lib/map/map-style.ts`: CARTO style
  selection, EOX satellite identifiers, source colors, and per-theme water
  colors are tested independently while `ember-map.tsx` keeps the single
  MapLibre lifecycle and style-load restoration boundary.
- The focused map continuation gate passes **4 files / 8 tests**; typecheck,
  lint, and `git diff --check` pass. No build, browser, deploy, or service
  restart was started in this low-memory slice.
- Live weather/risk enrichment now lives in the typed, tested
  `src/lib/incident-context.ts` module; `page.tsx` only composes the selected
  incident detail surfaces. The focused context suite passes 3 tests.
- Dashboard server-summary/client-fallback aggregation now lives in the pure,
  typed `src/lib/dashboard-metrics.ts` module; the page retains only the
  memoized orchestration boundary. Its focused suite passes 3 tests.
- IPMA sidebar weather aggregation now lives in the pure, typed
  `src/lib/weather-summary.ts` module; incomplete observations are filtered
  before averaging and the page retains only its memoized call.
- Localized relative-time formatting is now shared by the page and incident
  detail panel through the tested `src/lib/relative-time.ts` module, with an
  injectable clock for deterministic threshold tests.
- Removed stale, unused page-local date/label/icon helpers left behind by the
  component extractions; the page now retains only live helper callsites.
- Incident query filters now persist through the locale-independent URL codec
  and guarded hook; hydration is atomic, browser back/forward is supported,
  and unrelated share-link parameters are preserved.
- The right-rail Explore header now includes the tested, desktop-only
  `MapStatusSummary`, with post-playback/post-filter severity counts, PT/EN
  copy, active-filter context, and an explicit no-match state. Mobile keeps
  the existing attribution and legend surfaces.
- The per-incident Open Graph route now has a focused 1200×630 PNG contract
  for healthy, missing, and persistence-failure records; full endpoint and
  browser-rendering coverage remains a separate gate.
- Active-filter chip localization now lives in the pure, tested
  `src/lib/active-filter-labels.ts` adapter. `page.tsx` still owns query state,
  filter construction, and clear callbacks; the adapter only provides the
  PT/EN presentation label, including deterministic severity ordering,
  trimmed search text, and safe empty/unknown fallbacks.
- The regional-command ArcGIS boundary now uses an 8-second request timeout
  and returns a redacted `502`/`no-store` retryable envelope instead of
  allowing upstream failures to escape as framework HTML. Its contract suite
  covers healthy compact/geometry responses, network and non-OK failures, and
  malformed successful payloads (4 tests).
- The `/api/health` contract now covers an empty reachable database, stale
  non-empty data, and persistence failure. All three paths preserve the
  `no-store` liveness response and distinguish `healthy` from `stale` state.
- Direct ANEPC/IPMA browser-source fetches in incidents, weather, fire-risk,
  and weather-warnings now carry explicit abort timeouts. The timeout contract
  and existing redacted failure paths pass without changing their cache or
  fallback semantics.
- MapLibre GeoJSON updates now pass through the typed, fail-closed
  `src/lib/map/map-source.ts` helper. The wrapper no longer casts missing or
  replaced sources directly to `GeoJSONSource`; style restoration can safely
  replay data later. The map-source contract covers update, missing-source,
  wrong-type, and missing-method states.
- The Phase 2 3D provider gate now keeps OpenFreeMap rejected and records a
  self-hosted Protomaps Portugal extract as the preferred research candidate.
  It is not approved or wired into the app: coverage, height completeness,
  attribution, storage/CORS operations, and mobile performance still need a
  separate spike.
- The follow-up Protomaps extraction/operations audit keeps the candidate
  gated: no Portugal-specific archive or coverage/height guarantee was found.
  The next spike is pinned archive extraction, decoded z14–z16 coverage/height
  measurements, desktop/mobile performance, and ODbL/OSM/Protomaps plus
  Range/CORS/ETag/rollback operations review. No PMTiles dependency or
  building layer was added.
- The bounded PMTiles spike now pins the 2026-07-12 archive and published
  BLAKE3 hash, and decodes disposable z14–z15 extracts for Lisbon, Porto,
  Monchique, and a rural window. Positive-height building/part coverage is
  25.36%, 14.98%, 1.65%, and 6.19%; `min_height` is absent in the Monchique
  and rural samples. This supports technical feasibility but not authoritative
  rural 3D context. CLI range-extraction observations were 15.0 s, 2.3 s,
  2.6 s, and 2.3 s respectively; these are not browser/GPU benchmarks, so
  Phase 2 remains gated and Phase 1 remains camera-only.
- Follow persistence orchestration is now hook-owned in
  `src/lib/use-followed-incidents.ts`: the hook owns browser-local storage,
  pending IDs, synchronous duplicate protection, latest-set reconciliation,
  rollback, and an applied/ignored result. `page.tsx` retains loading and
  unavailable preflight plus all localized toasts. The focused follow/i18n/
  responsive/3D UI gate passes 4 files / 9 tests; the full single-worker suite
  passes **118 test files / 413 tests** after the concurrency hardening.
- The follow guard now crosses a microtask before persistence so same-task
  duplicate invocations cannot clear the synchronous ref before the second
  call observes it. A latest-set ref prevents overlapping different-ID toggles
  from calculating against a stale render closure. No server follow ownership
  or API mutation behavior was introduced.
- `tests/e2e/follow-state.test.ts` now runs against a fresh local server and
  verifies follow persistence across reload, same-task duplicate clicks with a
  single applied transition/toast, and localized rollback when
  `localStorage.setItem` fails. The new `test:e2e:follow` script passed all
  three scenarios and is now included in the CI browser gate; the temporary
  server was stopped afterward.
- Notification state is now isolated in `src/lib/use-notifications.ts`; the
  page retains only the hook result and existing drawer/navigation callbacks.
  `markNotificationsRead()` is immutable and covered by a focused contract.
  The full single-worker suite passes **119 test files / 414 tests** and the
  capped production build passes.
- Refresh completion/error classification is now isolated in the pure
  `src/lib/refresh-state.ts` helper. `page.tsx` still owns the refetch call,
  refs, and localized toasts, while the helper prevents stale timestamps from
  resolving an in-flight refresh. Manual and awaitable refetch callbacks now
  clear stale error/loading state before scheduling the next generation, and
  the `previousRefetchedAt` identity guard prevents an unchanged `Date` object
  from resolving a retry. Focused refresh/mobile contracts and the full
  single-worker suite pass **120 test files / 419 tests**; the mobile refresh
  retry flow passes in a fresh local browser session, and lint, typecheck, and
  the capped production build pass.
- Keyboard shortcut routing and shortcuts-dialog focus lifecycle now live in
  `src/lib/keyboard-shortcuts.ts` and `src/lib/use-keyboard-shortcuts.ts`.
  The page injects refresh, follow, locate, overlay, and incident-focus actions;
  the hook retains input/select/contenteditable guards, Escape ordering, focus
  trapping, and opener restoration. The shared focus trap handles the dialog
  container Shift+Tab entry case, and latest-action refs keep the global
  listener mounted across page renders. Pure routing, ownership contracts, and
  a fresh browser flow for `?`, Escape, and `/` pass; the full single-worker
  suite passes **122 test files / 425 tests**, with lint, typecheck, and capped
  build green.
- Live fallback-status transition classification now lives in the pure typed
  `src/lib/live-status.ts` helper. `page.tsx` still owns the ref and localized
  toast side effects, so entering fallback, repeated fallback, recovery with
  live incidents, and recovery without incidents preserve their previous
  semantics. The focused transition contract passes 4 tests; the full
  single-worker suite now passes **123 test files / 429 tests**, with lint,
  typecheck, and the capped production build green. A reviewer approved the
  extraction with no changes requested.
- The `next-themes` string boundary for `MapScene` now uses the tested
  `normalizeMapTheme()` helper from `src/lib/map/map-style.ts` instead of an
  inline cast. Only `"light"` maps to light; `"dark"`, `"system"`, unknown
  values, and the pre-mount `undefined` path remain dark, matching the prior
  runtime behavior. The focused map-style/map-scene gate passes 3 files / 10
  tests; the full suite passes **123 test files / 430 tests**, and lint,
  typecheck, and the capped production build pass. A reviewer approved the
  boundary with no changes requested.
- The redundant `toggleFollow` forwarding function is removed from
  `src/app/page.tsx`; Inspector and long-press follow/alert actions now call
  the page-owned `handleToggleFollow` directly. Existing persistence,
  pending, rollback, and toast ownership remain unchanged. The source
  ownership contract and fresh-browser follow flow pass; the full suite passes
  **123 test files / 431 tests**, with lint, typecheck, and the capped
  production build green. Independent review found no issues.
- Filter reset ownership is now explicit: the dead page-level reset adapter
  is gone, and `FiltersPanel` receives phase/resource setters so its “clear
  all” action clears every query filter represented by the active chips. The
  panel also treats phase/resource filters as active for its reset affordance.
  The focused filter contracts pass 2 files / 11 tests; all six responsive
  browser viewports pass; the full suite passes **123 test files / 433 tests**;
  lint, typecheck, and the capped production build pass.
- `tests/e2e/follow-state.test.ts` now runs against a fresh local server and
  verifies follow persistence across reload, same-task duplicate clicks with a
  single applied transition/toast, and localized rollback when
  `localStorage.setItem` fails. The new `test:e2e:follow` script passed all
  three scenarios and is now included in the CI browser gate; the temporary
  server was stopped afterward.
- Visible incident selection now delegates its three playback/live branches to
  the pure, tested `src/lib/visible-incidents.ts` boundary. The page still
  supplies live/sample data and playback frames, preserving fallback semantics;
  the helper adds an injectable clock and first-on-tie frame coverage.
- Every current `src/app/api/**/route.ts`/`route.tsx` entry point is now
  represented by at least one contract-test import; remaining API work is
  deeper state/provider integration coverage rather than an untested route
  entry point.
- Source-health presentation now crosses the tested
  `src/lib/source-health-presentation.ts` view-model boundary. Core trust
  precedence, live fallback/stale overrides, reason ordering, and optional
  layer warnings remain unchanged; DTO normalization stays in the existing
  source-health adapter.
- The `/api/risk-fwi/[day]` contract now covers valid healthy forecasts and
  redacted upstream failures in addition to invalid-day handling.
- The public `/status` loader now normalizes successful JSON envelopes instead
  of trusting unchecked casts. Malformed 200 responses degrade safely, non-OK
  and thrown fetches retain their existing fallbacks, and disabled source rows
  preserve nullable latency in the UI (`—` rather than `0 ms`).
- The bounded full unit refresh now passes **100 test files / 307 tests**;
  expected Prisma fallback and redacted error-path logs remain the only
  stderr output.
- The current local production build (`NODE_OPTIONS=--max-old-space-size=3072
  bun run build`) passes, and the focused status suite passes **3 files / 19
  tests**. The local fixture browser matrix is green; production HTTPS/cache,
  scheduled-ingest, and post-restart browser evidence remain authorization-gated.
- Read-only production probe (2026-07-12, after the local build) confirms all
  hashed CSS/JS assets, `/sw.js`, `/api/health`, and `/api/source-health` are
  reachable. The deployed root still returns `s-maxage=31536000` instead of
  `no-store`, and `/manifest.json` remains an HTML 404; source-health is
  `stale` because the five-minute ingest freshness window has expired.
- The local deploy-payload preflight now finds the manifest/logo, service
  worker, offline, robots, and security assets in the tracked index. The five
  previously untracked public assets were committed separately; no unrelated
  worktree changes were staged or committed.
- Commit `fd3b4670b` now records the two control assets with mode `0644`.
  Commit `a6ce8a1a2` records offline, robots, and security metadata with mode
  `0644`. Commit `3ae04413e` records the executable preflight and deploy
  contract; `da21c09c3` keeps the manifest network-owned in the service worker.
  The disposable standalone smoke copied the current nested runtime layout,
  resolved the symlinked server directory, and served `/`, `/manifest.json`,
  `/logo.svg`, `/sw.js`, `/offline.html`, `/robots.txt`, and
  `/.well-known/security.txt` with HTTP 200 before cleaning up its temp process.

This document is the **5-minute briefing** for whoever picks up
lumes.pt next. It tells you:

1. What the project is
2. What's done
3. What's pending
4. Where the landmines are

For deeper detail, follow the links.

---

## 1. What is lumes.pt?

A **real-time wildfire intelligence dashboard for Portugal** built
on Next.js 16 + Bun + SQLite. It pulls fire incidents from ANEPC-adjacent
sources, joins them with municipal data, shows them on a MapLibre map,
and surfaces fire-related press that matches each incident's location.

The user is a Portuguese wildfire intel operator (or a citizen tracking
local fires). The product opens to a situation rail + map on wide desktop,
and map-first drawers on compact screens:

- **Left**: focused situation summary with trust, count, and priority incidents
- **Center**: live fire map
- **Right (rail)**: collapsible filters / incident detail / news

Compact screens are map-first: phones use Map / Incidents / Alerts / More,
while tablets use a compact top toolbar and contextual drawers.

---

## 2. What's done

| Area | State | Notes |
| ------ | ------- | ------- |
| Live fire map (MapLibre + custom fire markers) | ✅ | 30–40 active incidents typical |
| 6 map layers (Fire Risk, Fire Stations, NASA FIRMS, Aerial, Biomass, Composite) | ✅ | Toggles work, render in MapLibre |
| FlightRadar-style aerial layer | ✅ | Real ADS-B with rotating plane icons |
| Right rail + collapsible filter/detail/news panel | ✅ | Saves ~50% map width |
| Compact navigation and responsive drawers | ✅ | Responsive matrix verified at six target viewports |
| News (fire-filtered RSS) | ✅ | Strict fire-keyword filter, 5 PT outlets |
| Matched news in detail panel | ✅ | Shows press articles mentioning incident's location |
| 3-day fire-risk forecast | ✅ | From IPMA RCM |
| Active filter chips + clear-all | ✅ | New `FilterStatus` component |
| i18n (PT primary, EN opt-in) | ✅ | 280+ keys in `src/lib/i18n.ts` |
| Phosphor icon set (anti-AI) | ✅ | Replaces Lucide |
| IBM Plex Sans/Mono + Fraunces brand font | ✅ | UI/data typography contract; Fraunces is brand-only |
| Warm parchment + burnt sienna palette | ✅ | Per-theme |
| Map ocean colors (dark blue / light blue / satellite) | ✅ | Per-theme |
| Custom map icons (plane.svg for FlightRadar style) | ✅ | |
| CSRF protection on POSTs | ✅ | `src/lib/api/csrf.ts` |
| Zod validation on POSTs | ✅ | `src/lib/api/schemas.ts` |
| Rate limiting | ✅ | `src/lib/api/rate-limit.ts` |
| Cron: 60s ingest, daily prune | ✅ | Systemd timers |
| PWA + service worker | ✅ | `public/sw.js` |
| Error boundary + global error pages | ✅ | |
| A11y automated tests (axe-core) | ✅ | 0 violations across home and public routes |
| Unit tests | ✅ | 149 files / 727 tests passing locally (`bun run test`, serialized with a capped heap) |
| Build + deploy pipeline | ✅ | Authorized standalone deploy, ingest, HTTPS verifier, and fresh-browser release gates verified |
| Documentation | ✅ | `DEPLOY.md`, `ARCHITECTURE.md`, `ERRORS-LOG.md`, `FINDINGS.md` |

---

## 3. What's pending (priority order)

### Current gates and follow-up work

1. **3D provider/building/terrain gate** — Phase 1 camera-only Incident Focus
   is complete and default-off. Existing CARTO building data is recorded as the
   lowest-risk Phase 2 experiment, but written entitlement, coverage,
   style-restoration, mobile-performance, and attribution evidence are still
   required before adding an extrusion layer.

2. **Remaining orchestration debt** — follow persistence and pending state are
   isolated in `useFollowedIncidents`; the duplicated filter and incident-detail
   prop bags now use typed adapters, and the unused right-rail notification prop
   is gone. A follow-up audit found no additional repeated child contract worth
   extracting: the remaining page handlers are single-owner actions, and the
   mobile `map={null}` is intentional because the page-owned MapScene remains
   underneath the mobile chrome. Continue only through typed adapters with
   browser coverage; the legacy data-hook module has been removed.

3. **Interaction proof** — the six-viewport responsive matrix, reduced-motion
   checks, 44px targets, drag/scroll ownership, both-theme data-trust matrix,
   and 24-route axe matrix are locally green. The fixture-backed browser
   matrix for every server-rendered public `/status` state is also green. The
   authorized production HTTPS/cache/restart/fresh-browser proof is now green.

4. **Community attachments** — the provider-neutral design gate is complete;
   storage, moderation, retention, EXIF/privacy, deletion, and provider
   entitlement decisions remain intentionally open before upload UI or public
   media URLs are added. Cloudflare R2 is now recorded as the first technical
   candidate (EU jurisdiction, S3 boundary, presigned operations, lifecycle
   backstop), but DPA/metadata-locality, backup/erasure, moderation ownership,
   account entitlement, and byte-budget decisions still block implementation.

5. **Source-health empty semantics** — the current empty→stale runtime contract
   remains intentionally unchanged. The source-specific decision matrix and
   required test surface are documented in
   [`docs/providers/source-health-empty-state-policy.md`](providers/source-health-empty-state-policy.md);
   it is a policy packet, not runtime approval.

### Medium — quality debt

1. **CI reproducibility** — Bun is pinned to 1.3.4 and CI creates an
   isolated database before browser/Lighthouse gates; keep those checks in
   the same workflow when changing build or data contracts.

2. **SW cache versioning is contract-based** — hashed Next chunks bypass the
   service-worker cache, so ordinary builds do not need a `CACHE_NAME` bump.
   Bump it when the worker's precache/static-cache contract changes and keep
   the deploy checklist and service-worker contract aligned.

3. **Refactor documentation** — keep `REFACTOR-PLAN.md`, `ARCHITECTURE.md`,
   and this handoff synchronized with independently verified local versus
   production state.

### Low — nice-to-have

1. **Notification system** — ✅ the public/browser-local trigger now has
   exact phone/tablet unread badges, localized drawer copy, truthful empty
   state, and a disabled zero-unread mark-all action. Server-backed history
   and provider ownership remain out of scope.
2. **Following** — the tablet/mobile dashboard now has a local-only
   "Following" activity view with a current count and truthful empty state.
   It also has browser-local per-incident read timestamps, an unread badge, and
   mark-seen-on-entry behavior; server-backed notification history remains
   outside this slice.
3. **Community reports** — `/api/reports` exists and the public form is
    reachable from More. The submission acknowledgement and request body now
    have bounded contracts; visual attachments still require an explicit
    storage/retention/security design and provider decision. The provider-neutral
    gate is documented in `docs/providers/community-attachments.md`.
4. **A11y visual review** — ✅ the bounded screenshot/theme/state review is
    complete; automated axe and the reduced-motion responsive checks remain
    the regression gates.

---

## 4. Where the landmines are

These are the spots that will bite you next. Read the linked doc
before touching them.

| Landmine | Doc |
| ---------- | ----- |
| Service worker caching stale chunks after build | `DEPLOY.md` §"The chunks not loading incident" |
| `page.tsx` data-composition ownership | `ARCHITECTURE.md` §"src/app/page.tsx" |
| Typecheck/build gates must remain blocking | `docs/superpowers/plans/2026-07-10-full-frontend-improvement.md` |
| Variable shadowing across component boundaries | `ERRORS-LOG.md` #2, #3 |
| Custom icon wrapper (`phosphor-icons.tsx`) needs every new icon aliased | `ARCHITECTURE.md` |
| Layer toggles require `activeFilterItems` entry to show as dismissable chip | `ARCHITECTURE.md` §"Adding a new map layer" |
| zustand reset actions must be explicit (empty set ≠ default) | `ERRORS-LOG.md` #5 |
| Ocean water color overrides only on `style.load` | `ARCHITECTURE.md` |
| Server = Bun + Next.js standalone; chunks/public assets sit beside the resolved standalone server entry | `DEPLOY.md` |

---

## 5. How to pick this up

1. **Read these in order** (1 hour total):
   - `docs/DEPLOY.md` (15 min) — server, deploy, cache
   - `docs/ARCHITECTURE.md` (20 min) — code structure, data flow, recipes
   - `docs/ERRORS-LOG.md` (15 min) — past bugs, what to watch for
   - `docs/FINDINGS.md` (10 min) — UX/a11y review log
2. **Skim** `docs/REFACTOR-PLAN.md` to see what's been done.
3. **Run locally**:

   ```bash
   cd Lumes
   bun install
   bun run build        # local sanity build
   bun run test         # current baseline: 149 files / 727 tests (single worker)
   bun run lint         # should be clean
   ```

4. **For a deploy**:

   ```bash
   rsync -az --delete --exclude='.git' --exclude='node_modules' \
     --exclude='.next' --exclude='db/*.db' --exclude='*.log' \
     --exclude='tests' Lumes/ lumes@152.53.145.9:/opt/apps/lumes/
   ssh lumes@152.53.145.9
   cd /opt/apps/lumes && bun run build && systemctl --user restart lumes.service
   ```

5. **For a feature**:
   - Add to zustand store + right-rail `RightSidebar`
   - Read "Adding a new map layer" in `ARCHITECTURE.md`
   - Read "Adding a new API route" in `ARCHITECTURE.md`

---

## 6. The 80/20 next steps

If you have one afternoon, do these three things to ship a meaningful
improvement:

1. **Continue shell extraction** only where it reduces orchestration
   without duplicating query or map state. `SituationPanel` and the
   inspector are already separate and covered by focused tests.
2. **What does the map show** — ✅ completed in the right-rail Explore
   header. `MapStatusSummary` derives the post-playback, post-filter visible
   severity counts, localizes the headline and breakdown in PT/EN, exposes an
   explicit no-match state, and leaves `FilterStatus` responsible for clear
   actions. The mobile filters panel keeps the existing map attribution and
   legend surfaces without duplicating the desktop status block.
3. **URL persistence for filters** — ✅ completed through the guarded
   `useIncidentFilterUrl` hook. It hydrates atomically, preserves `incident`
   and unknown query parameters, handles browser back/forward, and debounces
   search writes without introducing App Router loops.

4. **Incident selection ownership** — ✅ completed with list surfaces using
   the no-fly selection handler and map/marker surfaces using the explicit
   map-selection handler. The distinction is covered by source ownership
   counts and the responsive browser matrix; selecting from a list no longer
   requests an unnecessary camera flight.

5. **ANEPC request coalescing** — ✅ completed with a route-local in-flight
   promise. Slow concurrent `/api/incidents` requests now share one upstream
   load, rejected loads release the guard, and the next request can retry;
   the core endpoint no longer relies on a five-second wait shorter than its
   twenty-second upstream timeout.

6. **Realtime client lifecycle** — ✅ completed with an isolated typed client.
   Reconnects are coalesced, constructor failures retry, stale EventSource
   callbacks are ignored, malformed frames are dropped, and disposal closes
   the source and cancels timers.

7. **Source-health probe boundary** — ✅ completed with a typed provider
   envelope normalizer. Malformed 200 responses, non-200 responses, invalid
   counts/states/timestamps, and rejected providers now fail closed; explicit
   stale/disabled/fallback states and provider reasons remain visible, while
   unknown source freshness is not inferred from response time.

8. **IPMA warning payload boundary** — ✅ completed with strict local/zoned ISO
   timestamp validation and a fail-closed top-level payload check. Invalid
   warning rows cannot turn provider schema drift into a misleading empty
   state, while valid mixed rows and true empty arrays retain their public
   response and cache contracts.

9. **Dashboard normalization boundary** — ✅ completed with typed live/DB
   adapters. Unknown severity/status, negative or fractional operational
   counts, invalid timestamps, status mismatches, and declared non-Point
   geometries are rejected; DB outages now remain retryable instead of being
   reported as an empty dashboard.

10. **IPMA observation freshness boundary** — ✅ completed with strict
    observation-bucket timestamp validation. The newest valid bucket is chosen
    by parsed instant, timezone-less IPMA timestamps resolve in
    `Europe/Lisbon` with DST semantics, and source freshness is canonicalized
    to UTC without changing the public observation timestamp. Invalid buckets
    produce a cacheable explicit empty state.

11. **Batch incident-risk result boundary** — ✅ completed with explicit empty
    semantics for unknown or out-of-Portugal-only requests. Mixed valid/invalid
    rows retain usable risk results, per-incident `no_weather` remains finite
    and visible, and same-coordinate Open-Meteo work is coalesced in flight.

12. **Shared client trust boundary** — ✅ completed with strict
    `DataStateMeta` normalization. Unknown states, impossible timestamps, and
    malformed freshness fields now fail closed as retryable/error trust; absent
    metadata remains compatible, valid stale/empty/fallback states are kept,
    client receipt time is not presented as provider freshness, and a failed
    refresh cannot be masked by healthy metadata (retained fallback remains
    explicit).

13. **Client incident payload boundary** — ✅ completed with a focused
    `src/lib/incident-client.ts` normalizer. Successful `/api/incidents`
    payloads now validate required fields, Portugal Point geometry, timestamps,
    enums, nested properties, trust values, and bounded scalars before the
    legacy UI adapter runs. Malformed rows are dropped without poisoning valid
    mixed rows, and all-invalid payloads resolve to the existing empty/fallback
    behavior instead of throwing during page or map rendering.

14. **Service-worker cache correctness** — ✅ completed with branch-level
    runtime coverage. Navigation and static assets now cache only successful
    responses; stale or no-Date static entries are served last-known-good while
    refresh runs through a caught `waitUntil` chain; non-OK uncached static
    responses become deterministic 503 offline responses; old runtime caches
    are removed on activation.

15. **MapLibre style restoration lifecycle** — ✅ completed with a focused
    generation controller. Stale core and satellite `style.load` callbacks
    cannot replay sources, publish readiness, or dispatch restore events for
    an obsolete style; initial-load prop changes reconcile after load;
    transition-start cancellation prevents optional layers from remounting
    during a replacement; satellite tint updates track theme changes. The
    default top-down interaction settings are unchanged.

16. **MapLibre style-load recovery** — ✅ completed with a bounded target/
    fallback runtime. Target style errors/timeouts roll back once to the last
    committed style; stale callbacks and unmounts cannot publish readiness;
    initial style loading has a watchdog; rollback failure is explicit
    `retryable-error`, and successful fallback is marked `recovered`.

17. **Client incident response envelope** — ✅ completed with a strict
    `/api/incidents` transform. Source metadata, totals, distributions,
    optional metrics, nested rows, Portugal coordinates, and trust fields are
    validated before map/detail adaptation. Count/distribution mismatches and
    all-invalid non-empty payloads are retryable; true empty responses remain
    explicit, and synthetic samples are used only when no live response exists.

18. **History client boundary and selection ownership** — ✅ completed with a
    strict `/api/history` transform and bounded modal hook. Rows and envelope
    counts are validated, mixed valid rows survive, true empty is explicit, and
    malformed non-empty payloads become retryable. Modal and mobile recent
    history rows pass validated records to page-owned state and adapt them into
    the existing detail panel; live priority rows remain on the live callback.
    Focused history coverage passes **4 files / 30 tests**; the full suite passes
    **128 files / 573 tests**; lint, typecheck, diff check, and the capped build
    pass. The dashboard/modal share the all-history request, scoped status
    filters remain separate, and the modal exposes history trust state. True
    empty history has dedicated copy and historical detail does not fabricate
    IPMA risk. The isolated Playwright history lifecycle gate passes empty,
    retryable, retry, and selection flows against a local production server.
    No remaining P1/P2 history implementation blocker is known.

19. **MapLibre style event-order browser proof** — ✅ completed with a bounded
    1280×800 reduced-motion gate. A real browser now switches dark→light and
    reverses to dark, waits for the latest style to become ready/recovered,
    and rejects stale retryable/unready outcomes.

20. **Dashboard-local Following view** — ✅ completed for tablet/mobile
    activity. It filters the visible dashboard set against browser-local
    followed IDs, shows a count, and exposes localized empty states. The
    empty state distinguishes no followed IDs from followed incidents hidden
    by active filters and offers an explicit clear-filters action. Browser-local
    read state now shows an unread count for provider updates, establishes a
    baseline on follow, and marks current rows read on entry; it does not alter
    map/query or URL state.

21. **Historical follow affordance guard** — ✅ completed. Historical rows are
    adapted with `isLive: false`; the detail panel now hides the follow badge,
    toggle, and local-alert explanation for those records. Live incidents keep
    the existing browser-local follow behavior. Focused history contracts and
    the isolated history lifecycle browser gate verify the historical control
    is absent.

22. **Incident-news client boundary** — ✅ completed. The detail-panel news
    hook now validates the response envelope and rows before rendering. IDs,
    bounded text, HTTP(S) URLs, timestamps, categories, matched flags, counts,
    and `dataState` metadata are normalized; malformed responses become a
    retryable trust failure instead of reaching the panel as an array-shaped
    assumption. Valid mixed rows remain usable when the declared count matches.

23. **Following read state** — ✅ completed for the public browser-local flow.
    Per-incident provider timestamps are persisted separately from followed
    IDs, unread counts are localized on tablet and phone, following establishes
    a baseline, and entering Following marks visible rows seen. Invalid storage
    fails closed; no server, map-filter, or URL ownership was introduced.

24. **Screenshot-level theme/accessibility review** — ✅ completed for the
    bounded local pass. Desktop and phone dark/light captures were inspected;
    visible interactive controls had accessible names, the report dialog
    received focus and closed on Escape, and reduced-motion captures remained
    usable. The compact map summary’s misleading `incidents` label was fixed
    to `active/ativos` and covered by `tests/lib/map-peek.test.ts`.

25. **News client response boundary** — ✅ completed for the public news
    sidebar. `/api/news` responses now pass through a stable runtime
    normalizer before `NewsSection` consumes them. Required envelope fields,
    ISO timestamps, bounded article text, HTTP(S) source links, safe relative
    incident links, categories, severity values, place arrays, count
    invariants, duplicate IDs, and `dataState` metadata are validated. The
    route’s intentional `counts.press` total (pre-filter RSS pool) remains
    distinct from its filtered/truncated `press` display array. Malformed
    successful payloads fail closed through `useFetch` rather than crashing
    the panel or presenting untrusted rows as healthy.

26. **Weather client response boundary** — ✅ completed for the operational
    weather context. `useWeatherNew()` now validates successful IPMA envelopes
    before weather summaries or incident enrichment consume them. It accepts
    the explicit empty `timestamp: ""` state, preserves provider timestamps
    and `sourceUpdatedAt`, validates station metrics/coordinates/counts, keeps
    valid mixed rows, and fails closed on malformed metadata or all-invalid
    non-empty payloads. Server-side weather fetching and public DTOs are
    unchanged.

27. **Fire-risk client response boundary** — ✅ completed for the IPMA risk
    overlay. `useFireRiskNew()` now validates successful risk envelopes before
    map features or nearest-risk incident context consume them. Counts,
    distribution totals, Portugal coordinates, RCM levels, municipality keys,
    labels, freshness metadata, and cached flags are bounded; empty and mixed
    valid states remain usable, while malformed or duplicate rows fail closed.

28. **Dashboard client response boundary** — ✅ completed for the page-wide
    aggregate. `useDashboardNew()` now validates successful dashboard JSON
    before metrics and priority reconciliation consume it. Summary counters,
    distribution totals, priority rows/coordinates, persistence counters,
    statuses, timestamps, duplicate IDs, and trust metadata are bounded;
    explicit empty/fallback states remain meaningful and malformed successful
    payloads fail closed without changing server fallback behavior.

29. **Fire-stations client response boundary** — ✅ completed for the optional
    OSM layer. `useFireStationsNew()` now validates successful station
    envelopes, including healthy versus curated fallback state, Portugal
    mainland/island coordinates, IDs, counts, bounded metadata, duplicates,
    and freshness. Mixed valid stations remain renderable; malformed success
    payloads fail closed without changing the lazy map toggle.

30. **Continuation verification** — ✅ the capped single-worker full suite now
    passes **136 files / 655 tests** after updating the stale filter-ownership
    contract to cover the Following clear-filters callback. Repository-wide
    ESLint, TypeScript, `git diff --check`, and the capped production build
    pass. The build retains the existing multiple-lockfile workspace-root
    warning; test setup still reports the known Prisma engine fallback. No
    deployment, restart, provider access, or production HTTPS/cache check was
    performed.

These bounded improvements together strengthen map clarity, core-source
coalescing, client lifecycle reliability, and response-envelope trust.
    Production-only checks remain separate and authorization-gated.

31. **Persistence-stats client response boundary** — ✅ `/api/stats` now
    passes through `transformPersistenceStatsResponse()` before the dashboard
    consumes its aggregate. The client boundary validates non-negative bounded
    counters, ISO freshness, counter relationships, and optional `dataState`
    metadata while preserving explicit empty states. Malformed successful
    envelopes fail closed through `useFetch` instead of reaching page metrics.
    The focused stats/client/API/hook gate passes **4 files / 34 tests**;
    targeted lint, TypeScript, and `git diff --check` are green.

32. **Notification trigger parity** — ✅ browser-local notification state now
    reaches phone and tablet Alerts navigation. The page-owned unread count is
    exposed as an exact badge, drawer title/count/footer copy uses the shared
    PT/EN catalog, zero-unread mark-all is disabled, and an empty notification
    collection has an explicit status message. Desktop bell ownership and the
    provider/server boundary are unchanged. Focused notification tests pass;
    phone/tablet responsive browser scenarios pass. The same browser run still
    has an unrelated desktop readiness timeout when no `situation-incident`
    appears within 15 seconds.

33. **Community-report submission boundary** — ✅ the report form now delegates
    POST response parsing to an isolated client module. Successful
    acknowledgements require a bounded report ID, `pending_review` status,
    message, and valid trust metadata; bounded failures remain errors and
    malformed bodies fail closed. No upload storage, retention, or moderation
    ownership was invented. Focused report-client/modal/action tests pass;
    repository-wide verification is recorded in the continuation evidence.

34. **Continuation verification after notification/report slices** — ✅ the
    capped single-worker suite passes **146 files / 702 tests**. Repository
    ESLint, TypeScript, `git diff --check`, and the capped production build
    pass. The six-viewport responsive browser matrix also passes after adding
    a deterministic test-only incident fixture and an explicit healthy-empty
    Situation marker. The build retains the multiple-lockfile workspace
    warning; tests retain the known Prisma engine fallback.

35. **Optional-source client response boundaries** — ✅ the weather-warnings,
    satellite, regional-commands, and source-health hooks now normalize
    successful response envelopes before UI or map consumers use them. Counts,
    timestamps, provenance, geometry, Portugal bounds, duplicates, optional
    data-state metadata, and explicit empty/fallback semantics are checked;
    malformed successful payloads fail closed. Focused client/API/hook gates,
    repository lint, TypeScript, diff validation, the six-viewport responsive
    matrix, and the full capped suite pass.

36. **Deterministic responsive readiness fixture** — ✅ the responsive browser
    matrix installs a scoped `/api/incidents` fixture only for that test
    context, preserving real routes elsewhere. The fixture has strict valid
    Portuguese coordinates, matching counts/distributions, and official trust
    metadata. The healthy empty Situation branch has an explicit test ID;
    desktop and wide-desktop no longer depend on live provider timing.

37. **Incident-timeline client response boundary** — ✅ the persisted timeline
    response is normalized before the detail panel merges snapshots with live
    inline events. Incident identity, counts, timestamps, status/severity,
    bounded resources/area, duplicate IDs, and optional data-state metadata are
    validated; malformed successful payloads enter the existing localized
    retry state, while empty and valid mixed rows remain usable. The focused
    client/route/UI contract gate passes **3 files / 11 tests**, and the mobile
    refresh/timeline browser recovery flow passes.

38. **Newsletter response boundary** — ✅ the public subscription form now uses
    a bounded client module instead of casting arbitrary JSON. Success status,
    bounded errors, and optional data-state metadata are normalized; malformed
    bodies fail closed and redacted non-OK envelopes retain their safe reason.
    The focused client gate passes **4 tests**; targeted lint, TypeScript, and
    diff validation pass.

39. **Aerial data-state consistency** — ✅ the live AerialLayer normalizer now
    validates present `dataState` metadata and rejects cardinality-inconsistent
    200 responses before MapLibre receives them. Missing metadata remains a
    compatibility path; existing partial/empty/error and recovery behavior is
    unchanged. The focused aerial/API gate passes **4 files / 20 tests**.

40. **Latest continuation verification** — ✅ the capped single-worker suite
    passes **148 files / 712 tests**. The earlier repository lint, TypeScript,
    diff, capped build, and six-viewport responsive evidence remain green for
    the preceding slices; the new timeline browser flow also passes. Provider
    access, deployment/restart/HTTPS checks, media storage, and production flag
    enablement remain open and authorization-gated.

41. **Standalone asset materialization** — ✅ the production flatten helper now
    copies Next client assets and `public/` beside the nested standalone
    server. The fresh standalone artifact serves client chunks correctly; the
    public newsletter/status browser gate passes all four 320/390px dark/light
    scenarios. This fixes an artifact-level 404 failure without changing the
    app runtime or provider ownership.

42. **Current verification** — ✅ clean capped suite: **148 files / 712 tests**;
    repository ESLint, TypeScript, `git diff --check`, and capped production
    build pass. Fresh standalone public browser gate passes **4/4** scenarios.
    The build still reports the known multiple-lockfile workspace warning and
    tests retain the known Prisma engine fallback. Deployment/restart,
    production HTTPS/cache, provider access, media storage, and 3D
    provider/building/terrain gates remain open.

43. **Dead aerial hook cleanup** — ✅ removed the unused `useAerialNew()` and
    `AerialClientResponse` wrapper from `src/lib/use-app-data.ts`. AerialLayer
    is the only runtime `/api/aerial` consumer and continues to own bounded
    fetch, normalization, stale-source clearing, and recovery status. The
    focused six-file aerial/data-hook gate passes **17 tests**; TypeScript,
    targeted lint, and diff validation pass.

44. **Read-only production verifier rerun (2026-07-13)** — ⚠ the live site
    still serves hashed CSS/JS, `/sw.js`, `/api/health` (`ok`), and seven
    source-health entries, but the root HTML retains `s-maxage=31536000` and
    `/manifest.json` remains HTTP 404/HTML. No deployment or service restart
    was performed; the local standalone artifact is fixed and passes its
    browser gate, so these failures remain undeployed external state.

45. **Service-worker documentation reconciliation** — ✅ the deploy checklist
    now matches `public/sw.js`: hashed Next chunks bypass the worker and APIs
    remain network-owned, so ordinary builds do not require a cache-name bump.
    A bump is reserved for changes to the worker's own precache/static-cache
    contract; historical incident notes remain historical.

46. **Standalone packaging regression contract** — ✅ `deploy-contract.test.ts`
    now executes `deploy/flatten-standalone.js` against an isolated nested
    standalone fixture. It proves the stable server symlink, `.next/static`,
    and `public/` are materialized, and that a second run remains idempotent.
    The focused deployment contract passes **14 tests**; TypeScript, targeted
    ESLint, and `git diff --check` pass. The serialized full suite now passes
    **148 files / 713 tests**. No deployment or restart was performed.

47. **Dead server-follow client cleanup** — ✅ removed the unused
    `persistFollowChange()` wrapper and its raw JSON cast from
    `src/lib/public-actions.ts`. Browser-local `useFollowedIncidents` remains
    the sole client follow owner; `/api/follow` remains an unchanged,
    fail-closed route. The focused action/route/hook gate passes **3 files / 16
    tests**; TypeScript, targeted ESLint, and `git diff --check` pass. The
    serialized full suite now passes **148 files / 712 tests**.

48. **Post-cleanup production build** — ✅ the capped `bun run build` passes
    after the follow cleanup. Next compiles, typechecks, prerenders all 21
    static pages, and `flatten-standalone.js` recreates the stable server link
    and copies `.next/static` plus `public/`. The multiple-lockfile workspace
    warning remains known; no deployment or restart was performed.

49. **Shared fetch and filter orchestration boundaries** — ✅
    `fetchJsonWithTimeout()` now returns `unknown` without a generic response
    escape hatch; all callers explicitly normalize or narrow the body. The
    duplicated desktop/mobile `FiltersPanel` prop bags in `page.tsx` now use a
    typed `sharedFilters` adapter while preserving separate panel instances and
    desktop-only search ref ownership. Two dead page bindings were removed.
    Focused boundary/UI contracts pass; the full suite passes **148 files / 712
    tests**, repository ESLint, TypeScript, and `git diff --check` pass, the
    capped build passes, and the six-viewport responsive matrix passes. No
    deployment or restart was performed.

50. **Shared incident-detail orchestration boundary** — ✅ the page now builds
    one typed `sharedIncidentDetailProps` adapter from the selected incident,
    enriched context, follow state, source-health state, and optional Incident
    Focus controls. The mobile BottomSheet and desktop RightSidebar still mount
    separate panel instances and override only their layout-specific props
    (`isMobile` versus `hideHeader`). Focused detail/follow contracts pass;
    the full suite passes **148 files / 713 tests**, repository ESLint,
    TypeScript, `git diff --check`, and the capped production build pass, and
    the six-viewport responsive matrix passes. No deployment or restart was
    performed.

51. **Dead page-import cleanup** — ✅ removed legacy imports left behind by
    earlier page/component extraction (`DashStat`, `HeroCounter`, old incident
    ranking/status helpers, unused overlay wrappers, and unused type imports).
    No runtime ownership or UI behavior changed. The full suite passes **148
    files / 713 tests**, repository ESLint, TypeScript, `git diff --check`, and
    the capped production build pass; standalone client/public assets are
    materialized. No deployment or restart was performed.

52. **Right-sidebar dead prop cleanup** — ✅ removed the unused
    `unreadCount` prop from `RightSidebarProps` and its destructuring. Notification
    badges remain owned by the notification surfaces; the rail still owns only
    its active-filter and selected-incident indicators. The focused desktop IA
    and overlay contracts pass; the full suite passes **148 files / 714 tests**,
    repository ESLint, TypeScript, `git diff --check`, and the capped production
    build pass. No deployment or restart was performed.

53. **Community-report request-body hardening** — ✅ added a streaming 16 KiB
    request-body limit to `POST /api/reports`, with an early `Content-Length`
    rejection and a chunked-body guard before JSON parsing or persistence.
    Oversized requests return redacted `413`/`no-store` envelopes and never
    reach Prisma. Focused public-action/API contracts pass; the full suite
    passes **148 files / 716 tests**, repository ESLint, TypeScript,
    `git diff --check`, and the capped production build pass. Visual attachment
    storage remains intentionally unimplemented pending provider, moderation,
    retention, and privacy decisions. No deployment or restart was performed.

54. **Community-attachment design gate** — ✅ documented the provider-neutral
    attachment interface, image-only Phase 1 limits, one-time upload intent,
    quarantine/moderation flow, EXIF/privacy requirements, retention/deletion
    obligations, and provider decision matrix in
    `docs/providers/community-attachments.md`. No upload UI, provider SDK,
    database migration, or public media URL was added.

55. **3D provider gate re-audit** — ✅ rechecked the Phase 2 OpenFreeMap/
    Protomaps evidence against the current MapLibre wrapper. No provider has
    passed the legal, coverage, operations, attribution, and mobile-performance
    gates; the bounded PMTiles samples are research evidence, not browser/GPU
    proof. Phase 1 remains camera-only, feature-flagged, default-off, and the
    2D operational map remains authoritative. No building source, PMTiles
    dependency, storage bucket, registry, or style switch was added.

56. **Documentation reconciliation** — ✅ refreshed the current handoff
    counts to **148 files / 716 tests**, corrected the `src/` architecture tree
    and typed data-flow description, labeled deployment notes as historical
    until the authorized HTTPS verifier is rerun, and marked the original UX
    findings as a historical review log. No runtime behavior or production
    state changed.

57. **Current full local quality gate** — ✅ the serialized suite passes
    **148 files / 716 tests**; repository ESLint, TypeScript, `git diff --check`,
    and the capped production build pass. The build still reports the known
    multiple-lockfile workspace-root warning, and test setup still reports the
    known Prisma engine fallback. No deployment, restart, or production HTTPS
    verification was performed; the process tree is clean after the gate.

58. **Loopback standalone release verifier** — ✅ a fresh standalone artifact
    was served from `127.0.0.1` with an isolated port and local database. The
    verifier found HTTP 200 HTML, immutable hashed assets, a valid
    `manifest.json` and `sw.js` with `no-store`, `/api/health`=`ok`, and nine
    source-health entries with an explicit `stale` state. The temporary server
    was shut down cleanly. This proves local packaging only; it does not replace
    the authorized production HTTPS/restart/fresh-browser gate.

59. **Fresh standalone browser smoke** — ✅ against the same local artifact,
    the security-header/MapLibre startup flow passed, the public newsletter and
    status matrix passed in dark/light at 320×568 and 390×844, and the default-
    off Incident Focus flow confirmed that no 3D controls leak into the 2D map.
    Playwright/browser and temporary server processes cleaned up; production
    HTTPS and production feature-enabled 3D verification remain separately
    gated; Phase 2 provider/building/terrain proof is still open.

60. **Full standalone browser coverage** — ✅ a fresh standalone server passed
    accessibility across 24 route/viewport combinations with **0 violations**,
    aerial/biomass/composite-risk failure and recovery flows, persisted follow
    and rollback behavior, six responsive interaction viewports, keyboard
    shortcut focus/restore and slash-search focus, the public-page dark/light
    320/390px matrix, and security headers. The keyboard gate exposed a focus
    timing defect; the hook now focuses the dialog in a layout effect and
    restores the opener after the animated exit. Focused contracts, the
    serialized full suite (**148 files / 720 tests**), lint, TypeScript, build,
    and diff validation pass. Temporary Lumes/server/browser processes were
    cleaned up; an unrelated SlopBrick Vitest job remains outside this project.

61. **CI browser and Lighthouse safeguards** — ✅ the CI workflow now runs the
    default-off Incident Focus smoke, passes the same isolated database into
    Lighthouse's server process, launches the canonical standalone server,
    uploads `/tmp/lumes-start.log` when the browser step fails, and runs the
    six previously omitted reliability suites. The browser job now executes
    **15 serial E2E suites** after seeding one guarded synthetic incident;
    status fixtures remain an explicit opt-in matrix. The local deployment
    contract suite covers these workflow contracts; the historical checkpoint
    count was **148 files / 721 tests**. Local Lighthouse passes `/`,
    `/status`, and `/privacy`. Remote GitHub CI has not been run from this
    worktree.

62. **Read-only production verifier refresh** — ⚠️ `https://lumes.pt` still
    serves the older deployment: root HTML returns `s-maxage=31536000` instead
    of `no-store`, and `/manifest.json` is HTTP 404 HTML instead of JSON. The
    emitted hashed assets, `/sw.js`, `/api/health` (`ok`), and
    `/api/source-health` (7 sources, `stale`) responded successfully. No deploy
    or restart was performed; this remains an authorization-gated blocker.

63. **Standalone tracing and flattening correction** — ✅ `next.config.ts`
    now pins `outputFileTracingRoot` to the Lumes checkout, preventing the
    shared parent workspace's pnpm lockfile and unrelated Prisma tree from
    entering the standalone runtime. A fresh build contains Prisma **6.19.2**
    (the declared Lumes version), emits a top-level `server.js`, and the
    flatten helper now handles both top-level and nested Next layouts while
    materializing `.next/static` and `public/`. The focused deployment contract
    passes **19 tests**; no deployment or restart was performed.

64. **Omitted standalone browser coverage** — ✅ all six suites that were not
    in the earlier default CI browser list now pass against the canonical
    standalone server and an isolated SQLite fixture: map-style lifecycle,
    data-trust matrix (both viewports, themes, languages, and five states),
    following filters, history lifecycle, incident ownership, and mobile
    refresh/timeline recovery. The matrix fixture now sends a valid empty
    incident envelope instead of leaving production distribution counts in a
    zero-count response. Temporary server/browser processes were stopped.

65. **Current local quality gate** — ✅ the serialized unit suite passes
    **148 files / 721 tests**; repository ESLint, TypeScript, `git diff --check`,
    and the capped production build pass. The standalone artifact was checked
    for Prisma **6.19.2**, copied static/public assets, and `/api/health`=`ok`
    on an isolated loopback server. Provider/building/terrain, attachments,
    production HTTPS verification, deployment, and restart remain separate
    gates.

66. **Fresh standalone release verifier** — ✅ after refreshing the isolated
    fixture's liveness timestamps, `deploy/verify-production.sh` passes against
    the rebuilt loopback server: HTML, all emitted immutable chunks, manifest,
    logo, service worker, `/api/health`=`ok`, and nine source-health entries
    (explicit `stale` state). The temporary server was stopped cleanly.

67. **CI reliability browser coverage** — ✅ added guarded
    `scripts/seed-e2e-db.ts`, six package E2E scripts, and CI invocations for
    map-style lifecycle, data-trust, following filters, history, incident
    ownership, and mobile refresh/timeline recovery. CI now launches
    `.next/standalone/server.js` directly; Lighthouse uses the same entrypoint.
    The deployment contract passes **19 tests** and the six-script serial run
    passes against a seeded isolated standalone database. No production state
    changed.

68. **Standalone entry preflight guard** — ✅ `deploy/deploy.sh` now refuses
    to copy assets or restart the service when `.next/standalone/server.js` is
    missing or broken after a build. The deployment contract remains green at
    **19 tests**; shell syntax, lint, TypeScript, the serialized **148 files /
    721 tests** suite, build, and diff validation pass. No production state
    changed.

69. **Authorized production deploy and browser gate** — ✅ the current
    worktree was transferred with a sanitized rsync that preserved the remote
    `backups/`, database, environment, dependency, build, and test paths. The
    server-only deploy rebuilt the standalone bundle with Bun **1.3.14** and
    Prisma **6.19.2**, passed the standalone-entry preflight, restarted
    `lumes.service`, and returned `/api/health`=`ok` with `dataState`=`healthy`.
    `lumes-ingest.timer` is active; its service uses
    `/usr/local/bin/bun /opt/apps/lumes/scripts/ingest.ts` and the latest run
    exited status `0`.

    The HTTPS verifier now passes every check: root HTML is `200` with
    `no-store`, all emitted hashed assets are `200`/immutable, `/manifest.json`
    is `200` JSON with `no-store`, `/sw.js` is `200` JavaScript with `no-store`,
    `/api/health` is `ok`, and `/api/source-health` returns nine sources with
    its explicit `stale` provider state. A fresh production Playwright context
    passed security headers plus MapLibre startup, default-off Incident Focus,
    and the public dark/light 320×568 and 390×844 matrix. No production 3D
    building/terrain provider was enabled; that external gate remains open.

70. **Feature-enabled Incident Focus CI gate** — ✅ the existing default-off
    Incident Focus browser smoke remains first in the repository-root
    `.github/workflows/lumes-ci.yml`.
    CI then rebuilds the standalone artifact with
    `NEXT_PUBLIC_LUMES_3D_INCIDENT_FOCUS=1`, reseeds the same isolated SQLite
    fixture, and runs the full Phase 1 Incident Focus browser flow at desktop,
    tablet, and phone widths through the dedicated
    `test:e2e:incident-focus:enabled` script in both normal-motion and
    reduced-motion modes. The browser artifact uploads both default-off and
    feature-enabled server logs on failure; the verification job allows 20
    minutes for the additional build and browser pass. The current local
    baseline is **149 files / 727 tests**; provider/building/terrain and
    community-attachment gates remain unchanged. Remote GitHub CI has not yet
    run from this worktree.

71. **Provider-independent map reliability continuation** — ✅ the first-load
    fixed-wing aircraft icon now adds itself when absent instead of returning
    early; biomass and composite-risk layers insert below the canonical
    incident fill layer; and Incident Focus collapses an already-expanded
    mobile map peek before taking map ownership. Focused contracts pass, the
    full serialized suite passes **149 files / 727 tests**, and the six-viewport
    responsive plus 24-context axe matrices remain green. No provider,
    attachment, terrain, or production state changed.

72. **Desktop Incident Focus chrome collision fix** — ✅ the desktop focus
    status now uses an explicit, bounded 48px top offset through the shared
    `MapChrome` primitive, placing it below the attribution card without
    changing global map controls or mobile positioning. The feature-enabled
    standalone flow passes in normal and reduced-motion modes after this fix;
    the contract suite, full serialized suite (**149 files / 726 tests**),
    lint, TypeScript, and both production builds pass. No provider, attachment,
    terrain, or production state changed.

73. **Incident Focus style-restoration continuity** — ✅ active camera-only
    focus now remains in its active/exitable state while a dark↔light MapLibre
    style transition temporarily reports `mapReady=false`; capability checks
    gate entry but cannot hide the exit controls during a transient reload.
    The feature-enabled browser flow now exercises light→dark style changes
    while focused and asserts the status remains visible and the incident
    source returns ready. Normal and reduced-motion flows pass; the current
    serialized baseline is **149 files / 727 tests**. No provider, attachment,
    terrain, or production state changed.

74. **Incident Focus edge-viewport proof** — ✅ the feature-enabled browser
    gate now also exercises the remaining 1280×800 and 320×568 edge viewports,
    with optional controls treated as absent when the compact shell intentionally
    hides them. Reduced-motion assertions wait for the actual tab/focus
    restoration state rather than assuming a synchronous transition. CI uses
    the stable repository sample incident through `LUMES_3D_FIXTURE=1`, so this
    UI gate does not depend on a live ANEPC fire being present. The default-off
    2D smoke remains unchanged; no provider, attachment, terrain, or production
    state changed. The serialized suite was rerun afterward: **149 files /
    727 tests passed**; lint, TypeScript, and diff validation remain green.

75. **CARTO entitlement documentation continuation** — ✅ the current official
    CARTO basemap FAQ, attribution guidance, and API-limit documentation were
    rechecked. Commercial use still requires an Enterprise licence; free
    non-commercial use requires a CARTO grant; attribution is required for
    CARTO and applicable providers; and the Maps API documents a 3,500
    requests/minute limit with `429` responses. These facts do not authorize
    Lumes' public use or establish a tile budget. The CARTO building experiment
    remains **KEEP GATED** pending written entitlement, exact attribution,
    quota ownership, coverage/height evidence, mobile/GPU proof, and
    style-restoration/tile-error fallback tests. No provider, registry,
    building layer, or production state changed.

76. **Plan-state reconciliation** — ✅ older continuation paragraphs that
    described screenshot, shared-drawer, or production verification as open
    are now explicitly treated as historical checkpoints in the follow-on and
    full-frontend plans. The latest evidence is authoritative: internal
    reliability, responsive/axe, release, and Phase 1 Incident Focus work is
    green; only the external 3D provider/building/terrain and community-
    attachment storage/moderation/privacy/retention/deletion decisions remain
    open.

77. **Read-only production freshness refresh** — ✅
    `bash deploy/verify-production.sh https://lumes.pt` passes the root
    no-store/cache contract, all emitted immutable assets, manifest, service
    worker, `/api/health`=`ok`, and nine source-health entries. A live
    default-off Playwright smoke also confirms that the 2D map remains
    unchanged. The response truthfully reports `ipma-warnings` as an explicit
    core `stale`/empty source and `nasa-firms-viirs` as an optional
    configuration error (`FIRMS_MAP_KEY` absent); the other core sources are
    healthy. This is not a deployment failure, but it remains an operational
    freshness/configuration risk and must not be described as all-source
    healthy. No deployment or production mutation was performed.

78. **Existing-plan continuation decision** — ✅ the optional 3D Incident Focus
    capability is now reconciled across `REFACTOR-PLAN.md`, the full-frontend
    plan, the follow-on plan, and the detailed 3D plan. Phase 1 camera-only
    work is complete and verified behind the default-off flag. No additional
    provider-independent 3D implementation is authorized: Phase 2 buildings
    still require written entitlement, attribution, Portugal coverage/height,
    tile-error fallback, style-restoration, and mobile/GPU evidence; Phase 3
    terrain/slope remains behind a separate DEM gate. Community attachments
    remain gated by storage, moderation, privacy, retention, and deletion
    decisions. Reliability and source-freshness priorities remain ahead of
    visual novelty.

79. **CARTO Phase 2 gate packet** — ✅ the exact entitlement, attribution,
    quota, caching, data-use, and retirement questions are recorded in
    `docs/providers/carto-entitlement-request.md`, with a written approval
    record and an explicit stop rule. This is preparation for an authorised
    owner to contact CARTO, not a licence or production approval. No building
    layer, provider dependency, provider flag, or browser extrusion test was
    added; Phase 1 camera-only focus remains the only enabled 3D-adjacent path.

80. **Community-attachment decision packet** — ✅ storage/account ownership,
    EU/privacy, moderation, upload/read, retention/deletion, backup, and
    byte-budget questions are now collected in
    `docs/providers/community-attachments-approval-request.md`. The packet is
    preparation only: the JSON-only `/api/reports` contract and `photoUrl: null`
    remain unchanged, and no bucket, SDK, migration, multipart route, or public
    media URL was added.

81. **Production verifier refresh** — ✅ a new read-only run against
    `https://lumes.pt` passed the root/cache/assets/manifest/service-worker
    checks, `/api/health`=`ok`, and the nine-entry source-health envelope. The
    current source truth is unchanged: ANEPC, IPMA fire-risk/weather, regional
    commands, and OSM stations are healthy; IPMA warnings is valid-empty but
    conservatively classified `stale`; NASA FIRMS is optional and errors only
    because `FIRMS_MAP_KEY` is not configured; aerial and biomass are disabled
    by design. No deployment or production mutation occurred.

82. **Source-health empty-state audit** — ✅ the conservative empty→stale
    mapping is intentional and test-backed. A generic `empty` status is not
    being introduced in this tranche because an empty ANEPC occurrence or IPMA
    warning feed can be normal, while empty IPMA weather or fire-risk data can
    indicate a degraded provider. A truthful replacement requires a
    source-specific policy matrix spanning server classification, trust types,
    client presentation, status-page badges, dashboard warnings, and their
    tests. No runtime change is authorized until that product policy is
    decided; this remains a documented freshness risk rather than an unchecked
    implementation blocker. The future source-specific matrix is recorded in
    `docs/providers/source-health-empty-state-policy.md` without changing the
    current API or UI contract.

83. **Continuation baseline verification** — ✅ the current worktree passes the
    capped serialized Vitest suite (**149 files / 727 tests**) after the
    source-health documentation audit. The expected Prisma schema-engine
    fallback and redacted provider-failure logs remain test fixtures, not test
    failures. No provider, attachment, deployment, or runtime state changed;
    all remaining unchecked plan items are the explicitly gated Phase 2/3 3D
    tasks.

84. **Read-only production freshness refresh** — ✅ `bash
    deploy/verify-production.sh https://lumes.pt` still passes root/cache/
    assets/manifest/service-worker checks, `/api/health`=`ok`, and the
    nine-entry source-health envelope. Live source truth remains: ANEPC,
    IPMA fire-risk/weather, regional commands, and OSM stations healthy;
    IPMA warnings valid-empty and conservatively `stale`; NASA FIRMS optional
    `error` because `FIRMS_MAP_KEY` is absent; aerial and biomass disabled by
    design. This is an operational freshness/configuration risk, not a reason
    to change runtime semantics or open the external gates.

85. **CARTO entitlement unblock preparation** — ✅ the provider packet now
    contains the current official references, the CARTO grant/Enterprise
    decision framing, the official request-demo URL, the RFP address
    `rfp@carto.com`, and a ready-to-send Lumes-specific request. Submission and
    written approval remain owner actions; the approval record is still
    **KEEP GATED**, and no runtime provider code was added.

86. **Free-option selection** — ✅ option 1, the OpenFreeMap public instance,
    was selected for a disposable development/beta 3D-context experiment only.
    A read-only smoke check confirmed the expected `building` and
    `building-3d` style layers, but the public service remains unsuitable as
    Lumes' production emergency dependency because its terms are as-is and do
    not provide an SLA or capacity guarantee. No runtime provider request,
    style switch, building layer, service-worker cache entry, registry, or
    production flag was added. Phase 1 remains camera-only and default-off;
    the spike record is
    `specs/archive/spikes/SPIKE-openfreemap-3d-context.md`.

87. **Disposable OpenFreeMap browser spike** — ✅ a static MapLibre harness
    loaded the Liberty style across desktop, tablet, and mobile profiles in
    normal and reduced-motion modes. Synthetic incident, evacuation, risk, and
    station overlays remained queryable above rendered 3D buildings. The
    whole-style tile-abort case could not preserve overlays before style load,
    confirming that Lumes must retain its existing CARTO/2D style and treat
    building context as an independently removable layer. The harness was
    outside the repository; no `EmberMap`, CSP, service-worker, provider
    registry, or production state changed.

88. **Self-hosted Protomaps operations spike** — ⚠️ partial evidence recorded
    in `specs/archive/spikes/SPIKE-protomaps-self-hosted.md`. The pinned
    2026-07-12 archive returned valid `206` Range responses with stable ETag and
    Last-Modified headers, but the public build host returned no CORS or
    Cache-Control headers for the Lumes origin. A Lumes-controlled object-store
    and CDN fixture is required before browser/PMTiles testing. No bucket,
    dependency, source, service-worker route, or production flag was added;
    Phase 2 remains gated.

89. **Controlled PMTiles browser fixture** — ⚠️ implementation shape proven,
    production gate still closed. A disposable local Range proxy supplied the
    CORS/Cache-Control/ETag/Last-Modified contract around the pinned archive,
    and MapLibre's PMTiles protocol rendered building context across desktop,
    tablet, mobile, and reduced-motion profiles. Synthetic incident,
    evacuation, risk, and station overlays stayed visible above buildings;
    the controlled HTTP 503 path reset to 2D without losing those overlays.
    The run made 42 bounded requests totaling 2,433,799 bytes with successful
    range latency of 385--956 ms. No runtime provider, dependency, bucket,
    source, service-worker route, registry, or production flag was added.
    Remaining gates are Lumes-owned storage/CDN operations, attribution/legal
    approval, Portugal coverage/height completeness, GPU/mobile budget, and
    refresh/rollback ownership.

90. **Storage gate owner action** — ⏸️ external authorization required. The
    workspace has the `wrangler` executable but no visible PMTiles/S3/R2
    storage configuration or credentials. The exact owner checklist is now in
    `docs/providers/3d-context-sources.md`: select Lumes-owned storage/CDN,
    publish a pinned bounded Portugal extract, configure Range/CORS/ETag/
    Last-Modified/Cache-Control, assign refresh/egress/rollback ownership,
    obtain written attribution/legal approval, and rerun the disposable
    browser fixture against the real hostname. No secrets were requested or
    written; no runtime provider, bucket, dependency, source, service-worker
    route, registry, or production flag was added.

91. **Continuation baseline and production verification refresh** — ✅ the
    provider-independent worktree was rechecked on 2026-07-13. The bounded
    serialized Vitest suite passed **149 files / 727 tests**; `bun run
    typecheck` and `bun run lint` passed. The read-only production verifier
    passed the live HTML/cache/assets, manifest, service worker, `/api/health`,
    and nine-source `/api/source-health` checks. This was verification only:
    no deployment, runtime provider, storage bucket, service-worker route, or
    feature-flag mutation occurred. The remaining open gates are the
    Lumes-owned 3D storage/CDN and legal/attribution/coverage/mobile approvals
    plus the community-attachment storage, moderation, privacy, retention,
    and deletion decisions.

92. **Local production-build refresh** — ✅ `NODE_OPTIONS=--max-old-space-size=1536
    bun run build` completed on 2026-07-13. Prisma Client generated, Next.js
    compiled and typechecked, all 21 static pages were generated, and the
    standalone flattener confirmed `server.js`, `.next/static`, and `public/`
    are materialized. This validates the current local release artifact only;
    it does not deploy or change the live service.

93. **Continuation audit boundary** — ℹ️ a fresh checkbox audit found no
    provider-independent item left open in the handoff or full frontend plan.
    Remote GitHub CI remains explicitly unrun, so local gates do not claim
    remote-CI coverage. The PMTiles result remains a controlled local proxy
    fixture only; it is not evidence of Lumes-owned production storage/CDN,
    legal/attribution approval, nationwide coverage, GPU budget, or refresh/
    rollback ownership.

94. **Remote-CI availability check** — ℹ️ read-only GitHub inspection found no
    workflow definitions or runs on `Dystx/lumes` at the remote default branch.
    The local `main` contains six local-only commits ahead of `origin/main`,
    while the worktree is also dirty. No push, PR, workflow dispatch, or
    deployment was attempted. Remote CI therefore remains an external release
    boundary, not a failed local gate.

95. **Local Lighthouse budget refresh** — ✅ `NODE_OPTIONS=--max-old-space-size=1536
    DATABASE_URL=file:./db/custom.db bunx lhci autorun --config=lighthouserc.json
    --upload.target=filesystem --upload.outputDir=/tmp/lumes-lhci-local`
    completed without public upload. The local `/`, `/status`, and `/privacy`
    reports met the configured thresholds: performance scores `0.72`, `0.83`,
    `0.83`; accessibility `1.00` on all three; best practices `0.95` on all
    three; and SEO `1.00` on all three. The temporary server exited and port
    3001 was free afterward.

96. **Local CI coverage reconciliation** — ℹ️ the configured local CI workflow
    was compared with the current handoff evidence. Lint, typecheck, unit
    tests, build, Lighthouse, the browser accessibility/operational matrix,
    and the feature-enabled Incident Focus normal/reduced-motion flows all
    have recorded local evidence. No additional provider-independent local
    gate was found; remote CI remains the separate unpublished-commit boundary.

97. **Persistent-goal boundary audit** — ⏸️ the current audit still finds only
    the explicitly gated CARTO/3D and community-attachment approval items.
    `Dystx/lumes` reports zero remote workflows and zero runs; local `main` is
    six commits ahead of `origin/main` with a dirty worktree. No safe local
    implementation or verification action remains that can advance those gates
    without owner authorization or external state change.

98. **Publication and workflow-discovery repair** — ✅ the six committed
    Lumes changes were pushed from `5976494df` to `da21c09c3` without force.
    Read-only GitHub inspection then confirmed zero workflows because the Git
    root is `/Users/cheng` while the old workflow files lived under
    `Lumes/.github/workflows/`. The canonical workflows now move to the
    repository-root `.github/workflows/lumes-ci.yml`,
    `.github/workflows/lumes-deploy.yml`, and
    `.github/workflows/lumes-lighthouse.yml`, with `Lumes/**` path filters and
    explicit `working-directory: Lumes` execution. The repair is committed on
    `codex/lumes-root-workflows` and pushed to the open PR without force. The
    branch also publishes the tracked Prisma schema and public-page dependency
    chain that hosted CI required. Unrelated root-project changes remain
    outside the branch.

99. **Hosted verification after publication** — ⚠️ workflow discovery and the
    published source contract are now proven, but the PR checks are not green.
    Run `29278210950` passed setup, Prisma generation, lint, typecheck, the
    full unit suite, and production build before failing at its Lighthouse
    budget step with home performance `0.64`; run `29278210957` independently
    built successfully and failed its hosted Lighthouse assertion at `0.66`
    after a rerun (the earlier attempt measured `0.69`). The local filesystem
    Lighthouse evidence remains `0.72/0.83/0.83`, so this is a reproducible
    hosted performance gap rather than a source/build failure. Do not lower
    the `0.70` budget blindly; the next reliability action is to make the
    performance test deterministic or improve the home route, while the
    provider and attachment gates remain separate.

100. **MapLibre startup performance tranche** — ⚠️ two narrow, provider-
    independent changes were published after the hosted performance evidence:
    `84ee5801e` defers the existing `MapScene` bundle behind a client-only
    boundary, and `dfc37060f` starts that same scene after a short shell delay
    and browser-idle opportunity. Neither changes the map provider, styles,
    camera contract, overlays, service-worker rules, or optional 3D gates.
    Local Lighthouse improved to home `0.90` and then `0.95` (status/privacy
    remained `1.00`); the serialized suite remains **149 files / 728 tests**,
    with typecheck, lint, build, and staged diff checks passing. Hosted runs
    `29280770116` and `29280769818` still fail only at the home Lighthouse
    budget (`0.68` on the first attempt and `0.63` on the rerun/CI attempt),
    with the report attributing the residual main-thread cost to the MapLibre
    startup chunk. Do not add more arbitrary delay or weaken the `0.70`
    threshold without a product decision; keep the operational map authoritative
    and treat further startup profiling as the next reliability task.

101. **Post-load overlay scheduling follow-up** — ⚠️ commit `d4cdb539e`
    moves the existing EmberMap overlay/source setup out of MapLibre's
    synchronous `load` handler and schedules it through `requestIdleCallback`
    (with a zero-delay fallback), while keeping map ownership, readiness,
    style-restoration, layer ordering, and the provider unchanged. The focused
    map contracts, full serialized suite (**149 files / 728 tests**), typecheck,
    lint, production build, and local Lighthouse all pass. Local home
    Lighthouse remains `0.95` with main-thread time reduced from about `536 ms`
    to `498 ms`; `/status` and `/privacy` remain `1.00`. Hosted Lighthouse
    remains below the unchanged `0.70` budget: run `29282065269` measured
    `0.61`, and its controlled rerun measured `0.63`; paired CI run
    `29282065288` passed all earlier stages and failed only at Lighthouse
    budgets. This is measurement-variance evidence, not a reason for another
    arbitrary delay, provider switch, or budget reduction. Stop runtime tuning
    here unless a product-aware profile identifies a concrete next action;
    reliability, incident clarity, and the existing provider/3D gates remain
    higher priority.

102. **Brand-font preload boundary** — ✅ `src/app/layout.tsx` now sets
    `preload: false` for Fraunces. Fraunces remains available for the brand
    mark, but the operational map shell no longer preloads the approximately
    121 KB font. The typography contract now guards this boundary. Focused
    typography tests, the full serialized suite (**149 files / 728 tests**),
    typecheck, lint, and production build pass. Repeated local Lighthouse
    measured home performance `0.95` then `0.96`, with the latest run at about
    `812 KB` total transfer and no Fraunces request in the home network trace;
    `/status` remained `0.99` and `/privacy` `1.00`. This is a bounded,
    provider-independent improvement; it does not change map behavior,
    service-worker policy, attribution, or the closed 3D/provider gates.

---

## 7. Contact

- **Live site**: <https://lumes.pt>
- **Server**: 152.53.145.9 (lumes@…)
- **Source**: `Lumes/` in this repo
- **Production build**: `/opt/apps/lumes/.next/`
- **Database**: `/opt/apps/lumes/db/custom.db`
- **Logs**: `/opt/logs/lumes.log`, `/opt/logs/lumes.err`

If something's broken, check:

1. `systemctl --user status lumes.service`
2. `tail -50 /opt/logs/lumes.err`
3. `curl -s http://127.0.0.1:3001/api/source-health | jq`

Welcome aboard. 🔥
