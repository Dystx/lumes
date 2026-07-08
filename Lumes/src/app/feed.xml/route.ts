// RSS 2.0 feed of active incidents, served at /feed.xml.
//
// Audience: journalists, emergency-services comms, automated
// monitors that want a programmatic feed without polling the
// HTML page.
//
// Cached server-side for 60 s (the cron ingest updates every
// 60 s anyway).

import { db } from "@/lib/db";
import type { Incident } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt";
const SITE_TITLE = "lumes.pt — Incêndios florestais em Portugal";
const SITE_DESCRIPTION =
  "Feed RSS de incêndios ativos em Portugal continental e ilhas. Dados oficiais ANEPC, IPMA, NASA FIRMS.";

const SEVERITY_LABEL_PT: Record<string, string> = {
  critical: "crítico",
  high: "alto",
  medium: "médio",
  low: "baixo",
};
const STATUS_LABEL_PT: Record<string, string> = {
  detected: "detectado",
  active: "em curso",
  contained: "contingido",
  monitoring: "em vigilância",
  resolved: "resolvido",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function buildRss(items: Incident[]): string {
  const lastBuild = items[0]?.lastUpdated
    ? rfc822(new Date(items[0].lastUpdated))
    : rfc822(new Date());

  const xmlItems = items
    .map((i) => {
      const title = `[${(i.severity ?? "").toUpperCase()}] Incêndio em ${i.municipality ?? i.displayName ?? "Portugal"}`;
      const link = `${SITE_URL}/incident/${i.id}`;
      const pubDate = rfc822(new Date(i.lastUpdated));
      const description = [
        i.displayName ?? "",
        i.municipality ? `Concelho: ${i.municipality}` : "",
        i.district ? `Distrito: ${i.district}` : "",
        i.status ? `Estado: ${STATUS_LABEL_PT[i.status] ?? i.status}` : "",
        i.severity ? `Severidade: ${SEVERITY_LABEL_PT[i.severity] ?? i.severity}` : "",
        i.personnelTotal ? `Operacionais no local: ${i.personnelTotal}` : "",
        i.assetsAerial ? `Meios aéreos: ${i.assetsAerial}` : "",
        i.estimatedAreaHa ? `Área estimada: ${i.estimatedAreaHa.toFixed(1)} ha` : "",
        `Coordenadas: ${i.latitude?.toFixed(4)}, ${i.longitude?.toFixed(4)}`,
      ]
        .filter(Boolean)
        .join("\n");

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(i.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      <category>${escapeXml(i.severity ?? "")}</category>
      <category>${escapeXml(i.status ?? "")}</category>
      <geo:lat>${i.latitude}</geo:lat>
      <geo:long>${i.longitude}</geo:long>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>pt-PT</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>1</ttl>
    <image>
      <url>${escapeXml(`${SITE_URL}/icon-512.png`)}</url>
      <title>${escapeXml(SITE_TITLE)}</title>
      <link>${escapeXml(SITE_URL)}</link>
    </image>
${xmlItems}
  </channel>
</rss>`;
}

export async function GET() {
  let items: Incident[] = [];
  try {
    items = await db.incident.findMany({
      where: { status: { in: ["active", "detected", "contained", "monitoring"] } },
      orderBy: { lastUpdated: "desc" },
      take: 100,
    });
  } catch {
    // DB unavailable; emit empty feed
  }

  const body = buildRss(items);

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
