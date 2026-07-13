import { filterIncidents, type IncidentFilterState } from "@/lib/incident-filters";
import type { Incident, PlaybackFrame } from "@/lib/sample-data";

export interface VisibleIncidentsInput {
  incidents: readonly Incident[];
  playbackHour: number;
  filters: IncidentFilterState;
  sampleIncidents: readonly Incident[];
  playbackFrames: readonly PlaybackFrame[];
  /** Injectable clock for deterministic playback tests. */
  nowMs?: number;
}

/**
 * Selects the incident pool for the current playback position, then applies
 * the same query filters used by the live map. The sample fallback branch is
 * intentionally explicit so callers can preserve the existing live-data and
 * playback semantics while keeping the page free of data-selection details.
 */
export function deriveVisibleIncidents({
  incidents,
  playbackHour,
  filters,
  sampleIncidents,
  playbackFrames,
  nowMs,
}: VisibleIncidentsInput): Incident[] {
  if (playbackHour < 0 && incidents.length > 0) {
    const playbackTime = (nowMs ?? Date.now()) + playbackHour * 3600000;
    const pool = incidents.filter((incident) => {
      const detected = new Date(incident.firstDetected || incident.observedAt || "").getTime();
      return detected <= playbackTime;
    });
    return filterIncidents(pool, filters);
  }

  if (playbackHour < 0 && incidents.length === 0) {
    if (playbackFrames.length === 0) return filterIncidents([], filters);

    const frame = playbackFrames.reduce((closest, candidate) =>
      Math.abs(candidate.hourOffset - playbackHour) <
      Math.abs(closest.hourOffset - playbackHour)
        ? candidate
        : closest,
    );
    const pool = sampleIncidents.filter((incident) =>
      frame.activeIncidentIds.includes(incident.id),
    );
    return filterIncidents(pool, filters);
  }

  return filterIncidents(incidents, filters);
}
