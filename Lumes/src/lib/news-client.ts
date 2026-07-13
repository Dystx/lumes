import {
  isValidIsoTimestamp,
  normalizeDataStateMeta,
  type DataStateMeta,
} from "@/lib/data-state";
import type { NewsCategory, NewsItem, NewsResponse } from "@/lib/types";

const NEWS_CATEGORIES: readonly NewsCategory[] = ["incident", "official", "press", "weather"];
const NEWS_SEVERITIES = ["high", "critical"] as const;

const MAX_ITEM_COUNT = 1_000;
const MAX_PLACE_COUNT = 1_000;
const MAX_ID_LENGTH = 200;
const MAX_SOURCE_LENGTH = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;
const MAX_TEXT_LENGTH = 1_000;

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

function safeHttpUrl(value: unknown): string | null {
  const normalized = requiredText(value, MAX_URL_LENGTH);
  if (normalized === null) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? normalized : null;
  } catch {
    return null;
  }
}

function safeHref(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = requiredText(value, MAX_URL_LENGTH);
  if (normalized === null) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  return safeHttpUrl(normalized);
}

function normalizeNewsItem(value: unknown): NewsItem | null {
  if (!isRecord(value)) return null;

  const id = requiredText(value.id, MAX_ID_LENGTH);
  const title = requiredText(value.title, MAX_TITLE_LENGTH);
  const source = requiredText(value.source, MAX_SOURCE_LENGTH);
  const sourceUrl = safeHttpUrl(value.sourceUrl);
  const publishedAt = isValidIsoTimestamp(value.publishedAt) ? value.publishedAt : null;
  const category = typeof value.category === "string" && NEWS_CATEGORIES.includes(value.category as NewsCategory)
    ? value.category as NewsCategory
    : null;
  const summary = optionalText(value.summary, MAX_TEXT_LENGTH);
  const severity = optionalText(value.severity, 40);
  const municipality = optionalText(value.municipality, MAX_TEXT_LENGTH);
  const parish = optionalText(value.parish, MAX_TEXT_LENGTH);
  const locality = optionalText(value.locality, MAX_TEXT_LENGTH);
  const district = optionalText(value.district, MAX_TEXT_LENGTH);
  const href = safeHref(value.href);

  if (
    id === null
    || title === null
    || source === null
    || sourceUrl === null
    || publishedAt === null
    || category === null
    || summary === null
    || severity === null
    || municipality === null
    || parish === null
    || locality === null
    || district === null
    || href === null
    || (severity !== undefined && !NEWS_SEVERITIES.includes(severity as typeof NEWS_SEVERITIES[number]))
    || (value.matched !== undefined && typeof value.matched !== "boolean")
  ) return null;

  return {
    id,
    title,
    source,
    sourceUrl,
    publishedAt,
    category,
    ...(summary === undefined ? {} : { summary }),
    ...(severity === undefined ? {} : { severity }),
    ...(municipality === undefined ? {} : { municipality }),
    ...(parish === undefined ? {} : { parish }),
    ...(locality === undefined ? {} : { locality }),
    ...(district === undefined ? {} : { district }),
    ...(href === undefined ? {} : { href }),
    ...(typeof value.matched === "boolean" ? { matched: value.matched } : {}),
  };
}

function normalizeItemArray(value: unknown): NewsItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEM_COUNT) return null;
  const normalized = value
    .map(normalizeNewsItem)
    .filter((item): item is NewsItem => item !== null);
  if (value.length > 0 && normalized.length === 0) return null;
  return normalized;
}

function hasUniqueIds(items: readonly NewsItem[]): boolean {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

function normalizePlaceArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLACE_COUNT) return null;
  const normalized: string[] = [];
  for (const place of value) {
    const text = requiredText(place, MAX_TEXT_LENGTH);
    if (text === null) return null;
    normalized.push(text);
  }
  return normalized;
}

function normalizeCount(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_ITEM_COUNT
    ? value
    : null;
}

function normalizeCounts(value: unknown): NewsResponse["counts"] | null {
  if (!isRecord(value)) return null;
  const matched = normalizeCount(value.matched);
  const incidents = normalizeCount(value.incidents);
  const press = normalizeCount(value.press);
  const sources = normalizeCount(value.sources);
  if (matched === null || incidents === null || press === null || sources === null) return null;
  return { matched, incidents, press, sources };
}

function normalizeDataState(value: unknown): DataStateMeta | undefined | null {
  if (value === undefined) return undefined;
  return normalizeDataStateMeta(value);
}

/** Normalize one untrusted `/api/news` response envelope. */
export function normalizeNewsResponse(value: unknown): NewsResponse | null {
  if (!isRecord(value)) return null;

  const source = requiredText(value.source, MAX_SOURCE_LENGTH);
  const fetchedAt = isValidIsoTimestamp(value.fetchedAt) ? value.fetchedAt : null;
  const matched = normalizeItemArray(value.matched);
  const incidents = normalizeItemArray(value.incidents);
  const press = normalizeItemArray(value.press);
  const sources = normalizeItemArray(value.sources);
  const placesTracked = normalizePlaceArray(value.placesTracked);
  const placesMatched = normalizePlaceArray(value.placesMatched);
  const placesUnmatched = normalizePlaceArray(value.placesUnmatched);
  const counts = normalizeCounts(value.counts);
  const dataState = normalizeDataState(value.dataState);

  if (
    source === null
    || fetchedAt === null
    || matched === null
    || incidents === null
    || press === null
    || sources === null
    || placesTracked === null
    || placesMatched === null
    || placesUnmatched === null
    || counts === null
    || dataState === null
    || !hasUniqueIds(matched)
    || !hasUniqueIds([...matched, ...incidents])
    || !hasUniqueIds(press)
    || !hasUniqueIds(sources)
    || counts.matched !== matched.length
    || counts.incidents !== incidents.length
    || counts.sources !== sources.length
    // `counts.press` is the full press pool; the response intentionally
    // removes matched rows and caps the remaining display rows.
    || counts.press < matched.length + press.length
    || (dataState?.state === "empty" && counts.matched + counts.incidents + counts.press + counts.sources !== 0)
  ) return null;

  return {
    source,
    fetchedAt,
    matched,
    incidents,
    press,
    sources,
    placesTracked,
    placesMatched,
    placesUnmatched,
    counts,
    ...(dataState === undefined ? {} : { dataState }),
  };
}

/** Stable `useFetch` transform: malformed news becomes a retryable failure. */
export function transformNewsResponse(value: unknown): NewsResponse {
  const normalized = normalizeNewsResponse(value);
  if (normalized === null) throw new Error("Invalid news response envelope");
  return normalized;
}
