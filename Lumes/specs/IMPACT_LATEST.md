## Shared client trust boundary target

Prevent malformed API `DataStateMeta` envelopes from becoming falsely fresh in
the shared client trust model used by the page-wide data hooks.

### Dependents and risk

- `src/lib/use-fetch.ts` is the shared fetch/lifecycle boundary for 14 direct
  data hooks and owns response metadata acceptance, fallback retention, and
  retry state.
- `src/lib/data-state.ts` owns strict metadata normalization and the
  absent-versus-malformed resolution contract.
- `src/lib/data-trust.ts` maps normalized metadata to the UI trust indicator;
  provider freshness must remain distinct from client receipt time.
- `tests/lib/data-state.test.ts`, `tests/lib/data-trust.test.ts`, and
  `tests/lib/use-fetch-request.test.ts` cover the runtime boundary; source-health
  adapter/presentation and use-app-data contracts cover downstream consumers.
- E2E fixtures in `tests/e2e/{risk-layer-state,aerial-layer-state,
  biomass-layer-state,mobile-refresh-and-timeline}.test.ts` now include valid
  metadata timestamps.

Risk is **high** because malformed metadata can poison trust indicators across
the whole map, but the change is isolated to a typed boundary and preserves
fetch, fallback, and refresh behavior. The invariants are: absent metadata is
backward-compatible, present malformed metadata is never fresh, valid provider
freshness is preserved, and client receipt time is not used as source time.

## Outcome (2026-07-13)

Added strict `normalizeDataStateMeta()` and `resolveDataStateMeta()` helpers.
`useFetch` now retains prior data/fallback and marks a present malformed
metadata response retryable instead of accepting it as healthy; missing
metadata still uses the legacy healthy default. `deriveDataTrust()` fails closed
for malformed runtime metadata and exposes only explicit provider
`sourceUpdatedAt` values. E2E fixtures were aligned with the required
`updatedAt` field.

The focused trust/client gate passes **6 files / 32 tests**; independent review
approved the boundary. The full single-worker suite passes **124 test files /
485 tests** with a 2 GB heap cap. Typecheck, lint, diff check, and the capped
production build pass; the build emits the existing multiple-lockfile
workspace-root warning but succeeds.

## Shared client trust precedence correction (2026-07-13)

Review exposed a precedence hole: valid `healthy` metadata could mask a
non-fallback refresh error in `deriveDataTrust()`. The reducer now makes
invalid metadata and refresh errors win over ordinary metadata states while
preserving an explicit retained `fallback`. The red-first regression passes;
the focused trust gate is **5 files / 20 tests**, and the final full suite is
**125 test files / 506 tests** with typecheck, lint, diff check, and the capped
production build green.

## Batch incident-risk result boundary target

Make the optional `/api/incidents/risks` response distinguish usable risk
results from valid requests that resolve to no known or geographically usable
incidents, while preventing duplicate same-coordinate weather calls.

### Dependents and risk

- `src/app/api/incidents/risks/route.ts` owns request validation, persistence
  lookup, coordinate filtering, bounded risk fan-out, weather caching, and the
  public data-state/cache envelope.
- `tests/lib/incident-risks-route.test.ts` covers empty, healthy, mixed,
  malformed-weather, persistence-failure, and in-flight dedupe contracts.
- `tests/lib/api-boundaries.test.ts` protects the request-size/rate boundary;
  composite-risk tests cover the shared Open-Meteo normalizer.

Risk is **medium-low** because this is an optional endpoint, but false healthy
empty results can mislead map consumers and duplicate provider calls waste the
request budget. The invariants are: unknown/out-of-Portugal-only results are
explicitly empty, valid mixed rows are retained, per-item no-weather values
remain finite, and same-coordinate calls share one in-flight request.

## Outcome (2026-07-13)

Added explicit empty-state classification for zero usable batch results and
coalesced same-coordinate Open-Meteo requests with a promise cache. Unknown IDs
and invalid coordinates do no provider work; mixed rows retain valid results;
existing no-weather semantics and redacted persistence failures remain intact.

The focused risk/API gate passes **4 files / 25 tests**; independent review
approved the bounded change. The full single-worker suite passes **124 test
files / 472 tests** with a 2 GB heap cap. Typecheck, lint, diff check, and the
capped production build pass; the build emits the existing multiple-lockfile
workspace-root warning but succeeds.

## IPMA observation freshness boundary target

Keep malformed IPMA observation buckets out of the weather map and prevent
host-timezone-dependent freshness from marking provider data as newer or older
than it is.

### Dependents and risk

- `src/app/api/weather/route.ts` selects the provider bucket, publishes
  observations, and exposes `dataState.sourceUpdatedAt` to source health.
- `src/lib/weather/normalizer.ts` is the row DTO boundary and must reject an
  invalid observation timestamp before publication.
- `src/lib/weather/observations.ts` owns strict timestamp shape validation,
  DST-aware Lisbon parsing, newest-bucket selection, and UTC canonicalization.
- `tests/lib/weather-normalizer.test.ts` and
  `tests/lib/data-api-routes.test.ts` cover mixed local/zoned keys, invalid
  keys, empty/cache behavior, row rejection, and freshness provenance.

Risk is **medium** because weather freshness feeds source trust and local risk
context, but the change is isolated to the IPMA weather boundary. The
invariants are: invalid keys cannot become observations, selection is based on
the real instant, timezone-less IPMA values mean Portugal local time, and
source-health metadata is a stable UTC timestamp.

## Outcome (2026-07-13)

Added strict observation-key validation and a typed timestamp helper. The route
now chooses the newest valid bucket by parsed instant, resolves no-zone IPMA
timestamps in `Europe/Lisbon` with DST rules independent of the host timezone,
and returns a cacheable explicit empty state when no valid bucket exists.
Normalized rows reject invalid timestamps. The public timestamp is preserved,
while `dataState.sourceUpdatedAt` is emitted as canonical UTC.

The focused weather/source-health/API gate passes **5 files / 63 tests**;
independent review approved the corrected timezone handling, including
fractional-second preservation. The full single-worker suite passes **124 test
files / 468 tests** with a 2 GB heap cap.
Typecheck, lint, diff check, and the capped production build pass; the build
emits the existing multiple-lockfile workspace-root warning but succeeds.

## Dashboard normalization boundary target

Keep malformed live or persisted incident semantics out of dashboard
aggregates, and distinguish a real empty fallback from a database outage.

### Dependents and risk

- `src/app/api/dashboard/route.ts` owns live/DB source selection, aggregate
  totals, distributions, and priority ranking.
- `src/lib/dashboard/normalizer.ts` owns enum, scalar, timestamp, geometry,
  and status-consistency validation for both source shapes.
- `tests/lib/dashboard-fallback.test.ts` and
  `tests/lib/dashboard-failure.test.ts` cover mixed rows, fallback, empty,
  geometry, retryable envelopes, and cache/error behavior.

Risk is **medium** because this endpoint drives the operational dashboard,
but the adapter is isolated and the public response shape is unchanged. The
invariants are: invalid rows cannot alter totals, non-Point geometry is not
relabelled, a retryable live source is not trusted as healthy, and DB failure
cannot masquerade as empty data.

## Outcome (2026-07-13)

Added typed live/DB dashboard normalizers. Unknown severity/status, negative or
fractional personnel/assets, invalid timestamps, status mismatches, and
declared non-Point geometries are rejected. Live retryable envelopes fall
back to DB; DB query failures return a redacted `500`/`no-store` response.

The focused dashboard/API gate passes **3 files / 33 tests**; independent
review approved the slice. The full single-worker suite passes **124 test
files / 460 tests** with a 2 GB heap cap. Typecheck, lint, diff check, and the
capped production build pass; the build emits the existing multiple-lockfile
workspace-root warning but succeeds.

## IPMA warning payload boundary target

Make `/api/weather-warnings` reject provider schema drift instead of silently
turning a malformed successful response into an empty warning state, while
preserving the public warning DTO and IPMA's documented timestamp formats.

### Dependents and risk

- `src/app/api/weather-warnings/route.ts` feeds the warning layer and is probed
  as the core `ipma-warnings` source by `/api/source-health`.
- `src/lib/weather/warnings.ts` owns the typed warning-row normalizer,
  required-field checks, and strict local/zoned ISO timestamp validation.
- `tests/lib/weather-warnings-route.test.ts` covers healthy, empty, malformed,
  invalid-row, non-OK, rejected, cache-failure, and cache-header behavior.

Risk is **medium** because warnings influence public situational awareness,
but the change is isolated to one provider boundary and preserves the route's
wire shape. The invariants are: non-array payloads are retryable, true empty
arrays remain cacheable empty, recognized malformed rows cannot produce a
misleading healthy result, and valid IPMA local timestamps remain accepted.

## Outcome (2026-07-12)

Added strict warning normalization and fail-closed handling. Non-array payloads
and all-invalid recognized rows now return redacted `502`/`no-store` responses;
valid mixed rows retain only valid warnings, and empty arrays remain explicit
cacheable empty data. Required area/type values are trimmed, impossible dates
and ambiguous timestamps are rejected, and both timezone-less local ISO and
zoned ISO formats are supported.

The final focused weather-warning/source-health/API gate passes **4 files / 58
tests**; independent review approved the change. The full single-worker suite
passes **124 test files / 454 tests** with a 2 GB heap cap. Typecheck, lint,
diff check, and the capped production build pass; the build emits the existing
multiple-lockfile workspace-root warning but succeeds.

## Source-health probe boundary target

Make `/api/source-health` fail closed when an upstream provider returns a
malformed or semantically invalid envelope, while preserving explicit source
trust states and distinguishing provider freshness from response receipt time.

### Dependents and risk

- `src/app/api/source-health/route.ts` probes the live provider routes and
  feeds the global headline-trust state used by the dashboard and status page.
- `src/lib/source-health-probe.ts` owns the typed JSON-envelope boundary and
  redacted provider metadata extraction.
- `tests/lib/source-health.test.ts` covers provider-level matrix behavior;
  source-health adapter/trust tests cover downstream interpretation.

Risk is **medium** because this is a core trust signal, but the change is
isolated to the aggregator and does not alter provider response shapes. The
invariants are: malformed/non-200/rejected providers are errors; explicit
stale/fallback/disabled states are not upgraded; and missing source timestamps
remain unknown rather than being inferred from receive time.

## Outcome (2026-07-12)

Added the typed probe normalizer and wired it into `/api/source-health`.
Malformed JSON/envelopes, invalid count/state/timestamp values, non-200
responses, and rejected fetches now produce redacted source errors. Explicit
stale, fallback, disabled, and retryable states plus provider reasons remain
visible. Source freshness uses only explicit provider timestamps, and the
aggregate omits `sourceUpdatedAt` when no core provider timestamp is known.

The focused source-health/trust/API gate passes **4 files / 39 tests**;
independent review approved the slice. The full single-worker suite passes
**124 test files / 448 tests** with a 2 GB heap cap. Typecheck, lint, diff
check, and the capped production build pass; the build emits the existing
multiple-lockfile workspace-root warning but succeeds.

## Realtime client lifecycle target

Harden the browser SSE lifecycle so repeated errors cannot create reconnect
timer leaks, constructor failures do not permanently disable live updates,
malformed frames cannot reach page state, and unmounting closes the source and
cancels pending work.

### Dependents and risk

- `src/lib/use-realtime-incidents.ts` owns the React state/callback boundary
  consumed by `src/app/page.tsx`.
- `src/lib/realtime-client.ts` owns EventSource lifecycle, parsing, retry, and
  disposal without importing React or MapLibre.
- `tests/lib/realtime-client.test.ts` and
  `tests/lib/realtime-contract.test.ts` cover client/server behavior.

Risk is **medium-low**: the public hook shape remains `{ connected, lastEvent }`
and the server SSE contract is unchanged. The invariant is one active source,
one pending reconnect timer, and no callbacks after disposal.

## Outcome (2026-07-12)

Added the typed `createRealtimeClient()` boundary and rewired the hook to use
it. Repeated errors coalesce, constructor failures retry, stale source events
are ignored, malformed frames are dropped, and disposal closes the source and
cancels timers. Focused client/server tests pass 2 files / 7 tests,
independent review approved the lifecycle, the full suite passes **124 test
files / 440 tests**, and lint, typecheck, capped build, standalone responsive
smoke, and diff check pass.

## ANEPC request coalescing target (previous latest)

Prevent slow concurrent `/api/incidents` requests from multiplying upstream
ANEPC work. The current boolean lock waits only five seconds while the
upstream timeout is twenty seconds, so a second request can start a duplicate
fetch after the wait expires.

### Dependents and risk

- `src/app/api/incidents/route.ts` owns the core read path and its cache call.
- `src/lib/api/cache.ts` stores completed values but intentionally does not
  deduplicate in-flight loaders; this slice keeps the blast radius route-local.
- `tests/lib/data-api-routes.test.ts` covers healthy, failure, concurrency, and
  retry behavior.

Risk is **medium-low**: the change is isolated to request coalescing and does
not alter the public response shape or cache headers. The invariant is that
all concurrent callers share one loader promise, and a rejection releases it.

## Outcome (2026-07-12)

Replaced the boolean/wait loop with an identity-guarded `inFlightFetch` promise
around the existing `cached()` call. Slow concurrent requests make one
upstream call; shared rejection leaves the next request free to retry. Focused
route tests pass 20 tests, independent review approved the change, the full
suite passes **123 test files / 437 tests**, and lint, typecheck, capped build,
responsive standalone smoke, and diff check pass.

## Incident selection ownership target (previous latest)

Keep list-driven incident selection separate from map-driven selection:
list and mobile peek surfaces should select without issuing a camera flight,
while MapScene clicks and marker-menu detail actions should preserve the
explicit map-flight behavior.

### Dependents and risk

- `src/app/page.tsx` owns both selection callbacks and wires them into
  SituationPanel, MapScene, MobileView, DashboardPanel, and long-press actions.
- `src/lib/incident-selection.ts` owns the pure source-aware decision.
- `tests/lib/incident-selection.test.ts` protects the handler ownership shape.

Risk is **low**: this is a callback-wiring correction with no change to
selection state shape or map rendering. The invariant is that only map-led
interactions request `flyToIncidentId`.

## Outcome (2026-07-12)

SituationPanel, MobileView map peek, and mobile DashboardPanel now use the
no-fly list handler. MapScene and marker-menu detail actions retain the map
handler. Focused contracts pass 2 files / 6 tests, independent review
approved the correction, all six responsive browser viewports pass, the full
suite passes **123 test files / 434 tests**, and lint, typecheck, capped build,
and diff check pass.

## Filter reset target (previous latest)

Complete the FilterPanel clear-all boundary while removing the dead page-level
reset adapter: phase and resource filters must be passed to both FilterPanel
instances, clear with the other query filters, and keep the reset affordance
active when they are selected.

### Dependents and risk

- `src/app/page.tsx` supplies filter state/setters to the desktop and mobile
  `FiltersPanel` instances and owns the Zustand query state.
- `src/components/filters/filters-panel.tsx` owns the rendered clear-all
  interaction and active-filter affordance.
- `src/lib/incident-filters.ts` and `src/lib/active-filter-labels.ts` already
  derive phase/resource chips; their contracts remain unchanged.
- `tests/lib/active-filter-labels-ui-contract.test.ts` and the responsive
  browser matrix cover the wiring and both viewport families.

Risk is **low-to-medium**: the change crosses both FilterPanel instances and
the clear-all interaction, but does not alter filter derivation or map data.
The invariant is that clear-all returns every query filter to its default while
leaving display-only layers untouched.

## Outcome (2026-07-12)

Removed the dead page reset adapter, passed phase/resource controls into both
FilterPanel instances, and made clear-all reset those values and expose its
affordance when active. Focused contracts pass 2 files / 11 tests; all six
responsive browser viewports pass; lint, typecheck, the full suite (**123 test
files / 433 tests**), and the capped production build pass.

## Follow callback target (previous latest)

Remove the redundant `toggleFollow` forwarding function from
`src/app/page.tsx` and wire Inspector and marker-menu follow/alert actions
directly to `handleToggleFollow`, preserving the existing persistence and
toast ownership boundaries.

### Dependents and risk

- `src/app/page.tsx` owns `handleToggleFollow`, localized feedback, and the
  selected-incident/marker-menu event wiring.
- `src/lib/use-followed-incidents.ts` owns browser-local persistence, pending
  guards, rollback, and applied/ignored results; it is unchanged.
- `src/components/detail/IncidentDetailPanel.tsx` and
  `src/components/mobile/long-press-actions.tsx` consume compatible callback
  signatures.
- `tests/lib/followed-incidents.test.ts` and
  `tests/e2e/follow-state.test.ts` cover the ownership and browser behavior.

Risk is **low**: the change removes only a forwarding function. The invariant
is that every follow/alert action still passes through the same page-owned
handler and therefore the same pending, rollback, and toast semantics.

## Outcome (2026-07-12)

Removed the wrapper and wired all current call sites directly. The source
ownership contract and fresh-browser follow flow pass; independent review
approved the cleanup; lint, typecheck, the full suite (**123 test files / 431
tests**), and the capped production build pass.

## Map theme target (previous latest)

Replace the `next-themes` string cast at the `MapScene` boundary with a
tested `MapTheme` normalizer, preserving the existing dark fallback for
`undefined`, `system`, and unknown values.

### Dependents and risk

- `src/app/page.tsx` passes `theme` from `useTheme()` into `MapScene`.
- `src/lib/map/map-style.ts` owns the `MapTheme` type and style policy.
- `src/components/ember-map.tsx` already normalizes invalid theme props to
  dark; the new helper makes that boundary explicit at the caller.
- `tests/lib/map-style.test.ts` covers the normalizer and existing style
  contracts.

Risk is **low**: this is a type-boundary cleanup with no style, camera, or
MapLibre lifecycle change. The invariant is that only the exact `"light"`
value selects the light map theme.

## Outcome (2026-07-12)

Implemented `normalizeMapTheme()` and changed `MapScene` to receive its typed
result. Focused map-style/map-scene contracts pass 3 files / 10 tests;
independent review approved the change; lint, typecheck, the full suite
(**123 test files / 430 tests**), and the capped production build pass.

## Live fallback-status target (previous latest)

Extract the live fallback-status transition decision from
`src/app/page.tsx` into a pure typed helper while keeping the page's status
ref, localized toast copy, and effect ownership unchanged.

### Dependents and risk

- `src/app/page.tsx` remains the only caller and owns the previous-status ref
  plus the user-facing toast side effects.
- `src/lib/use-app-data.ts` supplies `usingFallback` and `liveCount`; its
  response and fallback contracts are not changed.
- `tests/lib/live-status.test.ts` covers the pure transition boundary.

Risk is **low**: this is a pure decision extraction with one page caller and
no runtime, provider, or persistence changes. The main invariant is exact
preservation of one-time fallback entry and recovery-with-live-data behavior.

## Outcome (2026-07-12)

Implemented `src/lib/live-status.ts` and replaced the inline branch decision
in `src/app/page.tsx`. The focused contract passes 4 tests; the reviewer
approved the extraction with no changes; lint, typecheck, the full
single-worker suite (**123 test files / 429 tests**), and the capped
production build pass.

## Keyboard shortcut target (previous latest target)

Extract the keyboard-shortcut and shortcuts-panel focus lifecycle currently
embedded in `src/app/page.tsx` into a typed, focused hook without changing
global overlay ownership, search focus behavior, incident-focus Escape handling,
or the existing `showShortcuts` Zustand state.

### Dependents and risk

- `src/app/page.tsx` injects refresh, follow, locate, overlay-close, and
  incident-focus actions.
- `src/store/ui-store.ts` owns `showShortcuts` and overlay-stack state.
- `src/components/filters/filters-panel.tsx` consumes the search input ref.
- `src/lib/focus-trap.ts` and `src/lib/blocking-overlay.ts` are shared focus
  primitives and remain unchanged.

Risk is **medium**: one page caller fans into global keydown listeners, focus
restoration, Escape precedence, and map/incident actions. Pure routing,
ownership contracts, and browser focus proof were added before extraction.

## Previous target

Harden the optional composite-risk overlay at
`src/components/layers/risk-layer.tsx` and its `/api/risk` response boundary.

## Dependents (3 relevant boundaries)

- `src/components/advanced-layers-host.tsx`: lazy-loads `RiskLayer` when the
  composite-risk toggle is enabled.
- `src/app/page.tsx` / `src/components/filters/filters-panel.tsx`: own the
  toggle state and user-facing optional-layer controls; their public contract
  must remain unchanged.
- `src/lib/map/map-source.ts`: existing fail-closed GeoJSON source updater;
  the risk layer should reuse it instead of force-casting `getSource()`.

## Affected stories

- Full frontend improvement optional-layer reliability: provider failures must
  remain local, retryable, and non-cacheable without poisoning the core map.
- Map architecture refactor: optional layers should use typed response and
  source-update boundaries while preserving one MapLibre owner.

No release-plan YAML is present in this checkout; the canonical work is
tracked in `docs/superpowers/plans/2026-07-10-full-frontend-improvement.md`.

## Test coverage

- `tests/lib/api-boundaries.test.ts` covers invalid coordinates and rate-limit
  behavior only.
- `tests/lib/incident-risks-route.test.ts` covers the batch incident-risk
  endpoint, not the viewport `/api/risk` route.
- `tests/lib/map-source.test.ts` covers the fail-closed source helper.
- Gap: `/api/risk` healthy/cache, upstream failure, and no-data semantics are
  not covered; the client layer has no response-shape, timeout, or failure
  contract. Browser proof of the optional risk toggle is also absent.

## Risk: Medium

The runtime caller is isolated, but the change crosses a public API response,
an optional MapLibre source, and a user-visible lazy layer. A malformed or
stale risk payload could produce misleading operational context, while an
unchecked fetch can remain pending after unmount or style changes.

## Recommended action

Add tests first for a typed response normalizer and explicit retryable/empty
states. Then add an abort-bounded client request and reuse
`setGeoJSONSourceData()` for source updates. Preserve the current camera,
toggle, layer IDs, and 5-minute refresh behavior. Run focused tests, typecheck,
lint, diff check, and the bounded full suite; defer a browser screenshot until
the route and client contracts are green.

## Outcome (2026-07-12)

Implemented in `src/lib/risk/overlay.ts` and
`src/components/layers/risk-layer.tsx`. The rebuilt-standalone browser flow
now proves localized failure and toggle recovery. Focused contracts, typecheck,
lint, capped build, and the bounded suite pass (**109 test files / 343 tests**).

## Next target

Harden `src/components/layers/biomass-layer.tsx` and the
`/api/biomass/grid` GeoJSON boundary. The layer currently performs an
unbounded raw fetch, trusts the response shape, silently ignores failure, and
force-casts the MapLibre source. Keep the synthetic source clearly labeled;
do not introduce a new biomass provider in this slice.

## Biomass outcome (2026-07-12)

Implemented in `src/lib/biomass/overlay.ts` and
`src/components/layers/biomass-layer.tsx`. The rebuilt-standalone browser
flow proves localized failure and toggle recovery; focused contracts,
typecheck, lint, capped build, and the bounded suite pass (**111 test files /
347 tests**). The source remains synthetic and explicitly labeled.

## Aerial outcome (2026-07-12)

Implemented in `src/lib/aerial/overlay.ts` and
`src/components/layers/aerial-layer.tsx`. The client now validates the aerial
FeatureCollection and aircraft fields, uses an abort-bounded request with
cleanup cancellation, prevents duplicate in-flight loads, clears stale map
state on failure/empty/invalid responses, and reuses the typed fail-closed
source updater. Focused aerial contracts, typecheck, lint, and the bounded
single-worker suite pass (**112 test files / 350 tests**). No aerial provider
behavior changed.

## Next target: follow DELETE rate limit

`src/app/api/follow/route.ts` is a public mutating boundary. `POST` applies
the documented F-22 per-IP limit, but `DELETE` currently performs only the
CSRF check before returning its fail-closed response. The route is called by
the public follow UI and is covered by `tests/lib/public-action-routes.test.ts`.

Risk is **medium**: the current route cannot mutate persistence, but an
unbounded public mutation-shaped endpoint is inconsistent with the stated
request-budget contract and can be exercised without an account. Add a
regression test for the 30-request DELETE budget, then apply the same limiter
before the unavailable response; preserve the existing 403 and 503 envelopes.

## Follow rate-limit outcome (2026-07-12)

Added the DELETE budget check in `src/app/api/follow/route.ts` and the
regression contract in `tests/lib/public-action-routes.test.ts`. Allowed
requests retain the fail-closed `503` response; exhausted requests return a
redacted `429` with `Retry-After` and `Cache-Control: no-store`. Focused
contracts, typecheck, lint, capped build, and the bounded suite pass
(**112 test files / 351 tests**).

## Regional matrix outcome (2026-07-12)

Expanded `tests/lib/api-contract-matrix.test.ts` for
`src/app/api/region/[name]/route.ts` with healthy populated output, the
default active-status filter, explicit `resolved=1` behavior, and blank-name
rejection. The existing empty and persistence-failure contracts remain green;
the bounded suite now passes (**112 test files / 354 tests**).

## Next target: fire-risk provider normalization

`src/app/api/fire-risk/route.ts` feeds the core IPMA risk layer and
`src/components/map/map-data-adapter.ts` publishes those records to MapLibre.
The current parser converts malformed latitude/longitude/RCM values to zero,
so an invalid provider row can become a false `0,0` feature while the response
still reports `healthy`. Tests in `tests/lib/data-api-routes.test.ts` and
`tests/lib/map-data-adapter.test.ts` now make that gap explicit.

Risk is **high** for data integrity because the route is a core operational
source and invalid coordinates can mislead the map and nearest-risk context.
Normalize at the provider boundary by dropping rows without finite mainland
Portugal coordinates, a non-empty municipality code, or an integer RCM in
`0..5`; classify an all-invalid payload as cacheable `empty`, preserve valid
mixed rows, and keep the existing redacted retryable failure contract.

## Fire-risk normalization outcome (2026-07-12)

Implemented `src/lib/fire-risk/normalizer.ts` and wired it into
`src/app/api/fire-risk/route.ts`. The provider boundary now drops malformed or
out-of-mainland rows, requires non-empty municipality codes and integer RCM
values in `0..5`, and classifies all-invalid payloads as cacheable empty state.
`toFireRiskFeatures()` repeats the finite Portugal-coordinate guard before
MapLibre publication. Route/adapter tests, typecheck, lint, capped build, and
the bounded suite pass (**112 test files / 360 tests**).

## CSRF response outcome (2026-07-12)

Updated `src/lib/api/csrf.ts` so rejected origins return a generic `403`
JSON envelope with `dataState.empty` and `Cache-Control: no-store`. Added
direct helper coverage plus alert/follow caller assertions; no mutation
ownership behavior changed. Typecheck, lint, capped build, and the bounded
suite pass (**113 test files / 362 tests**).

## Weather geometry outcome (2026-07-12)

Updated `src/app/api/weather/route.ts` so station coordinates are published
only as a finite mainland-Portugal pair. Partial or invalid station geometry
is omitted without discarding the observation's weather metrics; focused
weather/context tests, typecheck, lint, capped build, and the bounded suite
pass (**113 test files / 362 tests**).

## Realtime initial-poll outcome (2026-07-12)

Updated `src/app/api/realtime/route.ts` to run the existing bounded poll once
immediately after the connection event. The 30-second interval, overlap guard,
abort cleanup, rate limit, and stream headers remain unchanged. Focused
transport coverage, typecheck, lint, capped build, and the bounded suite pass
(**113 test files / 363 tests**).

## Fire-station provider geometry outcome (2026-07-12)

Updated `src/app/api/fire-stations/route.ts` so Overpass nodes are accepted only
inside the existing mainland query envelope (`36.5..42.2` latitude,
`-9.5..-6.2` longitude). Finite-but-invalid provider coordinates such as `0,0`
are dropped before publication; the curated fallback is intentionally unchanged
and continues to include island stations. Added the regression fixture in
`tests/lib/fire-stations-route.test.ts`. Focused station contracts, typecheck,
lint, capped build, diff check, and the bounded suite pass (**113 test files /
364 tests**).

## ANEPC provider geometry outcome (2026-07-12)

Updated `src/lib/anepc.ts` so the shared live-incident/ingest parser rejects
finite coordinates outside Portugal before normalization. Mainland, Madeira,
and Azores coordinate envelopes remain valid. Added regression coverage in
`tests/lib/anepc.test.ts`; focused ANEPC/data-route contracts, typecheck, lint,
capped build, diff check, and the bounded suite pass (**113 test files / 364
tests**).

## Regional-command geometry outcome (2026-07-12)

Updated `src/app/api/regional-commands/route.ts` so opt-in ArcGIS geometry
serialization rejects malformed coordinate leaves rather than coercing them to
zero. Compact command metadata and valid geometry remain unchanged. Added the
regression contract in `tests/lib/regional-commands-route.test.ts`; focused
regional-command contracts, typecheck, lint, capped build, diff check, and the
bounded suite pass (**113 test files / 365 tests**).

## FIRMS provider geometry outcome (2026-07-12)

Updated `src/app/api/satellite/route.ts` so the NASA FIRMS query covers the
actual western Portugal envelope (`-9.5`, including Lisbon) and finite CSV rows
outside that envelope are discarded before GeoJSON publication. Added an
out-of-envelope regression row to `tests/lib/satellite-route.test.ts`; focused
satellite contracts, typecheck, lint, capped build, diff check, and the bounded
suite pass (**113 test files / 365 tests**).

## Aerial bbox clipping outcome (2026-07-12)

Updated `src/lib/aerial/merge.ts` so radius-based ADS-B results and OpenSky
results are clipped to the caller's bbox before deduplication and GeoJSON
publication. Added `tests/lib/aerial-merge.test.ts` with an out-of-bounds
provider fixture; focused aerial contracts, typecheck, lint, capped build, diff
check, and the bounded suite pass (**114 test files / 366 tests**).

## Strict FIRMS parsing outcome (2026-07-12)

Updated `src/app/api/satellite/route.ts` with strict finite CSV numeric parsing
for FIRMS coordinates, rejecting partial numeric strings such as `38.72foo`
before spatial validation. Added malformed-coordinate regression coverage to
`tests/lib/satellite-route.test.ts`; focused satellite contracts, typecheck,
lint, capped build, diff check, and the bounded suite pass (**114 test files /
366 tests**).

## Core response-matrix outcome (2026-07-12)

Expanded `tests/lib/data-api-routes.test.ts` with malformed-success ANEPC
empty-state coverage and a redacted/no-store IPMA weather-failure contract.
The focused data-route matrix, typecheck, lint, capped build, diff check, and
the bounded suite pass (**114 test files / 368 tests**).

## Public report/municipality response-matrix outcome (2026-07-12)

Added populated aggregation coverage for `/api/municipalities`, reviewed-report
projection and public-limit clamping coverage for `/api/reports`, and a
redacted/no-store report-storage failure contract. `/api/reports` now projects
its public DTO explicitly after persistence reads, so extra adapter columns
cannot leak through the route response. Focused contracts, typecheck, lint,
capped build, diff check, and the bounded suite pass (**114 test files / 371
tests**).

## Open-Meteo risk-boundary outcome (2026-07-12)

Added `normalizeOpenMeteoSnapshot()` in `src/lib/risk/composite.ts` and
validated finite/range-safe weather metrics before composite scoring. Direct
`/api/risk` now returns a redacted `502`/`no-store` response for malformed
successful provider payloads. Batch `/api/incidents/risks` keeps its partial
contract with finite zeroed values and `dataQuality: "no_weather"`. Added unit,
direct-route, and batch-route regression coverage. Focused contracts, typecheck,
lint, capped build, diff check, and the bounded suite pass (**115 test files /
380 tests**).

## Dashboard geometry-boundary outcome (2026-07-12)

Reused the Portugal-region coordinate validator from `src/lib/anepc.ts` in the
dashboard live normalizer and database fallback. Invalid finite coordinates no
longer publish dashboard geometry or priority-card coordinates. Added live and
fallback regressions for `0,0`; focused contracts, typecheck, lint, capped
build, diff check, and the bounded suite pass (**115 test files / 382 tests**).

## IPMA forecast-envelope outcome (2026-07-12)

Added `src/lib/fire-risk/forecast-normalizer.ts` and wired it into
`/api/risk-fwi/[day]`. The route now validates the top-level `data` array and
known identifier, RCM, and date fields; malformed successful payloads return a
redacted retryable `502`/`no-store` envelope, while all-unusable rows become a
cacheable explicit empty state. Added normalizer and route regressions;
focused contracts, typecheck, lint, capped build, diff check, and the bounded
suite pass (**116 test files / 387 tests**).

## Aerial overlay-bbox outcome (2026-07-12)

Added response-envelope validation to `src/lib/aerial/overlay.ts`. The client
now validates the server bbox, filters finite aircraft points outside it, and
rejects malformed bbox metadata before MapLibre publication. Added focused
foreign-point and malformed-bbox regressions; typecheck, lint, capped build,
diff check, and the bounded suite pass (**116 test files / 389 tests**).

## IPMA weather-metrics outcome (2026-07-12)

Added `src/lib/weather/normalizer.ts` and wired it into `/api/weather`.
Required temperature, humidity, wind-speed, and direction metrics must now be
finite and within safe ranges; malformed observations are dropped, valid mixed
rows remain, and all-invalid timestamps return cacheable empty state. Added
normalizer, route, and incident-context regressions. Focused contracts,
typecheck, lint, capped build, diff check, and the bounded suite pass (**117
test files / 396 tests**).

## Strict FIRMS scalar-metrics outcome (2026-07-12)

NASA FIRMS `frp` and `bright_ti4` values now pass through strict finite,
non-negative numeric parsing in `src/app/api/satellite/route.ts`. Malformed,
infinite, and negative scalar rows are dropped before severity and display
values are derived; valid mixed rows remain and all-invalid payloads return the
existing cacheable empty state. Added regression coverage for partial, infinite,
negative, mixed, and all-invalid scalar values. Focused satellite/adapter
contracts, typecheck, lint, capped build, diff check, and the bounded suite pass
(**117 test files / 398 tests**).

## Target: ANEPC operational scalar normalization

### Dependents

- `src/app/api/incidents/route.ts`: publishes parsed ANEPC incidents to the
  core map and headline state.
- `src/lib/ingest.ts`: sends the same normalized incidents to persistence and
  the scheduled ingest path.
- `src/lib/anepc.ts`: shared parser and normalization boundary for both callers.

### Affected stories

- Core incident trust and source-freshness states must not publish fabricated
  personnel, asset, status-code, or duration values.
- The open endpoint response matrix must cover malformed successful provider
  payloads without changing healthy/empty/cache semantics.

### Test coverage before the change

- `tests/lib/anepc.test.ts`: geometry, raw-count, and valid-feature contracts;
  no valid-geometry/malformed-scalar coverage.
- `tests/lib/data-api-routes.test.ts`: healthy and invalid-geometry ANEPC route
  states; no mixed/all-invalid scalar coverage.
- `tests/lib/ingest.test.ts`: successful persistence path; no malformed scalar
  persistence guard.

### Risk: High

The shared parser feeds both the core read API and persistence; a malformed
scalar can distort severity, dashboard totals, and stored history across all
callers.

### Recommended action

Require strict finite, non-negative integer operational metrics at the shared
adapter boundary. Drop invalid rows while preserving valid mixed rows and the
raw provider count; keep the existing cache, error-redaction, and rate-limit
contracts unchanged.

## ANEPC operational-scalar outcome (2026-07-12)

`src/lib/anepc.ts` now rejects missing, partial, non-finite, negative, and
non-integer values for status code, personnel, assets, and duration before a
feature reaches `normalizeANepcFeature`. Numeric strings are accepted only when
they are complete finite non-negative integers; valid zero values remain valid.
Added adapter, `/api/incidents`, and ingest regressions. Typecheck, lint,
capped build, diff check, and the bounded suite pass (**117 test files / 402
tests**).

## ANEPC ingest fail-closed outcome (2026-07-12)

`runIngest()` now returns without invoking `persistIncidents` when the provider
collection is empty, when every feature is malformed, or when no valid fire
incidents remain. A non-empty all-invalid response records
`ANEPC response contained no valid features`, preventing persistence's stale-
incident auto-resolution from running on corrupted input. Added empty and
all-invalid ingest regressions; focused/full tests, typecheck, lint, capped
build, diff check, and preflight remain green (**117 test files / 404 tests**).

## ANEPC timestamp-integrity outcome (2026-07-12)

`ptDateToISO()` now accepts only complete Portuguese or ArcGIS-style ANEPC
timestamps and validates calendar/time ranges. Missing, malformed, or
impossible dates are dropped before freshness/confidence scoring; the old
current-time fallback is gone. `normalizeANepcFeature()` and both read/ingest
callers now handle the nullable parse boundary. Added adapter, incidents-route,
and ingest regressions. Focused/full tests, typecheck, lint, capped build, and
diff check pass (**117 test files / 407 tests**).

## ANEPC trust and ingest-completeness refinements (2026-07-12)

Lisbon-local ANEPC timestamps now convert through the `Europe/Lisbon` timezone
with summer/winter offsets; future freshness scores are capped at `1`, and
incident IDs require non-negative integers. `runIngest()` passes an explicit
completeness policy to persistence, preserving valid mixed-row upserts while
disabling stale-incident cleanup whenever provider rows were dropped or a
non-fire feature was present. Added DST, future-clock, ID, and partial-corruption
regressions. Focused/full tests, typecheck, lint, capped build, and diff check
pass (**117 test files / 410 tests**).

## ANEPC schema-drift diagnostic outcome (2026-07-12)

### Target

`src/lib/ingest.ts` returned a successful empty result with no diagnostic when
valid provider features normalized only to non-fire event types. The write
path was already fail-closed, but cron/health consumers could miss a changed
query or upstream schema.

### Dependents

- `src/lib/ingest.ts`: owns provider normalization, persistence gating, and
  operator-visible errors.
- `tests/lib/ingest.test.ts`: verifies non-fire payload handling without DB
  writes.

### Outcome

`runIngest()` now records
`ANEPC response contained no fire incidents after normalization` for a
non-empty structurally valid response with no fire event types. It still skips
`persistIncidents`, so a schema/query drift cannot resolve stale incidents.
The new regression is green. The full single-worker suite passes at **117 test
files / 411 tests**; typecheck, lint, capped build, diff check, and asset
preflight also pass.

## ANEPC geometry-shape boundary outcome (2026-07-12)

### Target

`src/lib/anepc.ts` could accept an explicitly non-point GeoJSON geometry when
property latitude/longitude fields were valid, silently canonicalizing a line
or polygon into an incident point.

### Outcome

The adapter now rejects a declared geometry type other than `Point` before
coordinate fallback. A missing geometry type remains accepted for compatibility
with the established property-coordinate fallback. `tests/lib/anepc.test.ts`
covers the non-point rejection and preserves the raw-count contract.
Focused shared-boundary coverage passes **41 tests**; the full suite passes
**117 test files / 411 tests**, with typecheck, lint, capped build, diff check,
and asset preflight green. The adapter test explicitly preserves the
missing-geometry property-coordinate fallback.

## Follow UI orchestration impact (2026-07-12)

### Target

- `src/lib/use-followed-incidents.ts`
- follow action wiring in `src/app/page.tsx`

### Dependents

- desktop and mobile incident detail surfaces consume `pendingIds` and the
  existing follow callback contract;
- page locale/toast ownership remains the user-facing failure boundary;
- `tests/lib/followed-incidents.test.ts` and existing responsive/i18n
  contracts cover the public shape.

### Outcome

Pending follow operations and browser-local persistence now live in the hook.
The hook protects same-task duplicate calls with a ref and microtask boundary,
uses a latest-set ref for overlapping IDs, rolls back failed writes, and
returns an applied/ignored result. The page retains localized toasts and
storage availability checks. Focused contracts pass 4 files / 9 tests; the
full suite passes 118 files / 413 tests; lint, typecheck, and capped build pass.

### Remaining gap

Playwright coverage for persistence across reload, rapid duplicate clicks, and
forced `localStorage.setItem` failure is now covered by
`tests/e2e/follow-state.test.ts`, which passed all three scenarios against a
fresh local server. The temporary server was stopped after verification.

## Notification state orchestration impact (2026-07-12)

### Target

- `src/lib/use-notifications.ts`
- notification state wiring in `src/app/page.tsx`

### Outcome

The local mock notification list, unread-count derivation, and mark-all-read
transition now live in a focused hook/pure helper. Existing drawer props and
navigation behavior are unchanged. `tests/lib/use-notifications.test.ts`
covers immutable mark-read behavior; the full suite passes 119 files / 414
tests, with lint, typecheck, and capped build green.

## Refresh lifecycle orchestration impact (2026-07-12)

### Target

- `src/lib/refresh-state.ts`
- refresh effect wiring in `src/app/page.tsx`

### Outcome

Refresh outcome classification is now a pure typed boundary. It resolves only
after an active request has settled with a fetch timestamp at or after the
request start, prioritizes explicit errors, and leaves stale/idle states
pending. Manual and awaitable refetch callbacks clear stale error/loading state
before scheduling a new generation, while the `previousRefetchedAt` identity
guard prevents an unchanged `Date` object from resolving a retry. The page
retains refetch and toast ownership. Focused refresh/mobile contracts, the
mobile refresh retry browser flow, and the full suite pass at 120 files / 419
tests; lint, typecheck, and capped build are green.
## Target

Extract the keyboard-shortcut and shortcuts-panel focus lifecycle currently
embedded in `src/app/page.tsx` into a typed, focused hook without changing
global overlay ownership, search focus behavior, incident-focus Escape handling,
or the existing `showShortcuts` Zustand state.

## Dependents (4 relevant boundaries)

- `src/app/page.tsx`: owns the shortcut actions, selected incident, refresh,
  follow, overlay close, and incident-focus callbacks.
- `src/store/ui-store.ts`: owns `showShortcuts` and its setter/reset behavior.
- `src/components/filters/filters-panel.tsx`: consumes the search input ref
  that the `/` shortcut focuses.
- `src/lib/focus-trap.ts` / `src/lib/blocking-overlay.ts`: shared focus and
  Escape primitives that must remain unchanged and compatible.

## Affected stories

- Frontend orchestration debt: move a self-contained global interaction
  lifecycle out of the oversized page while keeping typed action ownership in
  the page.
- Accessibility/reliability: preserve shortcut focus restoration, modal focus
  trapping, Escape ordering, and input typing guards.

## Test coverage

- `tests/lib/focus-trap.test.ts`: pure tab-cycle behavior.
- `tests/lib/blocking-overlay.test.ts` and
  `tests/lib/overlay-escape-contract.test.ts`: shared overlay Escape rules.
- `tests/e2e/responsive-interactions.test.ts` and
  `tests/e2e/incident-focus.test.ts`: browser Escape/focus and incident-focus
  behavior.
- Gap: no focused contract covers the page shortcut action routing or
  shortcuts-panel focus restoration in isolation.

## Risk: Medium

The feature has one page caller but fans into global keydown listeners, focus
restoration, overlay precedence, and map/incident actions; a small ordering
change can make emergency controls or keyboard navigation unreliable.

## Recommended action

Add tests first for the pure shortcut-routing boundary and the hook's listener
ownership, then extract only the two page effects plus their refs. Keep action
callbacks injected, leave `focus-trap.ts` untouched, and run focused browser
proof before the bounded full suite.
## Target

Extract the keyboard-shortcut and shortcuts-panel focus lifecycle currently
embedded in `src/app/page.tsx` into a typed, focused hook without changing
global overlay ownership, search focus behavior, incident-focus Escape handling,
or the existing `showShortcuts` Zustand state.

## Dependents (4 relevant boundaries)

- `src/app/page.tsx`: owns the shortcut actions, selected incident, refresh,
  follow, overlay close, and incident-focus callbacks.
- `src/store/ui-store.ts`: owns `showShortcuts` and its setter/reset behavior.
- `src/components/filters/filters-panel.tsx`: consumes the search input ref
  that the `/` shortcut focuses.
- `src/lib/focus-trap.ts` / `src/lib/blocking-overlay.ts`: shared focus and
  Escape primitives that remain unchanged and compatible.

## Affected stories

- Frontend orchestration debt: move a self-contained global interaction
  lifecycle out of the oversized page while keeping typed action ownership in
  the page.
- Accessibility/reliability: preserve shortcut focus restoration, modal focus
  trapping, Escape ordering, and input typing guards.

## Test coverage

- `tests/lib/focus-trap.test.ts`: pure tab-cycle behavior.
- `tests/lib/blocking-overlay.test.ts` and
  `tests/lib/overlay-escape-contract.test.ts`: shared overlay Escape rules.
- `tests/e2e/responsive-interactions.test.ts` and
  `tests/e2e/incident-focus.test.ts`: browser Escape/focus and incident-focus
  behavior.
- Gap before this slice: no focused contract covered page shortcut action
  routing or shortcuts-panel focus restoration in isolation.

## Risk: Medium

The feature has one page caller but fans into global keydown listeners, focus
restoration, overlay precedence, and map/incident actions; a small ordering
change can make emergency controls or keyboard navigation unreliable.

## Recommended action

Add tests first for the pure shortcut-routing boundary and the hook's listener
ownership, then extract only the two page effects plus their refs. Keep action
callbacks injected, leave `focus-trap.ts` untouched, and run focused browser
proof before the bounded full suite.

## Outcome (2026-07-12)

Implemented `src/lib/keyboard-shortcuts.ts` and
`src/lib/use-keyboard-shortcuts.ts`. The page now injects action callbacks while
the hook owns global listener setup, input/select/contenteditable guards,
Escape ordering, focus trap, and opener restoration. `focus-trap.ts` now
handles container focus on both Tab directions, and latest-action refs keep the
global listener mounted across page renders. Pure routing/ownership contracts
and a fresh browser flow for `?`, Escape, and `/` pass. The full suite passes
**122 test files / 425 tests**; lint, typecheck, capped build, diff check, and
asset preflight are green.
## Client incident payload boundary target

Prevent one malformed successful `/api/incidents` row from throwing inside
`presentIncident`, the page-wide live incident adapter, or the operational
GeoJSON builder.

### Dependents and risk

- `src/lib/use-app-data.ts` owns the live incident hook and was mapping the
  untrusted `incidents` array directly into the legacy UI model.
- `src/lib/incident-client.ts` now owns the strict client DTO normalizer and
  the isolated live-to-UI adapter.
- `src/lib/anepc.ts` supplies the shared Portugal coordinate contract used by
  server ingestion and the client boundary.
- `src/lib/data-state.ts` exposes the existing strict ISO timestamp validator
  so incident timestamps and trust metadata share the same calendar rules.
- `tests/lib/incident-client.test.ts` covers malformed nested objects,
  geometry, enums, timestamps, scalars, mixed retention, empty behavior, and
  finite Portugal GeoJSON output.

Risk is **high** because this is the primary incident map/page path: one bad
row could previously poison the entire render. The invariants are: only
validated LiveIncident values reach the adapter, invalid rows never reach
GeoJSON, valid mixed rows remain visible, and no global map/fallback behavior
changes.

## Outcome (2026-07-13)

Added `normalizeLiveIncident()` and `normalizeLiveIncidents()` with strict
required-field, nested property, trust, enum, timestamp, scalar, and Portugal
Point validation. Moved the UI adapter into the same focused module and made
`useLiveIncidentsNew()` normalize before mapping; absent/non-array/all-invalid
payloads remain safe empty collections while the existing hook fallback path is
preserved.

The focused incident-client gate passes **5 files / 41 tests**; full ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The full
single-worker suite passes **125 test files / 506 tests** with a 1.5 GB heap
cap. The build emits the existing multiple-lockfile workspace-root warning but
completes successfully.

## Service-worker cache correctness target

Prevent public offline/static caches from storing origin errors or treating
cache entries without trustworthy freshness metadata as permanently fresh.

### Dependents and risk

- `public/sw.js` owns same-origin navigation fallback, static cache-first/
  stale-while-revalidate behavior, activation cleanup, and API/cross-origin
  bypasses.
- `tests/lib/service-worker-runtime.test.ts` now exercises non-OK navigation,
  stale/no-Date assets, refresh success/failure, cache-write rejection,
  deterministic static 503 behavior, and activation cleanup.
- `tests/lib/service-worker-contract.test.ts` protects the API bypass and
  returned/caught cache-write promise contract.

Risk is **medium** because a poisoned navigation or static cache can leave
users on an origin error or stale shell during an emergency, but the change is
isolated to the worker's existing branches. The invariants are: only 2xx
responses are cached, stale content remains last-known-good, cache refresh
failures are contained, and APIs/cross-origin/Next static assets remain
network-owned.

## Outcome (2026-07-13)

Navigation caching now checks `response.ok`; static cache age requires a valid
non-future `Date` within the 30-day window, with missing/malformed dates treated
as stale and revalidated. Non-OK uncached static fetches return a 503 offline
response, refresh network/cache-write failures are caught, and activation
cleanup is runtime-tested.

The focused service-worker gate passes **2 files / 10 tests**; full ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The full
single-worker suite passes **125 test files / 513 tests** with a 1.5 GB heap
cap. The build emits the existing multiple-lockfile workspace-root warning but
completes successfully. Remaining low-risk items are joining navigation cache
writes to `event.waitUntil` and narrowing activation deletion to Lumes-owned
cache names.

## MapLibre style restoration lifecycle target

Prevent rapid dark/light/satellite changes, initial-load prop changes, and
unmounts from allowing stale `style.load` callbacks or delayed optional-layer
timers to target the wrong MapLibre style.

### Dependents and risk

- `src/components/ember-map.tsx` owns the single MapLibre instance, core
  source/layer replay, style readiness, satellite raster restoration, and map
  interaction defaults.
- `src/components/advanced-layers-host.tsx` remounts optional biomass/risk/
  aerial hosts after a style replacement.
- `src/lib/map/style-transition.ts` owns the tested generation and deferred
  restore cancellation boundaries.
- `src/lib/map/map-events.ts` now includes a transition-start signal so
  optional layers are removed before `setStyle` and reattached only after the
  latest restore.

Risk is **high** because a stale callback could mark the operational map ready
against the wrong style or create duplicate sources/layers during an emergency.
The invariants are: latest style wins, one restore event per committed
transition, stale callbacks no-op, optional remounts are cancellable, and the
default 2D controls remain unchanged.

## Outcome (2026-07-13)

Added a generation-guarded style transition controller, guarded core/satellite
callbacks, initial-load reconciliation through a `mapLoaded` dependency, and
transition-start cancellation for advanced-layer remounts. Added focused pure
controller/scheduler tests and source contracts for replay/listener/event
ownership.

The focused gate passes **4 files / 12 tests**; the complete map contract
suite passes **15 files / 44 tests**; full ESLint, TypeScript, and
`git diff --check` pass. The full single-worker suite passes **127 test files /
523 tests** with a 1.5 GB heap cap. The current production build was not run
to avoid overlapping unrelated heavy workspace processes. Low-risk follow-ups
are a real MapLibre event-emitter ordering test and `setStyle` error/timeout
fallback.

## MapLibre style-load recovery target

Bound style replacement and initial style loading so a stalled or failed
provider cannot leave the operational map indefinitely unready.

### Dependents and invariants

- `src/lib/map/style-transition.ts` owns the generation-aware target/fallback
  runtime, narrow style-error classification, timeout, rollback, and cleanup.
- `src/components/ember-map.tsx` owns the last committed style, core replay,
  readiness state, initial watchdog, and explicit `recovered`/
  `retryable-error` DOM state.
- `tests/lib/map-style-transition.test.ts` uses a fake event emitter/timer to
  prove target success, timeout/error rollback, stale callback suppression,
  rollback failure, and disposal.

The invariants are: one fallback attempt per generation, no readiness before
core replay, no duplicate restore commit, tile/source errors do not trigger a
style rollback, initial failure becomes bounded retryable state, and the
default 2D map controls remain unchanged.

## Outcome (2026-07-13)

Implemented the bounded style runtime and initial watchdog. Target
`style.load` commits once; style-propagated errors or timeout roll back once;
rollback failure leaves the map in explicit `retryable-error`; successful
fallback remains operational and is marked `recovered`. Stale callbacks and
unmount cleanup are covered by generation/listener/timer guards.

The focused gate passes **4 files / 17 tests**; the complete map contract
suite passes **15 files / 50 tests**; TypeScript, ESLint, and
`git diff --check` pass. The full single-worker suite passes **127 test files /
528 tests** with a 1.5 GB heap cap. Low-risk follow-up: URL errors lacking a
propagated MapLibre `style` payload now match the active target/fallback URL
for immediate rollback; unrelated source/tile errors remain timeout-bounded.

## MapLibre style URL-error classification outcome (2026-07-13)

Extended `isStyleLoadError()` and the transition runtime to accept a structured
`error.url` matching the active target/fallback style. Diff-mode basemap URL
failures now roll back immediately, while source/tile and unknown errors remain
ignored until the bounded timeout.

The focused map/style gate remains **4 files / 17 tests**; typecheck, ESLint,
`git diff --check`, and the full single-worker suite (**127 files / 528 tests**)
pass.

## Client incident response envelope target

Prevent malformed successful `/api/incidents` envelopes from presenting
misleading live counts, distributions, or synthetic incidents in the map.

### Dependents and invariants

- `src/lib/incident-client.ts` owns the untrusted response DTO boundary and
  row normalizer before `presentIncident()` or GeoJSON adaptation.
- `src/lib/use-app-data.ts` owns the stable `useFetch` transform and fallback
  policy for the live incident hook.
- `tests/lib/incident-client.test.ts` covers source metadata, count/raw totals,
  distribution totals, optional metrics, mixed/all-invalid rows, true empty
  responses, and transform failures.
- `tests/lib/use-app-data-contract.test.ts` covers stable transform wiring and
  the rule that synthetic samples are not shown over a valid empty/retained
  response.

The invariants are: only a complete validated envelope reaches the map; count
and distribution totals agree with normalized rows; all-invalid non-empty
successes are retryable; true empty is explicit; and a malformed refresh never
replaces valid data with synthetic fires.

## Outcome (2026-07-13)

Added `LiveIncidentResponse`, `normalizeIncidentResponse()`, and the stable
`transformIncidentResponse()` in `src/lib/incident-client.ts`. The hook now
normalizes the complete envelope before adaptation. Required source metadata,
ISO timestamps, raw/count totals, optional cache/latency fields, distribution
maps, and nested rows are bounded; count/distribution mismatches fail closed.
The fallback selector now requires `r.data === null`, preserving explicit
empty and retained live responses during refresh failures.

The focused client/hook gate passes **2 files / 42 tests**; full ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The full
single-worker suite passes **127 test files / 550 tests** with a 1.5 GB heap
cap. The build emits the existing multiple-lockfile workspace-root warning.

## History client boundary and selection ownership continuation outcome (2026-07-13)

The persisted `/api/history` payload now crosses a strict client boundary in
`src/lib/history-view.ts`. Rows validate identifiers, Portugal coordinates,
canonical status/severity/event values, finite bounded resources, confidence,
optional text fields, and all timestamps; the envelope validates count/total
invariants and preserves an explicit empty response. Mixed valid rows remain
usable, while a non-empty all-invalid response becomes a retryable transform
failure. `useHistoryNew()` supplies that stable transform to `useFetch`, and
the modal now uses the bounded shared hook with a retryable section error rather
than an unbounded `limit=500` fetch.

Historical selection is page-owned: modal and mobile recent-history rows pass
the full validated row, `adaptHistoryToIncident()` produces the existing detail
model, and live priority rows remain on the live incident callback. This keeps
historical detail selection from being rejected as a missing live incident and
prevents the history callback from receiving live rows.

The focused history gate passes **4 files / 30 tests**; the full single-worker
suite passes **128 test files / 573 tests** with a 1.5 GB heap cap. ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The build
retains the existing multiple-lockfile workspace-root warning. The dashboard
receives history before the modal opens, the modal reuses that all-history
request, status-filtered views fetch only their scoped data, and the header
shows the shared trust state. True empty history now has dedicated copy, and
historical detail explicitly marks IPMA risk as unavailable instead of showing
a fabricated value. `tests/e2e/history-lifecycle.test.ts` passes against an
isolated local production server with route-intercepted empty, retryable-error,
and valid-selection fixtures; it verifies empty/error/fresh trust states,
retry recovery, and historical detail opening. No remaining P1/P2 history
implementation blocker is known.

## Service-worker cache follow-up outcome (2026-07-13)

Navigation cache writes are now joined to `event.waitUntil` with caught
rejection handling, and activation deletes only cache keys owned by Lumes.
The focused service-worker gate passes **2 files / 11 tests**; the full suite
passes **127 files / 550 tests** with the capped build, typecheck, ESLint, and
diff checks green.

## Dashboard-local Following filter

### Target

Add a dashboard activity view for browser-local followed incidents without
changing global map/query filter semantics.

### Dependents

- `src/components/dashboard/DashboardPanel.tsx`: activity tabs and visible
  incident list.
- `src/lib/use-followed-incidents.ts`: browser-local followed-ID set and the
  pure visibility filter.
- `src/lib/i18n.ts`: localized tab label.
- `tests/lib/followed-incidents.test.ts`: filter and wiring contracts.
- `tests/e2e/following-filter.test.ts`: tablet row and empty-state behavior.

### Invariants

- Only incidents already in the dashboard's current visible set are shown.
- Stale local IDs do not create synthetic rows.
- The feature does not add `following` to `IncidentFilterState` or URL state.
- Empty followed state is explicit and localized.

### Outcome (2026-07-13)

Implemented `filterFollowedIncidents()` and a dashboard-local `Following`
activity tab with count, row identifiers, and dedicated empty copy. Focused
coverage passes **4 files / 18 tests** plus the tablet Playwright gate; ESLint,
TypeScript, and `git diff --check` pass. The unread-since-last-visit flow is
not implied by this change and remains open pending read-state timestamps.

## MapLibre style event-order browser proof

### Target

Prove the generation-guarded style lifecycle settles on the latest theme after
a real browser reversal, not only through unit/static contracts.

### Dependents

- `src/components/ember-map.tsx`: the single MapLibre style owner.
- `src/lib/map/style-transition.ts`: transition runtime and failure policy.
- `tests/e2e/map-style-lifecycle.test.ts`: real-browser dark/light reversal.

### Outcome (2026-07-13)

The bounded 1280×800 reduced-motion browser gate passes against a temporary
Lumes dev server. Dark→light and immediate light→dark reversal settle as
`ready`/`recovered`; the map remains ready and never ends in
`retryable-error`. The temporary server was stopped after the gate, and no
production build or deployment was performed.

## Following truthfulness and historical follow guard (2026-07-13)

### Targets

- Dashboard-local Following empty-state semantics.
- Historical detail ownership of live-only follow controls.

### Dependents

- `src/components/dashboard/DashboardPanel.tsx`
- `src/components/detail/IncidentDetailPanel.tsx`
- `src/app/page.tsx`
- `src/lib/i18n.ts`
- `tests/lib/followed-incidents.test.ts`
- `tests/lib/history-modal-contract.test.ts`
- `tests/e2e/following-filter.test.ts`
- `tests/e2e/history-lifecycle.test.ts`

### Invariants

- A non-empty followed-ID set never renders copy claiming that nothing is
  followed merely because active filters hide all matching rows.
- Clearing filters is explicit; selecting Following does not mutate global
  map/query state or URL serialization.
- Historical (`isLive: false`) records cannot be followed or display a stale
  followed badge/local-alert explanation.

### Outcome

Implemented separate no-followed and no-followed-match states with PT/EN copy
and a clear-filters affordance. Gated the complete follow affordance block for
historical detail records. Focused contracts, typecheck, lint, diff check, and
isolated tablet/phone Following plus history lifecycle browser gates pass.

## Incident-news client boundary (2026-07-13)

### Target

Protect `IncidentDetailPanel` from malformed successful payloads returned by
`/api/incidents/:id/news`.

### Dependents

- `src/lib/incident-news-client.ts`
- `src/lib/use-app-data.ts`
- `src/components/detail/IncidentDetailPanel.tsx`
- `tests/lib/incident-news-client.test.ts`
- `tests/lib/use-app-data-contract.test.ts`
- `tests/lib/incident-news-route.test.ts`

### Invariants

- Only bounded, non-empty incident IDs and article fields reach the panel.
- Article links are HTTP(S) URLs; timestamps and categories are validated.
- Declared count must match normalized rows; malformed non-empty payloads are
  retryable rather than silently presented as healthy.
- Valid mixed rows remain usable when the provider count matches.

### Outcome

Implemented `normalizeIncidentNewsResponse()` and the stable
`transformIncidentNewsResponse()` hook boundary. Focused client, hook-contract,
and route checks pass; typecheck, lint, and diff validation pass.

## Following read state (2026-07-13)

### Target

Complete the public browser-local "new updates since last visit" flow without
changing server, map-filter, or URL ownership.

### Dependents

- `src/lib/followed-read-state.ts`
- `src/lib/use-followed-incidents.ts`
- `src/components/dashboard/DashboardPanel.tsx`
- `src/app/page.tsx`
- `src/lib/i18n.ts`
- `tests/lib/followed-read-state.test.ts`
- `tests/lib/followed-incidents.test.ts`
- `tests/e2e/following-filter.test.ts`

### Invariants

- Read state is browser-local and separate from the followed-ID set.
- A follow establishes the current provider `lastUpdated` as the baseline.
- Only a newer valid provider timestamp creates an unread item.
- Entering Following marks visible followed rows read and persists that state.
- Invalid storage fails closed without fabricating unread updates.

### Outcome

Implemented pure normalization/comparison/mark-seen helpers and integrated them
into the followed-incidents hook and dashboard. Tablet and phone expose an
unread badge; the browser gate proves old baseline → unread → mark seen →
persistent read state. Focused contracts, typecheck, lint, and diff validation
pass.

## Bounded screenshot/accessibility review (2026-07-13)

### Target

Review the map-first desktop/phone UI in dark/light themes and reduced motion,
including the public report dialog, without broadening into deployment work.

### Dependents

- `src/components/mobile/map-peek.tsx`
- `tests/lib/map-peek.test.ts`
- `src/components/reports/report-fire-modal.tsx`
- `src/components/mobile/mobile-view.tsx`

### Outcome

Captured and inspected 1280×800 desktop and 390×844 phone states in both
themes. No unnamed visible controls were found; the report dialog received
focus and closed on Escape. A concrete copy defect in the compact map summary
was corrected: the active count now reads `active/ativos`, with visible total
remaining separate. The focused unit test, lint, typecheck, diff check, and
bounded screenshot/keyboard checks pass. Full browser matrix/build remains
deferred under current memory pressure.

## News client response boundary (2026-07-13)

### Target

Protect `NewsSection` from malformed successful `/api/news` envelopes and
rows while preserving the route’s intentional count/display semantics.

### Dependents

- `src/lib/news-client.ts`
- `src/lib/use-app-data.ts`
- `src/components/news-section.tsx`
- `src/app/api/news/route.ts`
- `tests/lib/news-client.test.ts`
- `tests/lib/use-app-data-contract.test.ts`
- `tests/lib/news-route.test.ts`
- `tests/lib/news-route-failure.test.ts`

### Invariants

- Required envelope fields, arrays, bounded text, ISO timestamps, categories,
  and `dataState` metadata are validated before rendering.
- `sourceUrl` is absolute HTTP(S); `href` is either absolute HTTP(S) or a
  same-origin relative path used by incident rows.
- Valid mixed rows remain usable; a non-empty array with no valid rows fails
  closed; duplicate rendered IDs are rejected.
- `counts.press` is the full RSS pool while `press` is filtered/truncated, so
  the boundary allows `counts.press >= matched.length + press.length`.

### Outcome

Added `normalizeNewsResponse()` and the stable `transformNewsResponse()` hook
transform. The focused route/client/hook gate passes **4 files / 21 tests**;
ESLint, TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain open.

## Weather client response boundary (2026-07-13)

### Target

Protect weather summaries and incident enrichment from malformed successful
`/api/weather` envelopes while preserving IPMA provider freshness and the
existing public response DTO.

### Dependents

- `src/lib/weather-client.ts`
- `src/lib/use-app-data.ts`
- `src/lib/weather-summary.ts`
- `src/lib/incident-context.ts`
- `src/app/page.tsx`
- `tests/lib/weather-client.test.ts`
- `tests/lib/use-app-data-contract.test.ts`
- `tests/lib/data-api-routes.test.ts`
- `tests/lib/source-health.test.ts`

### Invariants

- `source`, `fetchedAt`, provider timestamp, count, and observation arrays
  are validated before consumer calculations.
- Required station metrics keep the server’s finite/range semantics; missing
  station coordinates remain valid because IPMA metadata can omit them.
- The explicit empty state uses `timestamp: ""` and `count: 0`; healthy rows
  must share the response provider timestamp.
- Mixed valid rows survive when the declared count matches; all-invalid
  non-empty rows, malformed freshness metadata, and invalid cached flags fail
  closed.

### Outcome

Added `normalizeWeatherResponse()` and the stable `transformWeatherResponse()`
hook transform. The focused weather/client/API/source-health gate passes **4
files / 48 tests**; ESLint, TypeScript, and `git diff --check` pass. Full
suite/build and provider/deployment gates remain open.

## Fire-risk client response boundary (2026-07-13)

### Target

Protect the fire-risk map overlay and nearest-risk incident context from
malformed successful `/api/fire-risk` envelopes without changing the provider
route or public DTO.

### Dependents

- `src/lib/fire-risk-client.ts`
- `src/lib/use-app-data.ts`
- `src/components/map/map-data-adapter.ts`
- `src/lib/incident-context.ts`
- `src/app/page.tsx`
- `tests/lib/fire-risk-client.test.ts`
- `tests/lib/use-app-data-contract.test.ts`
- `tests/lib/data-api-routes.test.ts`
- `tests/lib/risk-route.test.ts`
- `tests/lib/risk-composite.test.ts`

### Invariants

- `source`, `fetchedAt`, data strings, counts, records, distribution, labels,
  and optional trust metadata are bounded and typed.
- Records stay within Portugal and RCM 0–5; count and distribution totals
  agree with normalized rows, and municipality keys are unique.
- Mixed valid rows survive when counts match; all-invalid non-empty rows,
  duplicate keys, malformed metadata, and invalid cached flags fail closed.
- Explicit empty risk state remains cache-compatible and renderable.

### Outcome

Added `normalizeFireRiskResponse()` and the stable `transformFireRiskResponse()`
hook transform. The focused fire-risk/client/API gate passes **5 files / 47
tests**; ESLint, TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain open.

## Dashboard client response boundary (2026-07-13)

### Target

Protect page-wide dashboard metrics and priority selection from malformed
successful `/api/dashboard` envelopes without changing server aggregation or
fallback behavior.

### Dependents

- `src/lib/dashboard-client.ts`
- `src/lib/use-app-data.ts`
- `src/lib/dashboard-metrics.ts`
- `src/app/page.tsx`
- `tests/lib/dashboard-client.test.ts`
- `tests/lib/use-app-data-contract.test.ts`
- `tests/lib/dashboard-fallback.test.ts`
- `tests/lib/dashboard-failure.test.ts`
- `tests/lib/data-api-routes.test.ts`

### Invariants

- Summary counters, distributions, priority rows, persistence counters,
  timestamps, and `dataState` are validated before consumers render them.
- Status/severity values, non-negative numeric semantics, Portugal coordinates,
  and duplicate priority IDs are enforced.
- Status distributions agree with the summary total; truncated by-type
  distributions may remain a subset of the total.
- Explicit empty/fallback states remain renderable; malformed successful
  payloads become retryable transform failures.

### Outcome

Added `normalizeDashboardResponse()` and the stable `transformDashboardResponse()`
hook transform. The focused dashboard/client/API gate passes **5 files / 49
tests**; ESLint, TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain open.

## Fire-stations client response boundary (2026-07-13)

### Target

Protect the lazy OSM station overlay from malformed successful
`/api/fire-stations` responses while preserving healthy/fallback provenance.

### Dependents

- `src/lib/fire-stations-client.ts`
- `src/lib/use-app-data.ts`
- `src/components/map/map-data-adapter.ts`
- `src/components/ember-map.tsx`
- `tests/lib/fire-stations-client.test.ts`
- `tests/lib/fire-stations-route.test.ts`
- `tests/lib/source-health.test.ts`
- `tests/lib/use-app-data-contract.test.ts`

### Invariants

- Source, freshness, count, station arrays, coordinates, IDs, optional text,
  and `dataState` metadata are validated before feature construction.
- Portugal mainland and island fallback coordinates are accepted; duplicate
  station IDs and malformed non-empty rows fail closed.
- Healthy, fallback, and explicit empty states remain distinguishable.

### Outcome

Added `normalizeFireStationsResponse()` and the stable
`transformFireStationsResponse()` hook transform. The focused
station/client/source-health gate passes **4 files / 25 tests**; ESLint,
TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain open.

## Continuation verification (2026-07-13)

The capped single-worker full suite passes **136 files / 655 tests** after the
filter-ownership contract was aligned with the Following clear-filters
callback. Repository-wide ESLint, TypeScript, `git diff --check`, and the
capped production build pass. The build retains the existing multiple-lockfile
workspace-root warning and tests retain the known Prisma engine fallback.
Deployment, provider access, and production HTTPS/cache/restart checks remain
open.

## Persistence-stats client response boundary (2026-07-13)

### Target

Protect dashboard persistence counters from malformed successful `/api/stats`
JSON without changing server aggregation, caching, or empty-state semantics.

### Dependents

- `src/lib/persistence-stats-client.ts`
- `src/lib/use-app-data.ts`
- `src/app/api/stats/route.ts`
- `src/app/page.tsx`
- `tests/lib/persistence-stats-client.test.ts`
- `tests/lib/stats-route.test.ts`
- `tests/lib/api-contract-matrix.test.ts`
- `tests/lib/use-app-data-contract.test.ts`

### Invariants

- Total, active, resolved, and snapshot counters are bounded non-negative
  integers and active/resolved cannot exceed total.
- `fetchedAt` is an ISO timestamp; optional `dataState` remains normalized.
- Empty state is explicit and only valid with a zero total.
- Malformed successful envelopes become retryable transform failures.

### Outcome

Added `normalizePersistenceStatsResponse()` and the stable
`transformPersistenceStatsResponse()` hook transform. The focused
stats/client/API/hook gate passes **4 files / 34 tests**; targeted lint,
TypeScript, and `git diff --check` pass. Full suite/build and
provider/deployment gates remain tracked separately.

## Notification trigger parity (2026-07-13)

### Target

Make browser-local unread notification state visible and truthful on mobile
without changing server/provider ownership or the desktop notification bell.

### Dependents

- `src/lib/notification-presentation.ts`
- `src/lib/i18n.ts`
- `src/lib/use-notifications.ts`
- `src/components/mobile/mobile-view.tsx`
- `src/components/detail/IncidentDetailPanel.tsx`
- `src/app/page.tsx`
- `tests/lib/mobile-notification-badge.test.ts`
- `tests/lib/notification-presentation.test.ts`
- `tests/lib/use-notifications.test.ts`
- `tests/e2e/responsive-interactions.test.ts`

### Invariants

- Only positive integer unread counts render a mobile badge; zero/invalid
  values render no badge.
- The page-owned count is the sole mobile badge source; desktop bell behavior
  remains unchanged.
- Drawer strings are localized through the shared catalog, empty collections
  are explicit, and mark-all cannot run when there is nothing unread.
- No server history, provider API, or notification persistence ownership is
  introduced.

### Outcome

Added the mobile notification badge and localized/truthful drawer states.
Focused tests pass **3 files / 5 tests**. Reduced-motion phone/tablet browser
scenarios pass; the desktop scenario remains incomplete at the existing
15-second incident readiness timeout.

## Community-report submission boundary (2026-07-13)

### Target

Prevent the public report form from treating malformed or partial `/api/reports`
POST bodies as successful while preserving the existing route and moderation
ownership.

### Dependents

- `src/lib/community-report-client.ts`
- `src/components/reports/report-fire-modal.tsx`
- `src/lib/public-actions.ts`
- `src/app/api/reports/route.ts`
- `tests/lib/community-report-client.test.ts`
- `tests/lib/report-modal-client-contract.test.ts`
- `tests/lib/public-actions.test.ts`

### Invariants

- Successful acknowledgements contain bounded IDs, the `pending_review` status,
  a bounded message, and valid optional `dataState` metadata.
- Non-OK responses remain failures; malformed bodies fail closed.
- The client does not reflect arbitrary reporter data or invent upload/storage
  ownership.

### Outcome

Added `normalizeCommunityReportSubmitResponse()` and
`submitCommunityReport()`, then moved modal submission through that boundary.
The focused report-client/modal/action gate passes **3 files / 9 tests**;
targeted lint, TypeScript, and `git diff --check` pass. Attachments,
retention, moderation identity, and provider/deployment gates remain open.

## Continuation verification after notification/report slices (2026-07-13)

The capped single-worker suite passes **146 files / 702 tests**. Repository
ESLint, TypeScript, `git diff --check`, and the capped production build pass.
The six-viewport responsive browser matrix also passes after adding a scoped,
deterministic incident fixture and an explicit healthy-empty Situation marker.
The build retains the multiple-lockfile workspace warning and tests retain the
known Prisma engine fallback.

## Optional-source client boundaries (2026-07-13)

The weather-warnings, satellite, regional-commands, and source-health hooks now
normalize successful response envelopes before page, map, or source-health
consumers use them. Counts, timestamps, provenance, geometry, Portugal bounds,
duplicates, optional `dataState` metadata, and explicit empty/fallback states
are bounded; malformed successful payloads fail closed while valid mixed rows
remain usable. Focused client/API/hook gates, repository lint, TypeScript,
diff validation, the six-viewport responsive matrix, and the full capped suite
pass.

## Deterministic responsive readiness fixture (2026-07-13)

The responsive browser matrix now scopes a test-only `/api/incidents` fixture
to its own context before navigation. The fixture has strict Portuguese
coordinates, matching counts/distributions, and official trust metadata, while
all other API requests retain their normal behavior. The healthy empty
Situation branch exposes an explicit test ID, removing the previous desktop
readiness dependence on live provider timing.

## Incident-timeline client response boundary (2026-07-13)

### Target

Prevent malformed successful timeline payloads from being silently converted
into plausible incident snapshot rows while preserving the existing detail
panel behavior.

### Dependents

- `src/lib/incident-timeline-client.ts`
- `src/components/detail/IncidentDetailPanel.tsx`
- `tests/lib/incident-timeline-client.test.ts`
- `tests/lib/incident-timeline-route.test.ts`
- `tests/lib/incident-timeline-ui-contract.test.ts`
- `tests/e2e/mobile-refresh-and-timeline.test.ts`

### Invariants

- Requested and returned incident IDs match.
- Count equals normalized snapshot cardinality; IDs are unique and bounded.
- Timestamp, status, severity, resource metrics, and optional `dataState`
  metadata are validated.
- Empty responses remain explicit and valid; malformed success responses fail
  closed into the existing retry/error state.

### Outcome

Added the stable timeline client transform and moved the timeline tab through
it. Focused tests pass **3 files / 11 tests**, targeted lint, TypeScript, and
`git diff --check` pass, and the browser refresh/timeline recovery flow passes
against a bounded local dev server.

## Newsletter client response boundary (2026-07-13)

### Target

Keep malformed or partial newsletter subscription responses from presenting a
false success while preserving the public form and server ownership.

### Outcome

Added `normalizeNewsletterSubscribeResponse()` and
`submitNewsletterSubscription()`. The focused newsletter client gate passes
**1 file / 4 tests**, with targeted lint, TypeScript, and diff validation green.
The prior standalone browser attempt used a stale artifact and is not treated
as current product evidence; attachment/provider/deployment ownership is
unchanged.

## Aerial data-state consistency (2026-07-13)

### Target

Require optional aerial response metadata to agree with the normalized feature
cardinality without changing the existing layer recovery behavior.

### Outcome

The aerial overlay transform now fails closed for invalid metadata or
`empty`/`healthy` cardinality mismatches. The focused aerial gate passes
**4 files / 20 tests**, with targeted lint, TypeScript, and diff validation
green.

## Latest continuation verification (2026-07-13)

The capped single-worker suite records **148 files / 712 tests**. The incident
timeline browser recovery flow passes. Provider/deployment/restart/HTTPS-cache
verification, community attachment storage and moderation, and 3D
provider/building/terrain work remain explicitly open rather than inferred
from local tests.

## Standalone asset materialization (2026-07-13)

### Target

Ensure the flattened standalone production artifact serves the client chunks
and public files required for hydrated browser behavior.

### Outcome

`deploy/flatten-standalone.js` now copies `.next/static` and `public/` into
the nested standalone app directory after creating the stable server link.
The fresh standalone public browser gate passes **4/4** 320/390px dark/light
newsletter and status scenarios; the prior 404/MIME failure is resolved at
the artifact layer.

## Current verification (2026-07-13)

The clean capped suite passes **148 files / 712 tests**. Repository ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The
multiple-lockfile warning and Prisma fallback remain known environment notes.
Provider access, deployment/restart, production HTTPS/cache verification,
community attachment storage/moderation, and 3D provider/building/terrain
work remain explicitly open.

## Dead aerial hook cleanup (2026-07-13)

### Target

Remove an unused raw aerial hook that could create a second unvalidated
`/api/aerial` consumer in future work.

### Outcome

Deleted `useAerialNew()` and `AerialClientResponse` from
`src/lib/use-app-data.ts`; the only runtime AerialLayer path remains bounded
and unchanged. The focused six-file aerial/data-hook gate passes **17 tests**,
with TypeScript, targeted lint, and diff validation green.

## Read-only production verifier rerun (2026-07-13)

### Evidence

- Hashed CSS/JS assets: reachable with immutable caching.
- `/sw.js`: HTTP 200, JavaScript, no-store.
- `/api/health`: HTTP 200, `ok`.
- `/api/source-health`: HTTP 200, seven sources, `stale` state.
- Root HTML: HTTP 200 but `s-maxage=31536000` instead of `no-store`.
- `/manifest.json`: HTTP 404 with an HTML content type.

### Boundary

No production deploy or restart was performed. The standalone asset fix is
verified locally; the cache and manifest failures remain external deployment
state requiring authorization.

## Service-worker documentation reconciliation (2026-07-13)

The deployment checklist and handoff now align with `public/sw.js`: hashed
Next chunks bypass the worker and APIs remain network-owned, so ordinary app
builds do not require a cache-name bump. Cache-name changes are reserved for
the worker's own precache/static-cache contract.

## Standalone packaging regression contract (2026-07-13)

### Target

Prevent regressions in the standalone artifact fix that copies Next client
chunks and public control assets beside the nested server.

### Outcome

`tests/lib/deploy-contract.test.ts` now exercises
`deploy/flatten-standalone.js` in an isolated fixture, asserting the stable
server symlink, `.next/static`, and `public/` materialization plus idempotent
rerun behavior. The focused deployment gate passes **14 tests**; TypeScript,
targeted ESLint, and `git diff --check` pass. The serialized full suite now
passes **148 files / 713 tests**. Production deployment/restart remains outside
the authorized local scope.

## Dead server-follow client cleanup (2026-07-13)

### Target

Remove an unused client path that implied server-owned follow persistence and
cast arbitrary `/api/follow` JSON without a response boundary.

### Outcome

Deleted `persistFollowChange()` and its `ApiActionResponse` type from
`src/lib/public-actions.ts`. The browser-local `useFollowedIncidents` hook
remains the sole follow owner, and the fail-closed `/api/follow` route remains
unchanged. The focused action/route/hook gate passes **3 files / 16 tests**;
TypeScript, targeted ESLint, and `git diff --check` pass. The serialized full
suite now passes **148 files / 712 tests**.

## Post-cleanup production build (2026-07-13)

### Evidence

- `bun run build` completed successfully with a 768 MB Node heap cap.
- Next compiled and typechecked the application and prerendered all 21 static
  pages.
- The flatten helper recreated `.next/standalone/server.js` and materialized
  `.next/static` plus `public/` beside the nested standalone server.
- `git diff --check` passed.

### Boundary

The multiple-lockfile workspace warning remains known. No production deploy or
service restart was performed.

## Shared fetch and filter orchestration boundaries (2026-07-13)

### Target

Remove the generic response-type escape hatch from the shared JSON reader and
reduce duplicated page-owned filter wiring without changing desktop/mobile
behavior.

### Outcome

`fetchJsonWithTimeout()` now returns `unknown`; all production callers retain
explicit normalizers or narrow the result before use. The two `FiltersPanel`
instances now receive a typed `sharedFilters` adapter, retaining independent
component state and desktop-only search-ref ownership. Two unused page bindings
were removed. Focused UI/fetch contracts pass; the full suite passes **148
files / 712 tests**; repository ESLint, TypeScript, diff validation, capped
build, and the six-viewport responsive matrix pass. No deploy or restart was
performed.

## Dead page-import cleanup (2026-07-13)

### Target

Remove stale imports left in `src/app/page.tsx` after component and helper
extractions, without altering runtime behavior or ownership.

### Outcome

Removed unused dashboard leaves, legacy incident ranking/status helpers,
overlay wrappers, and unused type imports. The full suite passes **148 files /
713 tests**, repository ESLint, TypeScript, `git diff --check`, and the capped
production build pass. No deployment or restart was performed.

## Shared incident-detail orchestration boundary (2026-07-13)

### Target

Remove duplicated selected-incident prop wiring while preserving the existing
mobile BottomSheet and desktop RightSidebar ownership model.

### Outcome

`IncidentDetailPanelProps` is exported from the detail component and
`page.tsx` now creates a typed `sharedIncidentDetailProps` adapter that owns
the enriched incident, follow state/actions, source-health context, and
optional Incident Focus controls. The two render sites spread the shared
adapter and retain only their layout-specific `isMobile` or `hideHeader`
override. Focused contracts pass; the full suite passes **148 files / 713
tests**, repository ESLint, TypeScript, `git diff --check`, capped build, and
the six-viewport responsive matrix pass. No deployment or restart was
performed.

## Right-sidebar dead prop cleanup (2026-07-13)

### Target

Remove the unused notification-count prop from the desktop right-rail
contract, preserving notification ownership in the notification surfaces and
the rail's existing active-filter/incident indicators.

### Outcome

`RightSidebarProps` no longer declares or destructures `unreadCount`; no caller
used it. The desktop information-architecture contract now asserts that the
rail does not own notification badges while retaining `activeFilterCount`.
Focused contracts pass; the full suite passes **148 files / 714 tests**,
repository ESLint, TypeScript, `git diff --check`, and the capped production
build pass. No deployment or restart was performed.

## Page orchestration follow-up audit (2026-07-13)

### Target

Re-audit the remaining page-owned child wiring after the shared filter and
incident-detail adapters, without changing responsive map/detail ownership.

### Outcome

No additional repeated child prop contract was identified as a safe extraction:
the remaining child components have single intentional call sites, the page
handlers are single-owner actions, and the mobile `map={null}` placeholder
preserves the page-owned MapScene underneath the mobile chrome. The handoff now
 records this as a bounded follow-up rather than obsolete boundary-cast debt.

## Community-report request-body hardening (2026-07-13)

### Target

Prevent unbounded public report JSON from reaching the parser or persistence
layer while preserving the existing JSON report contract and keeping visual
attachments out of the product until their storage and moderation design is
approved.

### Outcome

`readRequestBodyWithinLimit()` enforces a 16 KiB streaming cap, with an early
`Content-Length` rejection and a chunked-body limit. `POST /api/reports`
returns a redacted `413`/`no-store` response for oversized input before Zod or
Prisma work; focused contracts and oversized-body regressions pass. The full
suite passes **148 files / 716 tests**, repository ESLint, TypeScript,
`git diff --check`, and the capped production build pass. Attachment provider,
moderation, retention, EXIF/privacy, and deletion decisions remain open.

## Community-attachment design gate (2026-07-13)

### Target

Turn the open visual-attachment requirement into an implementable, provider-
neutral security and privacy gate without enabling uploads or selecting a
storage provider.

### Outcome

Added `docs/providers/community-attachments.md` with the proposed image-only
scope, bounded upload envelope, streaming/quarantine flow, one-time intent
requirements, EXIF and moderation rules, logical metadata relation, provider
matrix, retirement/deletion obligations, and required future tests/files. No
upload UI, provider SDK, database migration, or public media URL was added.

## Documentation reconciliation (2026-07-13)

The current handoff and architecture records now identify the verified local
baseline as **148 test files / 721 tests**, use the actual `src/` paths and
current page/map line counts, and distinguish the current worktree from the
older deployed production state. `docs/DEPLOY.md` now labels its server notes
as historical until the authorized HTTPS verification and restart gate runs;
`docs/FINDINGS.md` now identifies its original review statuses as historical.
No runtime behavior, provider selection, deployment, or restart changed.

## Current full local quality gate (2026-07-13)

The serialized capped suite passes **148 files / 721 tests**. Repository
ESLint, TypeScript, `git diff --check`, and the production build pass. The
known multiple-lockfile workspace-root warning and Prisma engine fallback
remain documented; deployment/restart and production HTTPS verification remain
separate authorized gates.

## Loopback standalone release verifier (2026-07-13)

The fresh standalone artifact passed `deploy/verify-production.sh` over an
isolated loopback server: HTML and hashed assets were available, control assets
were present with `no-store`, `/api/health` returned `ok`, and
`/api/source-health` returned nine sources with an explicit `stale` state. The
temporary server was stopped cleanly. This is local packaging evidence only;
it does not verify the deployed production build.

## Fresh standalone browser smoke (2026-07-13)

The fresh standalone artifact passed the security-header/MapLibre startup flow,
the public newsletter/status matrix in dark/light at 320×568 and 390×844, and
the default-off Incident Focus browser check. No 3D controls rendered while
the feature flag was disabled. Temporary browser/server processes were cleaned
up; production HTTPS and production feature-enabled 3D verification remain
separate gates; Phase 2 provider/building/terrain proof remains open.

## Full standalone browser coverage (2026-07-13)

### Evidence

- Accessibility passed all 24 route/viewport combinations with **0 violations**.
- Aerial, biomass, and composite-risk optional-layer failure/recovery flows
  passed against the fresh standalone server.
- Follow persistence, duplicate-click idempotence, and failed-write rollback
  passed.
- Responsive interactions passed at six viewport classes.
- Keyboard shortcut dialog focus/restore and slash-search focus passed after
  fixing the deferred-focus race in `src/lib/use-keyboard-shortcuts.ts`.
- Public-page dark/light 320/390px coverage and security-header checks passed.
- The serialized unit suite passes **148 files / 721 tests**; lint,
  TypeScript, build, and `git diff --check` pass.

### Boundary

The fresh standalone server and browser processes were cleaned up. An
unrelated SlopBrick Vitest process was observed and left untouched. Production
HTTPS/restart verification and production feature-enabled 3D
provider/building/terrain proof remain unauthorized or gated.

## CI browser and Lighthouse safeguards (2026-07-13)

The CI workflow now runs the default-off Incident Focus smoke explicitly,
passes the isolated `file:./build-test.db` into Lighthouse's server process,
and uploads `/tmp/lumes-start.log` on browser-step failure. The deployment
contract suite guards the workflow and package-script wiring. Local Lighthouse
passes `/`, `/status`, and `/privacy`; remote GitHub CI remains unverified.

## Read-only production verifier refresh (2026-07-13)

The current HTTPS probe still reaches the older deployment. Root HTML returns
`s-maxage=31536000` instead of `no-store`, and `/manifest.json` returns HTTP
404 HTML instead of JSON. Hashed assets, `/sw.js`, `/api/health` (`ok`), and
`/api/source-health` (7 sources, `stale`) respond successfully. No deployment
or restart was performed; the production release gate remains authorization-
dependent.

## Standalone tracing and flattening correction (2026-07-13)

`next.config.ts` now pins `outputFileTracingRoot` to the Lumes checkout so the
shared parent workspace's pnpm lockfile cannot cause the standalone bundle to
include a different Prisma runtime. The fresh bundle contains Prisma **6.19.2**
and `deploy/flatten-standalone.js` handles both top-level and nested Next
layouts while copying `.next/static` and `public/` beside the runnable server.
The focused deployment contract passes **19 tests**.

## Omitted standalone browser coverage (2026-07-13)

The six previously omitted browser suites pass against the canonical standalone
server and an isolated SQLite fixture: map-style lifecycle, data-trust matrix,
following filters, history lifecycle, incident ownership, and mobile
refresh/timeline recovery. The data-trust empty fixture now publishes a valid
zero-count envelope with no stale distribution totals.

## Current local quality gate (2026-07-13)

The serialized capped suite passes **148 files / 721 tests**. Repository ESLint,
TypeScript, `git diff --check`, and the capped production build pass. The
standalone bundle and isolated `/api/health` check use the declared Prisma
runtime. Deployment/restart, production HTTPS verification, attachments, and
3D provider/building/terrain evidence remain separate gates.

## Fresh standalone release verifier (2026-07-13)

With the isolated fixture's liveness timestamps refreshed, the rebuilt
standalone server passes `deploy/verify-production.sh` over loopback: HTML,
immutable chunks, manifest, logo, service worker, `/api/health`=`ok`, and nine
source-health entries with explicit `stale` state. The temporary server was
stopped cleanly; this does not verify the deployed production host.

## CI reliability browser coverage (2026-07-13)

CI now launches `.next/standalone/server.js` directly, seeds one synthetic
incident only through the guarded `LUMES_E2E_SEED=1` script, and runs the six
previously omitted reliability suites: map-style lifecycle, data-trust,
following filters, history, incident ownership, and mobile refresh/timeline.
The same standalone entrypoint is used by Lighthouse. The focused deployment
contract passes **19 tests**, and the six-script serial run passes against an
isolated seeded database.

## Standalone entry preflight guard (2026-07-13)

`deploy/deploy.sh` now refuses to copy assets or restart the service when the
expected `.next/standalone/server.js` entry is missing or broken after a
build. The focused deployment contract remains green at **19 tests**; shell
syntax, lint, TypeScript, the serialized **148 files / 721 tests** suite,
build, and diff validation pass. No production state changed.

## Authorized production deploy and browser gate (2026-07-13)

The current worktree was deployed with a sanitized rsync that preserved remote
backups, the database, environment, dependencies, build output, and tests. The
server-only deploy rebuilt the standalone bundle with Bun **1.3.14** and
Prisma **6.19.2**, restarted `lumes.service`, and returned `/api/health`=`ok`
with `dataState`=`healthy`. The active ingest timer uses
`/usr/local/bin/bun /opt/apps/lumes/scripts/ingest.ts`; the latest run exited
with status `0`.

The HTTPS verifier passes all release checks: HTML, immutable hashed assets,
`manifest.json`, `sw.js`, `/api/health`, and `/api/source-health` (nine sources,
explicit `stale` provider state). Fresh production browser checks pass for
security headers/MapLibre startup, default-off Incident Focus, and the public
dark/light 320×568 and 390×844 matrix. The 3D provider/building/terrain gate
remains separately unapproved.
