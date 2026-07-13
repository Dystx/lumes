import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Keep standalone tracing inside this Bun-managed checkout. The shared
  // parent workspace also contains a pnpm lockfile and a different Prisma
  // tree; allowing Next to infer that root can package the wrong runtime.
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: false,
  async headers() {
    const noStoreHtmlHeaders = [{ key: "Cache-Control", value: "no-store" }];

    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/",
        headers: noStoreHtmlHeaders,
      },
      {
        source: "/status",
        headers: noStoreHtmlHeaders,
      },
      {
        source: "/privacy",
        headers: noStoreHtmlHeaders,
      },
      {
        source: "/newsletter",
        headers: noStoreHtmlHeaders,
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.cartocdn.com https://basemaps.cartocdn.com https://tiles.maps.eox.at https://api.ipma.pt https://api.open-meteo.com https://api.airplanes.live https://opendata.adsb.fi https://opensky-network.org https://overpass-api.de https://overpass.kumi.systems https://maps.mail.ru https://services-eu1.arcgis.com https://firms.modaps.eosdis.nasa.gov; font-src 'self' data: https:; worker-src 'self' blob:;",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
