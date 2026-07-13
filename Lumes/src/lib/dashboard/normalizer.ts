import { isPortugalCoordinate } from "@/lib/anepc";
import { mapStatusGroup } from "@/lib/incident";
import type {
  DashboardIncidentProperties,
  DashboardIncidentRecord,
  Severity,
} from "@/lib/types";

const SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low"]);
const STATUSES = new Set(["active", "detected", "contained", "resolved", "monitoring"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value.trim();
}

function readStringOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalNonNegative(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  const number = readFiniteNumber(value);
  return number !== undefined && number >= 0 ? number : null;
}

function readOptionalCount(value: unknown): number | undefined | null {
  const number = readOptionalNonNegative(value);
  if (number === undefined || number === null) return number;
  return Number.isInteger(number) ? number : null;
}

function readSeverity(value: unknown): Severity | null {
  return typeof value === "string" && SEVERITIES.has(value as Severity)
    ? value as Severity
    : null;
}

function readOptionalStatus(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !STATUSES.has(value)) return null;
  return value;
}

function validCalendarTimestamp(value: string): boolean {
  const datePart = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!datePart || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText] = datePart;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
}

function readOptionalTimestamp(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !validCalendarTimestamp(value)) return null;
  return value;
}

function readOptionalDate(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return value.toISOString();
}

function readCoordinates(value: unknown): {
  geometry?: DashboardIncidentRecord["geometry"];
  latitude?: number;
  longitude?: number;
} | null {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return {};
  if (value.type !== undefined && value.type !== "Point") return null;
  const longitude = readFiniteNumber(value.coordinates[0]);
  const latitude = readFiniteNumber(value.coordinates[1]);
  if (longitude === undefined || latitude === undefined || !isPortugalCoordinate(latitude, longitude)) return {};
  return {
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    latitude,
    longitude,
  };
}

function normalizeProperties(
  value: unknown,
  coordinates: Exclude<ReturnType<typeof readCoordinates>, null>,
): DashboardIncidentProperties | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;

  const personnelTotal = readOptionalCount(value.personnelTotal);
  const assetsGround = readOptionalCount(value.assetsGround);
  const assetsAerial = readOptionalCount(value.assetsAerial);
  if (personnelTotal === null || assetsGround === null || assetsAerial === null) return null;

  return {
    statusText: readString(value.statusText),
    statusGroup: readString(value.statusGroup),
    naturezaText: readString(value.naturezaText),
    rasi: readString(value.rasi),
    personnelTotal,
    assetsGround,
    assetsAerial,
    municipality: readString(value.municipality),
    region: readString(value.region),
    parish: readString(value.parish),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    displayName: readString(value.displayName),
  };
}

/** Normalize one live dashboard incident without allowing invalid semantics into aggregates. */
export function normalizeDashboardIncident(value: unknown): DashboardIncidentRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const severity = readSeverity(value.severity);
  const status = readOptionalStatus(value.status);
  const incidentStatus = readOptionalStatus(value.incidentStatus);
  const estimatedAreaHa = readOptionalNonNegative(value.estimatedAreaHa);
  const firstDetected = readOptionalTimestamp(value.firstDetected);
  if (
    !id
    || severity === null
    || status === null
    || incidentStatus === null
    || estimatedAreaHa === null
    || firstDetected === null
    || (status !== undefined && incidentStatus !== undefined && status !== incidentStatus)
  ) return null;

  const coordinates = readCoordinates(value.geometry);
  if (coordinates === null) return null;
  const properties = normalizeProperties(value.properties, coordinates);
  if (properties === null) return null;

  return {
    id,
    severity,
    status,
    incidentStatus,
    estimatedAreaHa: estimatedAreaHa ?? 0,
    firstDetected,
    displayName: readString(value.displayName),
    municipality: readStringOrNull(value.municipality),
    district: readStringOrNull(value.district),
    parish: readStringOrNull(value.parish),
    ...coordinates.geometry ? { geometry: coordinates.geometry } : {},
    properties,
  };
}

/** Normalize a Prisma incident row before it enters the dashboard fallback aggregates. */
export function normalizeDashboardDbRow(value: unknown): DashboardIncidentRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const severity = readSeverity(value.severity);
  const status = readOptionalStatus(value.status);
  const estimatedAreaHa = readOptionalNonNegative(value.estimatedAreaHa);
  const firstDetected = readOptionalDate(value.firstDetected);
  if (!id || severity === null || status === null || estimatedAreaHa === null || firstDetected === null) return null;

  const latitude = readFiniteNumber(value.latitude);
  const longitude = readFiniteNumber(value.longitude);
  const validCoordinates = latitude !== undefined
    && longitude !== undefined
    && isPortugalCoordinate(latitude, longitude);
  const personnelTotal = readOptionalCount(value.personnelTotal);
  const assetsGround = readOptionalCount(value.assetsGround);
  const assetsAerial = readOptionalCount(value.assetsAerial);
  if (personnelTotal === null || assetsGround === null || assetsAerial === null) return null;

  const statusText = readString(value.statusText);
  const properties: DashboardIncidentProperties = {
    statusText,
    statusGroup: mapStatusGroup(statusText, status),
    naturezaText: readString(value.naturezaText),
    rasi: readString(value.rasi),
    personnelTotal,
    assetsGround,
    assetsAerial,
    municipality: readString(value.municipality),
    region: readString(value.district),
    parish: readString(value.parish),
    latitude: validCoordinates ? latitude : undefined,
    longitude: validCoordinates ? longitude : undefined,
    displayName: readString(value.displayName),
  };

  return {
    id,
    severity,
    status,
    incidentStatus: status,
    estimatedAreaHa: estimatedAreaHa ?? 0,
    firstDetected,
    displayName: readString(value.displayName),
    municipality: readStringOrNull(value.municipality),
    district: readStringOrNull(value.district),
    parish: readStringOrNull(value.parish),
    ...(validCoordinates ? { geometry: { type: "Point" as const, coordinates: [longitude, latitude] as [number, number] } } : {}),
    properties,
  };
}
