import { isValidIsoTimestamp, normalizeDataStateMeta, type DataStateMeta } from "@/lib/data-state";
import type { RegionalCommand, RegionalCommandCoordinate, RegionalCommandsResponse } from "@/lib/types";

const MAX_COUNT = 1_000;
const MAX_TEXT_LENGTH = 200;
const MAX_AREA = 1_000_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
}

function nonNegativeArea(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_AREA ? value : null;
}

function normalizeCoordinates(value: unknown, depth = 0): RegionalCommandCoordinate[] | null {
  if (!Array.isArray(value) || value.length === 0 || depth > 8) return null;
  if (value.every((item) => typeof item === "number")) {
    if (value.length !== 2 || value.some((item) => !Number.isFinite(item))) return null;
    return value as number[];
  }
  if (value.some((item) => typeof item === "number")) return null;
  const nested = value.map((item) => normalizeCoordinates(item, depth + 1));
  if (nested.some((item) => item === null)) return null;
  return nested as RegionalCommandCoordinate[];
}

function normalizeGeometry(value: unknown): RegionalCommand["geometry"] | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const type = boundedText(value.type);
  const coordinates = normalizeCoordinates(value.coordinates);
  if (type === null || coordinates === null) return null;
  return { type, coordinates };
}

function normalizeCommand(value: unknown): RegionalCommand | null {
  if (!isRecord(value)) return null;
  const id = boundedText(value.id);
  const name = boundedText(value.name);
  const region = boundedText(value.region);
  const area = nonNegativeArea(value.area);
  const geometry = normalizeGeometry(value.geometry);
  if (id === null || name === null || region === null || area === null || geometry === null && value.geometry !== null) return null;
  return {
    id,
    name,
    region,
    ...(area === undefined ? {} : { area }),
    geometry,
  };
}

/** Normalize one untrusted successful `/api/regional-commands` response. */
export function normalizeRegionalCommandsResponse(value: unknown): (RegionalCommandsResponse & { dataState?: DataStateMeta }) | null {
  if (!isRecord(value) || value.source !== "anepc-regional-commands") return null;
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const count = typeof value.count === "number" && Number.isInteger(value.count) && value.count >= 0 && value.count <= MAX_COUNT
    ? value.count
    : null;
  const rawCommands = Array.isArray(value.commands) && value.commands.length <= MAX_COUNT ? value.commands : null;
  const dataState = value.dataState === undefined ? undefined : normalizeDataStateMeta(value.dataState);
  if (fetchedAt === null || count === null || rawCommands === null || dataState === null) return null;

  const commands: RegionalCommand[] = [];
  const seenIds = new Set<string>();
  for (const rawCommand of rawCommands) {
    const normalized = normalizeCommand(rawCommand);
    if (normalized === null) continue;
    if (seenIds.has(normalized.id)) return null;
    seenIds.add(normalized.id);
    commands.push(normalized);
  }

  if (
    commands.length !== count
    || (rawCommands.length > 0 && commands.length === 0)
    || (dataState?.state === "empty" && count !== 0)
  ) return null;

  return {
    source: "anepc-regional-commands",
    fetchedAt,
    count,
    commands,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed command data becomes retryable. */
export function transformRegionalCommandsResponse(value: unknown): RegionalCommandsResponse & { dataState?: DataStateMeta } {
  const normalized = normalizeRegionalCommandsResponse(value);
  if (normalized === null) throw new Error("Invalid regional commands response envelope");
  return normalized;
}
