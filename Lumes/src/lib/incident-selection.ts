import { isSelectableIncident } from "@/lib/incident-filters";

export type IncidentSelectionSource = "list" | "map";

export interface IncidentSelectionDecision {
  selectedIncidentId: string | null;
  /** Omitted when the caller should preserve the current fly-to request. */
  flyToIncidentId?: string | null;
}

/**
 * Keeps list/notification selection and map-marker selection semantics in one
 * typed boundary. A valid list selection must not retrigger a map camera move;
 * a valid marker selection does. Clearing or rejecting a selection clears both
 * channels only when the existing page behavior does so explicitly.
 */
export function decideIncidentSelection(
  visibleIncidentIds: ReadonlySet<string>,
  incidentId: string | null,
  source: IncidentSelectionSource,
): IncidentSelectionDecision {
  if (!isSelectableIncident(visibleIncidentIds, incidentId)) {
    return { selectedIncidentId: null, flyToIncidentId: null };
  }

  if (source === "map" && incidentId !== null) {
    return { selectedIncidentId: incidentId, flyToIncidentId: incidentId };
  }

  return { selectedIncidentId: incidentId };
}
