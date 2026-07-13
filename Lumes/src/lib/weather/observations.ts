const OBSERVATION_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;
const LISBON_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  calendar: "gregory",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
});

interface TimestampShape {
  value: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  milliseconds: number;
  zone?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseTimestampShape(value: unknown): TimestampShape | null {
  if (typeof value !== "string" || value.length === 0) return null;

  const match = OBSERVATION_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", millisecondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const milliseconds = millisecondText ? Number(millisecondText.padEnd(3, "0")) : 0;
  const offset = zone && zone !== "Z" ? /^([+-])(\d{2}):(\d{2})$/.exec(zone) : null;
  const offsetHour = offset ? Number(offset[2]) : 0;
  const offsetMinute = offset ? Number(offset[3]) : 0;

  if (
    month < 1 || month > 12
    || day < 1 || day > daysInMonth(year, month)
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
    || milliseconds < 0 || milliseconds > 999
    || offsetHour < 0 || offsetHour > 23
    || offsetMinute < 0 || offsetMinute > 59
    || !Number.isFinite(Date.parse(zone ? value : `${value}Z`))
  ) return null;

  return { value, year, month, day, hour, minute, second, milliseconds, ...(zone ? { zone } : {}) };
}

/** Return the original timestamp only when it is a real ISO calendar value. */
export function normalizeObservationTimestamp(value: unknown): string | null {
  return parseTimestampShape(value)?.value ?? null;
}

function datePartsAsUtcMillis(parts: Pick<TimestampShape, "year" | "month" | "day" | "hour" | "minute" | "second" | "milliseconds">): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.milliseconds);
  return date.getTime();
}

function lisbonPartsAt(instant: number): Pick<TimestampShape, "year" | "month" | "day" | "hour" | "minute" | "second" | "milliseconds"> {
  const parts = Object.fromEntries(
    LISBON_TIMESTAMP_FORMATTER.formatToParts(new Date(instant))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    milliseconds: parts.fractionalSecond ?? 0,
  };
}

function sameClockParts(
  left: Pick<TimestampShape, "year" | "month" | "day" | "hour" | "minute" | "second" | "milliseconds">,
  right: Pick<TimestampShape, "year" | "month" | "day" | "hour" | "minute" | "second" | "milliseconds">,
): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second
    && left.milliseconds === right.milliseconds;
}

/** Parse an observation timestamp independently of the host machine timezone. */
export function observationTimestampToEpoch(value: unknown): number | null {
  const shape = parseTimestampShape(value);
  if (!shape) return null;
  if (shape.zone) {
    const instant = Date.parse(shape.value);
    return Number.isFinite(instant) ? instant : null;
  }

  const nominalUtc = Date.parse(`${shape.value}Z`);
  if (!Number.isFinite(nominalUtc)) return null;

  // Resolve the Portugal wall-clock value against Europe/Lisbon's DST rules.
  let instant = nominalUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const localAsUtc = datePartsAsUtcMillis(lisbonPartsAt(instant));
    const next = nominalUtc - (localAsUtc - instant);
    if (next === instant) break;
    instant = next;
  }

  return sameClockParts(lisbonPartsAt(instant), shape) ? instant : null;
}

/** Canonicalize a provider timestamp for cross-host freshness comparisons. */
export function observationTimestampToISOString(value: unknown): string | null {
  const instant = observationTimestampToEpoch(value);
  return instant === null ? null : new Date(instant).toISOString();
}

/** Select the newest valid IPMA observation bucket by its parsed instant. */
export function selectLatestObservationTimestamp(value: unknown): string | null {
  if (!isRecord(value)) return null;

  let latest: { timestamp: string; instant: number } | null = null;
  for (const key of Object.keys(value)) {
    const timestamp = normalizeObservationTimestamp(key);
    if (!timestamp) continue;

    const instant = observationTimestampToEpoch(timestamp);
    if (instant === null) continue;
    if (latest === null || instant > latest.instant) {
      latest = { timestamp, instant };
    }
  }

  return latest?.timestamp ?? null;
}
