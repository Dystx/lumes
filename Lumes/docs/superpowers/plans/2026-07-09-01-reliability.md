# Work package 1 — Reliability and delivery

1. Add a typed additive API data-state contract without breaking read payloads.
2. Apply safe cache headers, source freshness, failure reasons, and structured non-PII server logging to public actions and data APIs.
3. Prevent service-worker caching of Next chunks; enforce source typecheck, unit, browser, build, and Lighthouse gates in CI.
4. Verify normal, empty, degraded, and retryable states with route/unit contracts.

Gate: stale/fallback data is visibly labeled; old Next chunks cannot be served by the worker; CI blocks lint/type/unit/browser/build/performance regressions.
