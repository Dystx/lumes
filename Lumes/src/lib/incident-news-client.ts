import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";

const NEWS_CATEGORIES = ["incident", "official", "press", "weather"] as const;
type NewsCategory = typeof NEWS_CATEGORIES[number];

const MAX_INCIDENT_ID_LENGTH = 120;
const MAX_ITEM_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_SOURCE_LENGTH = 200;
const MAX_URL_LENGTH = 2_048;
const MAX_TEXT_LENGTH = 1_000;
const MAX_ITEM_COUNT = 1_000;

export interface MatchedNewsItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: NewsCategory;
  summary?: string;
  municipality?: string;
  district?: string;
  matched: boolean;
  matchedOn: string | null;
}

export interface IncidentNewsResponse {
  incidentId: string;
  count: number;
  items: MatchedNewsItem[];
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

function optionalText(value: unknown, maximum: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maximum ? (normalized || undefined) : null;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null;
  return optionalText(value, maximum);
}

function safeHttpUrl(value: unknown): string | null {
  const url = requiredText(value, MAX_URL_LENGTH);
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

function normalizeNewsItem(value: unknown): MatchedNewsItem | null {
  if (!isRecord(value)) return null;

  const id = requiredText(value.id, MAX_ITEM_ID_LENGTH);
  const title = requiredText(value.title, MAX_TITLE_LENGTH);
  const source = requiredText(value.source, MAX_SOURCE_LENGTH);
  const sourceUrl = safeHttpUrl(value.sourceUrl);
  const publishedAt = isValidIsoTimestamp(value.publishedAt) ? value.publishedAt : null;
  const category = enumValue(value.category, NEWS_CATEGORIES);
  const summary = optionalText(value.summary, MAX_TEXT_LENGTH);
  const municipality = optionalText(value.municipality, MAX_TEXT_LENGTH);
  const district = optionalText(value.district, MAX_TEXT_LENGTH);
  const matchedOn = nullableText(value.matchedOn, MAX_TEXT_LENGTH);

  if (
    id === null
    || title === null
    || source === null
    || sourceUrl === null
    || publishedAt === null
    || category === null
    || summary === null
    || municipality === null
    || district === null
    || matchedOn === undefined
    || typeof value.matched !== "boolean"
  ) return null;

  return {
    id,
    title,
    source,
    sourceUrl,
    publishedAt,
    category,
    ...(summary === undefined ? {} : { summary }),
    ...(municipality === undefined ? {} : { municipality }),
    ...(district === undefined ? {} : { district }),
    matched: value.matched,
    matchedOn,
  };
}

/** Normalize one untrusted `/api/incidents/:id/news` response envelope. */
export function normalizeIncidentNewsResponse(value: unknown): IncidentNewsResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const incidentId = requiredText(value.incidentId, MAX_INCIDENT_ID_LENGTH);
  const count = typeof value.count === "number"
    && Number.isInteger(value.count)
    && value.count >= 0
    && value.count <= MAX_ITEM_COUNT
    ? value.count
    : null;
  if (incidentId === null || count === null) return null;

  let dataState: DataStateMeta | undefined;
  if (value.dataState !== undefined) {
    dataState = normalizeDataStateMeta(value.dataState) ?? undefined;
    if (dataState === undefined) return null;
  }

  const items = value.items
    .map(normalizeNewsItem)
    .filter((item): item is MatchedNewsItem => item !== null);

  // Preserve the existing mixed-row policy, but never silently change the
  // provider's declared count. A malformed non-empty response therefore
  // becomes retryable through the stable useFetch transform.
  if (value.items.length > 0 && items.length === 0) return null;
  if (count !== items.length) return null;
  if (dataState?.state === "empty" && count !== 0) return null;

  return {
    incidentId,
    count,
    items,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable useFetch transform: malformed news becomes a retryable failure. */
export function transformIncidentNewsResponse(value: unknown): IncidentNewsResponse {
  const normalized = normalizeIncidentNewsResponse(value);
  if (normalized === null) throw new Error("Invalid incident news response envelope");
  return normalized;
}
