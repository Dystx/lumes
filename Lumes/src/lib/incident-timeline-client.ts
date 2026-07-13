import { isValidIsoTimestamp, normalizeDataStateMeta, type DataStateMeta } from "@/lib/data-state";

const TIMELINE_STATUSES = ["detected", "active", "contained", "resolved", "monitoring"] as const;
const TIMELINE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const MAX_INCIDENT_ID_LENGTH = 120;
const MAX_SNAPSHOT_ID_LENGTH = 200;
const MAX_SNAPSHOT_COUNT = 100_000;
const MAX_RESOURCE_COUNT = 1_000_000;
const MAX_AREA_HECTARES = 10_000_000;
const MAX_TEXT_LENGTH = 1_000;

type TimelineStatus = typeof TIMELINE_STATUSES[number];
type TimelineSeverity = typeof TIMELINE_SEVERITIES[number];

export interface IncidentTimelineSnapshot {
  id: string;
  timestamp: string;
  status: TimelineStatus;
  severity: TimelineSeverity;
  personnelTotal: number;
  assetsGround: number;
  assetsAerial: number;
  estimatedAreaHa: number;
  statusText?: string | null;
  note?: string | null;
}

export interface IncidentTimelineResponse {
  incidentId: string;
  count: number;
  snapshots: IncidentTimelineSnapshot[];
  dataState?: DataStateMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maximum ? (normalized || null) : undefined;
}

function boundedNumber(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
    ? value
    : null;
}

function boundedInteger(value: unknown, maximum: number): number | null {
  const number = boundedNumber(value, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

function normalizeSnapshot(value: unknown): IncidentTimelineSnapshot | null {
  if (!isRecord(value)) return null;

  const id = requiredText(value.id, MAX_SNAPSHOT_ID_LENGTH);
  const timestamp = isValidIsoTimestamp(value.timestamp) ? value.timestamp : null;
  const status = enumValue(value.status, TIMELINE_STATUSES);
  const severity = enumValue(value.severity, TIMELINE_SEVERITIES);
  const personnelTotal = boundedInteger(value.personnelTotal, MAX_RESOURCE_COUNT);
  const assetsGround = boundedInteger(value.assetsGround, MAX_RESOURCE_COUNT);
  const assetsAerial = boundedInteger(value.assetsAerial, MAX_RESOURCE_COUNT);
  const estimatedAreaHa = boundedNumber(value.estimatedAreaHa, MAX_AREA_HECTARES);
  const statusText = nullableText(value.statusText, MAX_TEXT_LENGTH);
  const note = nullableText(value.note, MAX_TEXT_LENGTH);

  if (
    id === null
    || timestamp === null
    || status === null
    || severity === null
    || personnelTotal === null
    || assetsGround === null
    || assetsAerial === null
    || estimatedAreaHa === null
    || (value.statusText !== undefined && value.statusText !== null && statusText === undefined)
    || (value.note !== undefined && value.note !== null && note === undefined)
  ) return null;

  return {
    id,
    timestamp,
    status,
    severity,
    personnelTotal,
    assetsGround,
    assetsAerial,
    estimatedAreaHa,
    ...(statusText === undefined ? {} : { statusText }),
    ...(note === undefined ? {} : { note }),
  };
}

/** Normalize one untrusted persisted incident timeline response. */
export function normalizeIncidentTimelineResponse(
  value: unknown,
  expectedIncidentId?: string,
): IncidentTimelineResponse | null {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return null;

  const incidentId = requiredText(value.incidentId, MAX_INCIDENT_ID_LENGTH);
  const count = boundedInteger(value.count, MAX_SNAPSHOT_COUNT);
  if (incidentId === null || count === null) return null;
  if (expectedIncidentId !== undefined && incidentId !== expectedIncidentId) return null;

  let dataState: DataStateMeta | undefined;
  if (value.dataState !== undefined) {
    dataState = normalizeDataStateMeta(value.dataState) ?? undefined;
    if (dataState === undefined) return null;
  }

  const snapshots = value.snapshots
    .map(normalizeSnapshot)
    .filter((snapshot): snapshot is IncidentTimelineSnapshot => snapshot !== null);
  if (value.snapshots.length > 0 && snapshots.length === 0) return null;
  if (count !== snapshots.length) return null;
  if (dataState && ((count === 0 && dataState.state !== "empty")
    || (count > 0 && dataState.state !== "healthy"))) return null;

  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    if (ids.has(snapshot.id)) return null;
    ids.add(snapshot.id);
  }

  return {
    incidentId,
    count,
    snapshots,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable transform used by the detail-panel fetch boundary. */
export function transformIncidentTimelineResponse(expectedIncidentId?: string) {
  return (value: unknown): IncidentTimelineResponse => {
    const normalized = normalizeIncidentTimelineResponse(value, expectedIncidentId);
    if (normalized === null) throw new Error("Invalid incident timeline response envelope");
    return normalized;
  };
}
