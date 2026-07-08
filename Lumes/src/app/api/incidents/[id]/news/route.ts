// GET /api/incidents/[id]/news — news articles matched to a specific incident
//
// Given an incident id, fetch the latest fire-related press and filter
// to articles that mention the incident's municipality, parish, district,
// or locality. Returns at most 6 articles.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: "incident" | "official" | "press" | "weather";
  summary?: string;
  municipality?: string;
  district?: string;
  matched: boolean;
  matchedOn: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; data: NewsItem[] }>();

// Inline the fire-related detection to avoid importing the full RSS pipeline
const FIRE_KEYWORDS = [
  "incêndio florestal", "incendio florestal", "fogo florestal", "fogo rural",
  "queimada", "queimadas", "bombeiros", "bombeiro",
  "anepe", "protecção civil", "protecao civil", "prociv",
  "meios aéreos", "meios aereos", "aeronave", "aeronaves",
  "combate a incêndio", "rescaldo", "evacuação de população",
  "risco de incêndio", "risco máximo de incêndio", "perigo de incêndio",
];
const FIRE_KEYWORDS_EN = [
  "wildfire", "forest fire", "bushfire",
  "fire brigade", "fire crew", "firefighting",
];
const CONTEXT_WORDS = [
  "queimada", "bombeiro", "bombeiros", "evacuação", "chamas",
  "anepe", "protecção civil", "protecao civil", "prociv",
  "sapadores", "floresta", "florestal", "incêndio", "incendio",
  "rcm", "fwi", "sep", "aeronave", "aeronaves", "helicóptero",
];
const AMBIGUOUS_FIRE_WORDS = ["fogo", "fogos"];

function isFireRelated(title: string, description: string): boolean {
  const blob = `${title} ${description}`.toLowerCase();
  if (FIRE_KEYWORDS.some((k) => blob.includes(k))) return true;
  if (FIRE_KEYWORDS_EN.some((k) => blob.includes(k))) return true;
  const hasAmbiguous = AMBIGUOUS_FIRE_WORDS.some((k) => blob.includes(k));
  if (!hasAmbiguous) return false;
  return CONTEXT_WORDS.some((k) => blob.includes(k));
}

const RSS_FEEDS = [
  { url: "https://www.publico.pt/api/list/rss/pais", source: "Público" },
  { url: "https://observador.pt/rss/ultimas/", source: "Observador" },
  { url: "https://www.dn.pt/feed/", source: "Diário de Notícias" },
  { url: "https://eco.sapo.pt/category/sustentabilidade/feed/", source: "ECO" },
  { url: "https://www.noticiasaominuto.com/rss/pais", source: "Notícias ao Minuto" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRSS(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    guid: string;
  }> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag: string) => {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = re.exec(block);
      if (!mm) return "";
      let v = mm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      return v.trim();
    };
    const title = decodeEntities(pick("title"));
    const link = decodeEntities(pick("link"));
    const description = decodeEntities(pick("description"));
    const pubDate = decodeEntities(pick("pubDate"));
    const guid = decodeEntities(pick("guid")) || link;
    if (!title) continue;
    items.push({ title, link, description, pubDate, guid });
  }
  return items;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check cache
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({
      incidentId: id,
      count: cached.data.length,
      items: cached.data,
    });
  }

  // Look up the incident in the DB to get location info
  let incident: any = null;
  try {
    incident = await db.incident.findFirst({
      where: { OR: [{ id }, { legacyId: id }] },
    });
  } catch {
    // If DB is unavailable, try live incidents
  }

  // Build place names to match against
  const places: string[] = [];
  if (incident) {
    if (incident.parish) places.push(incident.parish);
    if (incident.municipality) places.push(incident.municipality);
    if (incident.district) places.push(incident.district);
  }
  if (places.length === 0) {
    return NextResponse.json({ incidentId: id, count: 0, items: [] });
  }

  // Fetch all RSS feeds
  const allItems: Array<{
    title: string;
    source: string;
    link: string;
    description: string;
    pubDate: string;
  }> = [];

  for (const feed of RSS_FEEDS) {
    try {
      const r = await fetch(feed.url, {
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "lumes.pt/0.1", Accept: "application/rss+xml" },
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRSS(xml);
      for (const it of items) {
        allItems.push({
          title: it.title,
          link: it.link,
          source: feed.source,
          description: it.description,
          pubDate: it.pubDate,
        });
      }
    } catch {
      // ignore
    }
  }

  // Filter for fire-related AND match to incident location
  const matchedItems: NewsItem[] = [];
  const seen = new Set<string>();

  for (const it of allItems) {
    if (!isFireRelated(it.title, it.description)) continue;
    const blob = normalise(`${it.title} ${it.description}`);
    let matchedOn: string | null = null;
    for (const place of places) {
      const np = normalise(place);
      if (np.length < 4) continue;
      if (blob.includes(np)) {
        matchedOn = place;
        break;
      }
    }
    if (!matchedOn) continue;

    const key = it.link || it.title;
    if (seen.has(key)) continue;
    seen.add(key);

    matchedItems.push({
      id: `news-${id}-${it.link || it.title}`.slice(0, 200),
      title: it.title,
      source: it.source,
      sourceUrl: it.link,
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
      category: "press",
      summary: it.description.slice(0, 200),
      municipality: incident?.municipality ?? undefined,
      district: incident?.district ?? undefined,
      matched: true,
      matchedOn,
    });

    if (matchedItems.length >= 6) break;
  }

  matchedItems.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  cache.set(id, { ts: Date.now(), data: matchedItems });

  return NextResponse.json({
    incidentId: id,
    count: matchedItems.length,
    items: matchedItems,
  });
}
