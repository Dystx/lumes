// GET /api/news — recent fire-related news + curated official sources.
//
// Strategy:
//   1. Pull headlines from 4 verified Portuguese RSS feeds (Público,
//      Observador, DN, ECO) and a few alternative media outlets.
//   2. Filter for fire/wildfire keywords (PT + EN).
//   3. Cross-reference against active incident municipalities —
//      when a headline mentions a place that has an active ANEPC
//      incident, surface it as a "matched" item so the operator can
//      jump straight to the article + the map view of that incident.
//
// We deliberately do NOT scrape news sites directly (ToS + fragile
// parsers). RSS is stable, open, and intended for this use.
//
// Caching: 5 minutes (matches /api/incidents TTL loosely).

import { NextResponse } from "next/server";
import { cached } from "@/lib/api/cache";
import { classifyDataState, createDataStateMeta } from "@/lib/data-state";
import { logServerFailure } from "@/lib/observability";
import type { NewsItem, NewsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portuguese fire-related keywords (lowercased).
// Each item is a single fire-specific token. We require AT LEAST 1 of these
// to be present in the headline OR description to qualify as fire-related.
// Generic terms like "fogo" (which is too broad — matches "ponto de fogo",
// "fogo de artifício", "fogo amigo" etc.) have been REMOVED to stop unrelated
// news (soccer, traffic, security, etc.) from being classified as fires.
const FIRE_KEYWORDS = [
  // Specific wildfire types
  "incêndio florestal", "incendio florestal", "incêndios florestais",
  "incendios florestais", "incêndio rural", "incêndio urbano",
  "fogo florestal", "fogo rural", "fogos florestais",
  "incêndio ativo", "incêndio ativo", "incêndios ativos",
  "fogo de mato", "fogo em mato", "queimada", "queimadas",
  // Emergency services
  "bombeiros", "bombeiro", "corporação de bombeiros",
  "anepe", "protecção civil", "protecao civil", "prociv",
  "sapadores", "florestais",
  // Aerial / response
  "meios aéreos", "meios aereos", "aeronave", "aeronaves",
  "helicóptero de combate", "helicóptero bombeiro", "canadair",
  // Operations
  "combate a incêndio", "combate às chamas", "rescaldo",
  "evacuação de população", "ordem de evacuação",
  "reativação", "reativação de incêndio", "reacendimento",
  // Meteorological risk indicators
  "risco de incêndio", "risco máximo de incêndio", "perigo de incêndio",
  "risco de ignição", "rcm", "fwi", "sep",
  // Portuguese region names commonly associated with fire reports
  "serra da estrela", "lousã", "manteigas", "belmonte",
  "chamusca", "mação", "sardoal", "proença-a-nova",
  "oleiros", "pampilhosa da serra", "pedrógão grande",
  "alijó", "valpaços", "murça", "sabrosa", "alijó",
];

// English fallbacks (cross-language wildfire terms)
const FIRE_KEYWORDS_EN = [
  "wildfire", "forest fire", "bushfire", "grass fire",
  "brush fire", "active fire", "fire brigade", "fire crew",
  "firefighting", "fire evacuation", "fire danger", "fire risk",
  "civil protection",
];

// Some words that, on their own, are TOO GENERIC to qualify a story as
// fire-related. We exclude them from being enough on their own (must be
// combined with another fire-specific word).
const AMBIGUOUS_FIRE_WORDS = [
  "fogo", "fogos", "fogar", "foguear",
];

// Verified, working RSS feeds for Portuguese general news.
// All URLs were hand-checked on 2026-07-06 with HTTP 200 + valid RSS XML.
const RSS_FEEDS: { url: string; source: string; sourceUrl: string }[] = [
  { url: "https://www.publico.pt/api/list/rss/pais", source: "Público", sourceUrl: "https://www.publico.pt/" },
  { url: "https://observador.pt/rss/ultimas/", source: "Observador", sourceUrl: "https://observador.pt/" },
  { url: "https://www.dn.pt/feed/", source: "Diário de Notícias", sourceUrl: "https://www.dn.pt/" },
  { url: "https://eco.sapo.pt/category/sustentabilidade/feed/", source: "ECO", sourceUrl: "https://eco.sapo.pt/" },
  { url: "https://www.noticiasaominuto.com/rss/pais", source: "Notícias ao Minuto", sourceUrl: "https://www.noticiasaominuto.com/pais" },
];

// Curated official sources — every URL verified HTTP 200 on 2026-07-06.
const OFFICIAL_SOURCES: NewsItem[] = [
  {
    id: "src-anepc",
    title: "ANEPC — Autoridade Nacional de Emergência e Proteção Civil",
    source: "ANEPC",
    sourceUrl: "https://www.prociv.pt/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "official",
    summary: "Sítio institucional — comunicados, despacho de meios e relatórios.",
  },
  {
    id: "src-ipma",
    title: "IPMA — Instituto Português do Mar e da Atmosfera",
    source: "IPMA",
    sourceUrl: "https://www.ipma.pt/pt/index.html",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "weather",
    summary: "Boletins meteorológicos, avisos e risco de incêndio (RCM / FWI).",
  },
  {
    id: "src-ipma-incendios",
    title: "IPMA — Perigo de Incêndio Rural",
    source: "IPMA",
    sourceUrl: "https://www.ipma.pt/pt/ambiente.incendio/index.html",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "weather",
    summary: "Mapas diários de RCM (risco de incêndio rural) para Portugal continental e Madeira.",
  },
  {
    id: "src-agif",
    title: "AGIF — Agência para a Gestão Integrada de Fogos Rurais",
    source: "AGIF",
    sourceUrl: "https://www.agif.pt/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "official",
    summary: "Estratégia nacional, SGIFR, PNGIFR, PNA e relatórios anuais.",
  },
  {
    id: "src-icnf",
    title: "ICNF — Instituto da Conservação da Natureza e das Florestas",
    source: "ICNF",
    sourceUrl: "https://www.icnf.pt/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "official",
    summary: "Matas nacionais, áreas protegidas e sistemas de defesa da floresta.",
  },
  {
    id: "src-effis",
    title: "EFFIS — European Forest Fire Information System",
    source: "EFFIS / JRC",
    sourceUrl: "https://effis.jrc.ec.europa.eu/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "weather",
    summary: "Deteção, dano, emissões e risco de incêndios florestais (Copernicus EMS).",
  },
  {
    id: "src-effis-csv",
    title: "EFFIS — Current Situation Viewer (focos activos Europa)",
    source: "EFFIS / JRC",
    sourceUrl: "https://effis.jrc.ec.europa.eu/applications/current-situation-viewer",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "weather",
    summary: "Mapa de focos activos na Europa, actualizado várias vezes ao dia.",
  },
  {
    id: "src-eumetsat",
    title: "EUMETSAT — Meteosat Second Generation",
    source: "EUMETSAT",
    sourceUrl: "https://www.eumetsat.int/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "weather",
    summary: "Imagens de satélite, focos de calor e animação de incêndios em tempo real.",
  },
  {
    id: "src-gov-pt",
    title: "Governo de Portugal — Comunicados",
    source: "XXIII Governo",
    sourceUrl: "https://www.portugal.gov.pt/pt/gc23/comunicacao/noticias",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "official",
    summary: "Notas oficiais do governo sobre proteção civil e resposta a emergências.",
  },
  {
    id: "src-lusa",
    title: "LUSA — Agência de Notícias de Portugal",
    source: "LUSA",
    sourceUrl: "https://www.lusa.pt/",
    publishedAt: "2026-01-01T00:00:00Z",
    category: "press",
    summary: "Serviço público de notícias — fonte primária para ANEPC e proteção civil.",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Minimal RSS 2.0 parser — extracts <item> blocks and a few well-known fields.
// Robust enough for the feeds we use; doesn't depend on heavy XML libs.
function parseRSS(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category: string;
  guid: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    category: string;
    guid: string;
  }> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag: string) => {
      // Match both <tag>…</tag> and <tag attr="…">…</tag> (CDATA-aware)
      const re = new RegExp(
        `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        "i"
      );
      const mm = re.exec(block);
      if (!mm) return "";
      let v = mm[1];
      // Strip CDATA wrappers
      v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      return v.trim();
    };
    const title = decodeEntities(pick("title"));
    const link = decodeEntities(pick("link"));
    const description = decodeEntities(pick("description"));
    const pubDate = decodeEntities(pick("pubDate"));
    const category = decodeEntities(pick("category"));
    const guid = decodeEntities(pick("guid")) || link;
    if (!title) continue;
    items.push({ title, link, description, pubDate, category, guid });
  }
  return items;
}

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

function isFireRelated(title: string, description: string): boolean {
  const titleBlob = title.toLowerCase();
  const fullBlob = `${title} ${description}`.toLowerCase();

  // Strategy: include any article that EITHER:
  // (a) has a specific wildfire term in the TITLE, OR
  // (b) has "incêndio" + a fire-context word in the FULL text, OR
  // (c) has "fogo" + multiple fire-context words (avoid "fogo de artifício")

  // (a) Specific keywords in TITLE — strongest signal
  const hasTitleFire =
    titleBlob.includes("incêndio") ||
    titleBlob.includes("incendio") ||
    titleBlob.includes("fogo florestal") ||
    titleBlob.includes("fogo rural") ||
    titleBlob.includes("queimada") ||
    titleBlob.includes("bombeiro") ||
    titleBlob.includes("bombeiros") ||
    titleBlob.includes("anepe") ||
    titleBlob.includes("protecção civil") ||
    titleBlob.includes("protecao civil") ||
    titleBlob.includes("helicóptero") ||
    titleBlob.includes("canadair") ||
    titleBlob.includes("evacuação") ||
    titleBlob.includes("rcm") ||
    titleBlob.includes("fwi");
  if (hasTitleFire) return true;

  // Check for specific (unambiguous) fire keywords in full text
  const hasSpecificPT = FIRE_KEYWORDS.some((k) => fullBlob.includes(k));
  const hasSpecificEN = FIRE_KEYWORDS_EN.some((k) => fullBlob.includes(k));
  if (hasSpecificPT || hasSpecificEN) return true;

  // (b) "incêndio" + at least 1 fire-context word anywhere
  const hasIncendio = fullBlob.includes("incêndio") || fullBlob.includes("incendio");
  if (hasIncendio) {
    const CONTEXT_WORDS = [
      "queimada", "bombeiro", "bombeiros", "evacuação", "evacuados",
      "chamas", "chama", "anepe", "protecção civil", "protecao civil", "prociv",
      "sapadores", "floresta", "florestal",
      "rcm", "fwi", "sep", "aeronave", "aeronaves", "helicóptero",
      "vegetação", "vegetacao",
    ];
    return CONTEXT_WORDS.some((k) => fullBlob.includes(k));
  }

  return false;
}

async function fetchFeed(feed: { url: string; source: string; sourceUrl: string }): Promise<NewsItem[]> {
  try {
    const r = await fetch(feed.url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "lumes.pt-Platform/0.1 (+https://lumes.pt; news-aggregator)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      // Cache RSS at the edge for 60s — RSS feeds aren't sub-second real-time
      next: { revalidate: 60 },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = parseRSS(xml);
    const out: NewsItem[] = [];
    for (const it of items) {
      if (!isFireRelated(it.title, it.description)) continue;
      const publishedAt = it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString();
      const id = `rss-${feed.source}-${it.guid || it.link || it.title}`.slice(0, 200);
      out.push({
        id,
        title: it.title,
        source: feed.source,
        sourceUrl: it.link || feed.sourceUrl,
        publishedAt,
        category: "press",
        summary: it.description.slice(0, 240),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function loadPressNews(): Promise<NewsItem[]> {
  const results = await Promise.all(RSS_FEEDS.map(fetchFeed));
  // Newest first, dedupe by URL
  const all = results.flat();
  all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const it of all) {
    const key = it.sourceUrl || it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  return unique.slice(0, 12);
}

async function loadIncidentNews(): Promise<{ items: NewsItem[]; places: string[] }> {
  // Derive news items directly from /api/incidents via internal fetch
  const port = process.env.PORT ?? "3000";
  const host = process.env.SOURCE_HEALTH_HOST ?? `localhost:${port}`;
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  try {
    const r = await fetch(`${proto}://${host}/api/incidents`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) return { items: [], places: [] };
    const data: unknown = await r.json();
    const items: NewsItem[] = [];
    const incidents = isRecord(data) && Array.isArray(data.incidents)
      ? data.incidents.filter(isRecord)
      : [];
    const places: string[] = [];
    for (const inc of incidents) {
      const id = typeof inc.id === "string" ? inc.id : null;
      const sev = typeof inc.severity === "string" ? inc.severity : "";
      if (!id) continue;
      if (sev !== "critical" && sev !== "high") continue;
      const props = isRecord(inc.properties) ? inc.properties : {};
      const statusText = (typeof props.statusText === "string" && props.statusText)
        || (typeof props.statusGroup === "string" && props.statusGroup)
        || "Ocorrência ativa";
      const displayName = typeof inc.displayName === "string" ? inc.displayName : "";
      const municipality = typeof props.municipality === "string" ? props.municipality : undefined;
      const parish = typeof props.parish === "string" ? props.parish : undefined;
      const locality = typeof props.locality === "string" ? props.locality : undefined;
      const district = typeof props.region === "string" ? props.region : undefined;
      const where = municipality || displayName || "Portugal";
      let hasStructuredPlace = false;
      items.push({
        id: `inc-${id}`,
        title: `${statusText} — ${where}`,
        source: "ANEPC (via Lumes)",
        sourceUrl: `https://lumes.pt/`,
        publishedAt: (typeof inc.firstDetected === "string" && inc.firstDetected)
          || (typeof inc.observedAt === "string" && inc.observedAt)
          || new Date().toISOString(),
        category: "incident",
        summary: displayName || where,
        severity: sev,
        municipality,
        parish,
        locality,
        district,
        href: `/?incident=${id}`,
      });
      // Collect all place names we can cross-match against — parish + municipality + district + locality
      for (const k of ["municipality", "parish", "locality", "region"] as const) {
        const v = props[k];
        if (v && typeof v === "string" && v.length >= 3) {
          places.push(v.trim());
          hasStructuredPlace = true;
        }
      }
      // Use the display name only when no structured locality is available.
      // Otherwise a longer label such as "Incêndio em Sintra" can cause the
      // deduper to discard the useful municipality "Sintra" and miss a match.
      const dn = displayName.trim();
      if (dn && !hasStructuredPlace) places.push(dn);
    }
    items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return { items: items.slice(0, 6), places: dedupePlaces(places) };
  } catch {
    return { items: [], places: [] };
  }
}

// Normalise a place name for cross-matching: strip accents, lower, drop diacritics
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

// Dedupe places, keep longer/shortest representative, also drop very short ones (<4 chars)
function dedupePlaces(places: string[]): string[] {
  const norm = new Map<string, string>(); // norm -> original
  for (const p of places) {
    const np = normalise(p);
    if (np.length < 4) continue;
    if (!norm.has(np)) norm.set(np, p.trim());
  }
  // Drop places that are substrings of another, larger place (e.g. "Viseu" inside "Viseu, Portugal")
  const arr = Array.from(norm.entries())
    .map(([n, o]) => ({ n, o }))
    .sort((a, b) => b.n.length - a.n.length);
  const kept: { n: string; o: string }[] = [];
  for (const cand of arr) {
    if (kept.some((k) => k.n.includes(cand.n))) continue;
    kept.push(cand);
  }
  return kept.map((k) => k.o);
}

function crossMatch(
  pressItems: NewsItem[],
  activePlaces: string[],
): { matched: NewsItem[]; matchedPlaces: string[]; unmatchedPlaces: string[] } {
  const matched: NewsItem[] = [];
  const matchedPlaceIds = new Set<string>();
  for (const item of pressItems) {
    const blob = normalise(`${item.title} ${item.summary ?? ""}`);
    for (const place of activePlaces) {
      const np = normalise(place);
      if (np.length < 4) continue;
      if (blob.includes(np)) {
        matched.push({ ...item, matched: true });
        matchedPlaceIds.add(place);
        break;
      }
    }
  }
  const unmatched = activePlaces.filter((p) => !matchedPlaceIds.has(p));
  return {
    matched,
    matchedPlaces: activePlaces.filter((p) => matchedPlaceIds.has(p)),
    unmatchedPlaces: unmatched,
  };
}

export async function GET() {
  try {
    const data = await cached("news", 5 * 60 * 1000, async () => {
      const [pressNews, incidentResult] = await Promise.all([
        loadPressNews(),
        loadIncidentNews(),
      ]);
      const { matched, matchedPlaces, unmatchedPlaces } = crossMatch(pressNews, incidentResult.places);
      const fetchedAt = new Date().toISOString();
      const counts = {
        matched: matched.length,
        incidents: incidentResult.items.length,
        press: pressNews.length,
        sources: OFFICIAL_SOURCES.length,
      };
      const body: NewsResponse = {
        source: "lumes-curated",
        fetchedAt,
        matched,
        incidents: incidentResult.items,
        press: pressNews.filter((p) => !matched.some((m) => m.id === p.id)).slice(0, 6),
        sources: OFFICIAL_SOURCES,
        placesTracked: incidentResult.places,
        placesMatched: matchedPlaces,
        placesUnmatched: unmatchedPlaces,
        counts,
        dataState: createDataStateMeta(
          classifyDataState({ count: counts.matched + counts.incidents + counts.press + counts.sources }),
          undefined,
          fetchedAt,
          "lumes-curated-news",
        ),
      };
      return body;
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err: unknown) {
    logServerFailure("news.fetch", err, { route: "/api/news", retryable: true });
    const fetchedAt = new Date().toISOString();
    const counts = { matched: 0, incidents: 0, press: 0, sources: OFFICIAL_SOURCES.length };
    const fallback: NewsResponse = {
      source: "lumes-curated",
      fetchedAt,
      matched: [],
      incidents: [],
      press: [],
      sources: OFFICIAL_SOURCES,
      placesTracked: [],
      placesMatched: [],
      placesUnmatched: [],
      counts,
      dataState: createDataStateMeta("retryable-error", "News source unavailable", fetchedAt, "lumes-curated-news"),
    };
    return NextResponse.json(
      { ...fallback, error: "News data is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
