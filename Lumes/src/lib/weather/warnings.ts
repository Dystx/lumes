export type WarningLevel = "yellow" | "orange" | "red";

export interface NormalizedWeatherWarning {
  area: string;
  type: string;
  text: string;
  level: WarningLevel;
  startTime: string;
  endTime: string;
}

interface WarningRecord {
  idAreaAviso?: unknown;
  awarenessTypeName?: unknown;
  awarenessLevelID?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  text?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWarningLevel(value: unknown): value is WarningLevel {
  return value === "yellow" || value === "orange" || value === "red";
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function validTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const zoneOffset = !zone || zone === "Z" ? null : zone.match(/^[+-](\d{2}):(\d{2})$/);
  const zoneHour = zoneOffset ? Number(zoneOffset[1]) : 0;
  const zoneMinute = zoneOffset ? Number(zoneOffset[2]) : 0;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  return Number.isFinite(calendarDate.getTime())
    && calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
    && hour >= 0 && hour <= 23
    && minute >= 0 && minute <= 59
    && second >= 0 && second <= 59
    && zoneHour >= 0 && zoneHour <= 23
    && zoneMinute >= 0 && zoneMinute <= 59;
}

/** Normalize the untrusted IPMA warning array into the public warning DTO. */
export function normalizeWeatherWarnings(value: unknown): NormalizedWeatherWarning[] | null {
  if (!Array.isArray(value)) return null;

  let recognizedRows = 0;
  let malformedRecognizedRows = 0;
  const warnings = value.flatMap((raw): NormalizedWeatherWarning[] => {
    if (!isRecord(raw)) return [];
    const warning: WarningRecord = raw;
    if (!isWarningLevel(warning.awarenessLevelID)) return [];
    recognizedRows += 1;

    const area = nonEmptyString(warning.idAreaAviso);
    const type = nonEmptyString(warning.awarenessTypeName);
    const startTime = nonEmptyString(warning.startTime);
    const endTime = typeof warning.endTime === "string" ? warning.endTime : null;
    const text = typeof warning.text === "string" ? warning.text : null;

    if (
      area === null
      || type === null
      || startTime === null
      || !validTimestamp(startTime)
      || endTime === null
      || (endTime.length > 0 && !validTimestamp(endTime))
      || text === null
    ) {
      malformedRecognizedRows += 1;
      return [];
    }

    return [{ area, type, text, level: warning.awarenessLevelID, startTime, endTime }];
  });

  return recognizedRows > 0 && malformedRecognizedRows === recognizedRows ? null : warnings;
}
