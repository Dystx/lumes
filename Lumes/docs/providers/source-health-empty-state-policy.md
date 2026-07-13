# Source-health empty-state policy proposal

**Status:** decision packet only; runtime semantics remain unchanged.

## Why this packet exists

`/api/source-health` currently maps an empty or zero-record probe to
`stale`. That is intentionally conservative, but the meaning of an empty
response differs by source:

- no active incidents or no public warnings can be a valid, current result;
- no weather or fire-risk rows usually means the provider response is
  incomplete or unusable;
- optional layers may be legitimately empty or disabled.

A single generic `empty` state would therefore either alarm users during a
quiet period or hide a provider failure. This packet defines the policy that
must be approved before the runtime contract is changed.

## Proposed source matrix

| Source | Valid-empty condition | Degraded-empty condition | Headline effect | Public presentation |
| --- | --- | --- | --- | --- |
| `anepc-prociv-arcgis` | Valid schema, fresh payload, zero active occurrences | Missing/invalid payload or freshness breach | Do not degrade; show no active incidents | “No active incidents reported” with update time |
| `ipma-fire-risk` | Only if IPMA explicitly publishes a complete zero-row result | Zero rows without a complete/fresh result | Degrade core trust | “Fire-risk data unavailable” |
| `ipma-weather` | Not normally valid for a requested area | Zero rows, invalid stations, or freshness breach | Degrade core trust | “Weather data unavailable” |
| `ipma-warnings` | Valid fresh response with no current warnings | Invalid/HTTP failure or freshness breach | Valid-empty must not degrade; failures do | “No active warnings” or a provider warning |
| `anepc-regional-commands` | Valid fresh response with no current command polygons | Invalid/HTTP failure or freshness breach | Policy decision; default conservative stale | “No regional command data” |
| `osm-fire-stations` | Valid query with no matching stations | Provider/query failure | Never degrade core headline | “No stations in this view” |
| `nasa-firms-viirs` | Valid configured query with no detections | Provider failure or missing key | Never degrade core headline | “No satellite detections” / “Satellite unavailable” |
| `aerial-adsb` / `biomass` | Not loaded because the layer is disabled | Enabled-layer failure | Never degrade core headline | Existing disabled/optional state |

“Fresh” must be defined per provider using the source update timestamp where
available and a bounded fetch-age fallback where it is not. A valid-empty
result must never be inferred from a missing, malformed, or unauditable payload.

## Proposed contract shape

Do not overload the existing `SourceHealth.status` values. If this policy is
approved, add a separate, explicit state such as `valid-empty` only after the
following are agreed:

1. whether `SourceHealth` exposes it directly or only the client presentation
   adapter does;
2. the aggregate headline rule for each core source;
3. localized copy and accessible status-label semantics;
4. whether a valid-empty result records `lastSuccess` and `sourceUpdatedAt`;
5. how cache age, provider freshness, and retryable errors interact;
6. how status-page, dashboard, filters, notifications, and API consumers
   distinguish quiet data from unavailable data.

## Required implementation and verification after approval

The first implementation slice would need coordinated changes to:

- server classification in `src/app/api/source-health/route.ts`;
- `SourceHealth`, `SourceTrustStatus`, and data-state types;
- source-health normalisation and presentation adapters;
- headline trust precedence and status-page badges;
- dashboard/filter notices and localized copy;
- unit, contract, responsive, and public-status browser tests.

Until those decisions are recorded and the matrix is covered by tests, keep
the current empty→stale behavior. Do not claim that an empty provider response
is healthy merely because the HTTP request succeeded.

## Approval record

| Field | Value |
| --- | --- |
| Decision owner | _pending_ |
| Accepted source matrix | _pending_ |
| Aggregate headline rules | _pending_ |
| Localized/public copy | _pending_ |
| API compatibility decision | _pending_ |
| Test plan approved | _pending_ |
| Implementation approval date | _pending_ |
| Decision | **KEEP CURRENT EMPTY→STALE CONTRACT** |
