export type HealthStatus = "ok" | "degraded";
export type HealthCheckStatus = "ok" | "fail" | "skip";

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  uptime_s: number;
  latencyMs: number;
  checks: Record<string, HealthCheckStatus>;
  lastIncidentUpdate: string | null;
}

export interface StatsResponse {
  total: number;
  active: number;
  resolved: number;
  snapshots: number;
}

export type SourceHealthStatus = "ok" | "stale" | "error" | "disabled";

export interface SourceHealthEntry {
  sourceId: string;
  sourceName: string;
  status: SourceHealthStatus;
  lastSuccess: string | null;
  lastError: string | null;
  recordCount: number;
  latencyMs: number | null;
}

export interface SourceHealthResponse {
  sources: SourceHealthEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonnegativeNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function nonnegativeInteger(value: unknown, fallback: number): number {
  return Math.floor(nonnegativeNumber(value, fallback));
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : isValidTimestamp(value) ? value : null;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeChecks(value: unknown): { checks: Record<string, HealthCheckStatus>; valid: boolean } {
  if (!isRecord(value)) return { checks: {}, valid: false };
  const entries = Object.entries(value);
  const recognized = entries.filter(([, status]) => status === "ok" || status === "fail" || status === "skip");
  const valid = entries.length > 0 && recognized.length > 0;
  return {
    checks: Object.fromEntries(recognized) as Record<string, HealthCheckStatus>,
    valid,
  };
}

export function normalizeHealthResponse(value: unknown, fallback: HealthResponse): HealthResponse {
  if (!isRecord(value)) return fallback;
  if (value.status !== "ok" && value.status !== "degraded") return { ...fallback, status: "degraded" };
  const checks = normalizeChecks(value.checks);
  const timestamp = isValidTimestamp(value.timestamp) ? value.timestamp : null;
  const uptime = typeof value.uptime_s === "number" && Number.isFinite(value.uptime_s) && value.uptime_s >= 0
    ? value.uptime_s
    : null;
  const latency = typeof value.latencyMs === "number" && Number.isFinite(value.latencyMs) && value.latencyMs >= 0
    ? value.latencyMs
    : null;
  const lastIncidentUpdate = value.lastIncidentUpdate === null
    ? null
    : isValidTimestamp(value.lastIncidentUpdate)
      ? value.lastIncidentUpdate
      : undefined;
  if (
    !checks.valid ||
    timestamp === null ||
    uptime === null ||
    latency === null ||
    lastIncidentUpdate === undefined ||
    (value.status === "ok" && Object.keys(checks.checks).length === 0)
  ) {
    return { ...fallback, status: "degraded" };
  }
  return {
    status: value.status,
    timestamp,
    uptime_s: uptime,
    latencyMs: latency,
    checks: checks.checks,
    lastIncidentUpdate,
  };
}

export function normalizeStatsResponse(value: unknown, fallback: StatsResponse): StatsResponse {
  if (!isRecord(value)) return fallback;
  return {
    total: nonnegativeInteger(value.total, fallback.total),
    active: nonnegativeInteger(value.active, fallback.active),
    resolved: nonnegativeInteger(value.resolved, fallback.resolved),
    snapshots: nonnegativeInteger(value.snapshots, fallback.snapshots),
  };
}

function normalizeSource(value: unknown): SourceHealthEntry | null {
  if (!isRecord(value)) return null;
  const sourceId = typeof value.sourceId === "string" ? value.sourceId.trim() : "";
  const sourceName = typeof value.sourceName === "string" ? value.sourceName.trim() : "";
  if (!sourceId || !sourceName) return null;

  const status: SourceHealthStatus = value.status === "ok"
    || value.status === "stale"
    || value.status === "disabled"
    ? value.status
    : "error";

  return {
    sourceId,
    sourceName,
    status,
    lastSuccess: nullableTimestamp(value.lastSuccess),
    lastError: nullableText(value.lastError),
    recordCount: nonnegativeInteger(value.recordCount, 0),
    latencyMs: value.latencyMs === null
      ? null
      : typeof value.latencyMs === "number" && Number.isFinite(value.latencyMs) && value.latencyMs >= 0
        ? value.latencyMs
        : null,
  };
}

export function normalizeSourceHealthResponse(value: unknown): SourceHealthResponse {
  if (!isRecord(value) || !Array.isArray(value.sources)) return { sources: [] };
  return {
    sources: value.sources
      .map(normalizeSource)
      .filter((source): source is SourceHealthEntry => source !== null),
  };
}
