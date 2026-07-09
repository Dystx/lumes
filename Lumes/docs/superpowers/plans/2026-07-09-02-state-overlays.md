# Work package 2 — Query, selection, and overlays

1. Keep canonical `IncidentFilterState` and map-display state separate.
2. Derive filtering, count, chips, and reset from one selector; map layers are never query chips.
3. Reconcile selection/fly-to against the visible set.
4. Order blocking overlays, close only the topmost on Escape, and return focus to the trigger.

Gate: every chip clears one constraint; reset restores baseline; hidden incidents cannot remain inspected; keyboard dismissal is deterministic.
