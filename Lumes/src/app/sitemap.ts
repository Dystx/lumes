// Dynamic sitemap generation. Next.js serves this at /sitemap.xml.
//
// Includes:
//   - Static routes: /, /status, /privacy
//   - Active incident URLs: /incident/[id] (uses the page-level
//     route conventions; if you add a dedicated incident page
//     route later, this is the place to wire it up)

import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/status`,
      lastModified: new Date(),
      changeFrequency: "minute",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date("2026-07-01"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Active incidents
  let incidentRoutes: MetadataRoute.Sitemap = [];
  try {
    const active = await db.incident.findMany({
      where: { status: { in: ["active", "detected", "contained", "monitoring"] } },
      select: { id: true, lastUpdated: true },
      orderBy: { lastUpdated: "desc" },
      take: 500, // sitemap-protocol allows up to 50,000 URLs
    });
    incidentRoutes = active.map((i) => ({
      url: `${SITE_URL}/incident/${i.id}`,
      lastModified: i.lastUpdated,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB unavailable; serve only static routes
  }

  return [...staticRoutes, ...incidentRoutes];
}
