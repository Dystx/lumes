export type DataState = "healthy" | "stale" | "fallback" | "empty" | "retryable-error";
export type DataStateLocale = "pt" | "en";

export interface DataStateInput {
  count?: number | null;
  fallback?: boolean;
  stale?: boolean;
  retryableError?: boolean;
}

export interface DataStateMeta {
  state: DataState;
  updatedAt: string;
  reason?: string;
  sourceUpdatedAt?: string;
  source?: string;
}

const DATA_STATE_VALUES: readonly DataState[] = [
  "healthy",
  "stale",
  "fallback",
  "empty",
  "retryable-error",
];
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDataState(value: unknown): value is DataState {
  return typeof value === "string" && DATA_STATE_VALUES.includes(value as DataState);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offset = zone && zone !== "Z" ? /^([+-])(\d{2}):(\d{2})$/.exec(zone) : null;
  const offsetHour = offset ? Number(offset[2]) : 0;
  const offsetMinute = offset ? Number(offset[3]) : 0;

  return month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth(year, month)
    && hour >= 0 && hour <= 23
    && minute >= 0 && minute <= 59
    && second >= 0 && second <= 59
    && offsetHour >= 0 && offsetHour <= 23
    && offsetMinute >= 0 && offsetMinute <= 59
    && Number.isFinite(Date.parse(value));
}

function optionalReason(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length === 0 ? undefined : reason.slice(0, 500);
}

function optionalSource(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim().slice(0, 200);
}

/** Normalize untrusted response metadata before it reaches client trust UI. */
export function normalizeDataStateMeta(value: unknown): DataStateMeta | null {
  if (!isRecord(value) || !isDataState(value.state) || !isValidIsoTimestamp(value.updatedAt)) return null;

  const reason = optionalReason(value.reason);
  const source = optionalSource(value.source);
  if (reason === null || source === null) return null;

  let sourceUpdatedAt: string | undefined;
  if (value.sourceUpdatedAt !== undefined && value.sourceUpdatedAt !== null) {
    if (!isValidIsoTimestamp(value.sourceUpdatedAt)) return null;
    sourceUpdatedAt = value.sourceUpdatedAt;
  }

  return {
    state: value.state,
    updatedAt: value.updatedAt,
    ...(reason === undefined ? {} : { reason }),
    ...(sourceUpdatedAt === undefined ? {} : { sourceUpdatedAt }),
    ...(source === undefined ? {} : { source }),
  };
}

export interface DataStateMetaResolution {
  valid: boolean;
  meta: DataStateMeta;
}

/** Resolve an optional response field while distinguishing absent from malformed. */
export function resolveDataStateMeta(value: unknown): DataStateMetaResolution {
  if (value === undefined) return { valid: true, meta: createDataStateMeta("healthy") };
  const normalized = normalizeDataStateMeta(value);
  return normalized
    ? { valid: true, meta: normalized }
    : { valid: false, meta: createDataStateMeta("retryable-error", "Invalid data state metadata") };
}

export function classifyDataState(input: DataStateInput): DataState {
  if (input.retryableError) return "retryable-error";
  if (input.fallback) return "fallback";
  if (input.stale) return "stale";
  if (input.count === 0) return "empty";
  return "healthy";
}

export function dataStateMessage(state: DataState, locale: DataStateLocale): string {
  const messages: Record<DataStateLocale, Record<DataState, string>> = {
    pt: {
      healthy: "Dados atualizados.",
      stale: "Estes dados podem estar desatualizados.",
      fallback: "A mostrar dados alternativos; a fonte em direto está indisponível.",
      empty: "Não existem dados disponíveis neste momento.",
      "retryable-error": "Não foi possível atualizar estes dados. Tente novamente.",
    },
    en: {
      healthy: "Data is up to date.",
      stale: "This data may be out of date.",
      fallback: "Showing fallback data; live source is unavailable.",
      empty: "No data is available right now.",
      "retryable-error": "Unable to refresh this data. Try again.",
    },
  };
  return messages[locale][state];
}

export function createDataStateMeta(
  state: DataState,
  reason?: string,
  sourceUpdatedAt?: string,
  source?: string,
): DataStateMeta {
  return {
    state,
    updatedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    ...(source ? { source } : {}),
  };
}
