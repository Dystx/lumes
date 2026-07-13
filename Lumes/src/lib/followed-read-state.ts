import { isValidIsoTimestamp } from "@/lib/data-state";

export const FOLLOWED_READ_STATE_STORAGE_KEY = "lumes.followed-incidents-read-state";

const MAX_READ_STATE_ENTRIES = 2_000;
const MAX_ID_LENGTH = 120;

export interface ReadableFollowedIncident {
  id: string;
  lastUpdated?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize browser-local read state; malformed entries are ignored. */
export function normalizeFollowedReadState(value: unknown): Map<string, string> {
  if (!isRecord(value)) return new Map();

  const normalized = new Map<string, string>();
  for (const [id, timestamp] of Object.entries(value)) {
    if (
      normalized.size >= MAX_READ_STATE_ENTRIES
      || id.length === 0
      || id.length > MAX_ID_LENGTH
      || id === "__proto__"
      || id === "constructor"
      || id === "prototype"
      || !isValidIsoTimestamp(timestamp)
    ) continue;
    normalized.set(id, timestamp);
  }
  return normalized;
}

export function serializeFollowedReadState(state: ReadonlyMap<string, string>): string {
  const value: Record<string, string> = {};
  for (const [id, timestamp] of state) {
    if (id.length === 0 || id.length > MAX_ID_LENGTH || !isValidIsoTimestamp(timestamp)) continue;
    value[id] = timestamp;
  }
  return JSON.stringify(value);
}

/** Return followed rows whose provider update is newer than local read state. */
export function getUnreadFollowedIncidents<T extends ReadableFollowedIncident>(
  incidents: readonly T[],
  followedIds: ReadonlySet<string>,
  readState: ReadonlyMap<string, string>,
): T[] {
  return incidents.filter((incident) => {
    if (!followedIds.has(incident.id) || !isValidIsoTimestamp(incident.lastUpdated)) return false;
    const readAt = readState.get(incident.id);
    return isValidIsoTimestamp(readAt) && Date.parse(incident.lastUpdated) > Date.parse(readAt);
  });
}

/** Mark the supplied current rows read without mutating the previous map. */
export function markFollowedIncidentsRead(
  current: ReadonlyMap<string, string>,
  incidents: readonly ReadableFollowedIncident[],
): Map<string, string> {
  const next = new Map(current);
  for (const incident of incidents) {
    if (isValidIsoTimestamp(incident.lastUpdated)) next.set(incident.id, incident.lastUpdated);
  }
  return next;
}
