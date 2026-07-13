import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import type { DashboardPriorityIncident, DashboardResponse, Severity } from "@/lib/types";
import { isPortugalCoordinate } from "@/lib/anepc";

const MAX_DISTRIBUTION_ENTRIES = 1_000;
const MAX_DASHBOARD_ROWS = 5;
const MAX_TEXT_LENGTH = 300;
const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];
const STATUSES = new Set(["active", "detected", "contained", "resolved", "monitoring", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maximum = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

function nullableText(value: unknown, maximum = MAX_TEXT_LENGTH): string | null {
  if (value === null) return null;
  return requiredText(value, maximum);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function validCalendarTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const datePart = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!datePart || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText] = datePart;
  const calendarDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  return calendarDate.getUTCFullYear() === Number(yearText)
    && calendarDate.getUTCMonth() === Number(monthText) - 1
    && calendarDate.getUTCDate() === Number(dayText);
}

function normalizeDistribution(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_DISTRIBUTION_ENTRIES) return null;
  const distribution: Record<string, number> = {};
  for (const [key, rawCount] of entries) {
    if (key.trim().length === 0 || key.length > MAX_TEXT_LENGTH) return null;
    const count = nonNegativeInteger(rawCount);
    if (count === null) return null;
    distribution[key] = count;
  }
  return distribution;
}

function distributionTotal(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function normalizePriority(value: unknown): DashboardPriorityIncident | null {
  if (!isRecord(value)) return null;
  const id = requiredText(value.id, 200);
  const displayName = requiredText(value.displayName);
  const severity = typeof value.severity === "string" && SEVERITIES.includes(value.severity as Severity)
    ? value.severity as Severity
    : null;
  const status = requiredText(value.status, 60);
  const municipality = nullableText(value.municipality);
  const district = nullableText(value.district);
  const estimatedAreaHa = nonNegativeNumber(value.estimatedAreaHa);
  const personnel = nonNegativeInteger(value.personnel);
  const firstDetected = value.firstDetected === undefined
    ? undefined
    : validCalendarTimestamp(value.firstDetected) ? value.firstDetected : null;
  const latitude = value.latitude === null ? null : finiteNumber(value.latitude);
  const longitude = value.longitude === null ? null : finiteNumber(value.longitude);

  if (
    id === null
    || displayName === null
    || severity === null
    || status === null
    || !STATUSES.has(status)
    || municipality === null && value.municipality !== null
    || district === null && value.district !== null
    || estimatedAreaHa === null
    || personnel === null
    || firstDetected === null
    || latitude === null && value.latitude !== null
    || longitude === null && value.longitude !== null
    || (latitude === null) !== (longitude === null)
    || (latitude !== null && longitude !== null && !isPortugalCoordinate(latitude, longitude))
  ) return null;

  return {
    id,
    displayName,
    severity,
    status,
    municipality,
    district,
    estimatedAreaHa,
    personnel,
    ...(firstDetected === undefined ? {} : { firstDetected }),
    latitude,
    longitude,
  };
}

function normalizeSummary(value: unknown): DashboardResponse["summary"] | null {
  if (!isRecord(value)) return null;
  const total = nonNegativeInteger(value.total);
  const activeCount = nonNegativeInteger(value.activeCount);
  const criticalCount = nonNegativeInteger(value.criticalCount);
  const highCount = nonNegativeInteger(value.highCount);
  const personnel = nonNegativeInteger(value.personnel);
  const aircraft = nonNegativeInteger(value.aircraft);
  const engines = nonNegativeInteger(value.engines);
  const areaHa = nonNegativeNumber(value.areaHa);
  if (
    total === null
    || activeCount === null
    || criticalCount === null
    || highCount === null
    || personnel === null
    || aircraft === null
    || engines === null
    || areaHa === null
    || activeCount > total
    || criticalCount > total
    || highCount > total
  ) return null;
  return { total, activeCount, criticalCount, highCount, personnel, aircraft, engines, areaHa };
}

function normalizePersistence(value: unknown): DashboardResponse["persistence"] | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const total = nonNegativeInteger(value.total);
  const active = nonNegativeInteger(value.active);
  const resolved = nonNegativeInteger(value.resolved);
  const snapshots = nonNegativeInteger(value.snapshots);
  if (total === null || active === null || resolved === null || snapshots === null || active > total || resolved > total) return null;
  return { total, active, resolved, snapshots };
}

/** Normalize one untrusted successful `/api/dashboard` response envelope. */
export function normalizeDashboardResponse(value: unknown): DashboardResponse | null {
  if (!isRecord(value)) return null;
  const source = requiredText(value.source, 200);
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const dataState = normalizeDataStateMeta(value.dataState);
  const summary = normalizeSummary(value.summary);
  const persistence = normalizePersistence(value.persistence);

  if (!Array.isArray(value.topPriority) || value.topPriority.length > MAX_DASHBOARD_ROWS) return null;
  const topPriority = value.topPriority
    .map(normalizePriority)
    .filter((priority): priority is DashboardPriorityIncident => priority !== null);
  const byType = isRecord(value.distribution) ? normalizeDistribution(value.distribution.byType) : null;
  const byStatus = isRecord(value.distribution) ? normalizeDistribution(value.distribution.byStatus) : null;
  const byStatusGroup = isRecord(value.distribution) ? normalizeDistribution(value.distribution.byStatusGroup) : null;

  if (
    source === null
    || fetchedAt === null
    || dataState === null
    || summary === null
    || persistence === null && value.persistence !== null
    || byType === null
    || byStatus === null
    || byStatusGroup === null
    || (value.topPriority.length > 0 && topPriority.length === 0)
    || distributionTotal(byStatus) !== summary.total
    || distributionTotal(byStatusGroup) !== summary.total
    || distributionTotal(byType) > summary.total
    || topPriority.some((priority, index) => topPriority.findIndex((candidate) => candidate.id === priority.id) !== index)
    || (dataState.state === "empty" && summary.total !== 0)
  ) return null;

  return {
    source,
    dataState,
    fetchedAt,
    summary,
    distribution: { byType, byStatus, byStatusGroup },
    topPriority,
    persistence,
  };
}

/** Stable `useFetch` transform: malformed dashboard data becomes retryable. */
export function transformDashboardResponse(value: unknown): DashboardResponse {
  const normalized = normalizeDashboardResponse(value);
  if (normalized === null) throw new Error("Invalid dashboard response envelope");
  return normalized;
}
