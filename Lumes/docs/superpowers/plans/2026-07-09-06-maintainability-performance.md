# Work package 6 — Maintainability and performance

1. Keep data composition in `page.tsx` while extracting focused presentation boundaries.
2. Establish focused shell, drawer, panel, metric, status, heading, and icon-control primitives.
3. Preserve map/data behavior during extraction and prove removals through static/runtime/tests.
4. Keep lazy boundaries and payload/cache budgets covered by Lighthouse.

Gate: page orchestration reduces safely, no map/data regression occurs, and performance budgets remain blocking in CI.
