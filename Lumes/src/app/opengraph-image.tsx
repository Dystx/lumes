// GET /opengraph-image (homepage variant) — dynamic social card.
//
// Auto-served by Next.js at /opengraph-image.png. Layout.tsx references
// it via openGraph.images.
//
// Notes:
//   - `dynamic = "force-dynamic"` — we tried static prerender but
//     Turbopack + ImageResponse had a JSX validation issue. Dynamic
//     render is fine: the response is cached for 60 s upstream at
//     social platforms, so the per-request cost is negligible.
//   - All `<div>` parents with more than one child node explicitly
//     carry `display: flex` in their style block. ImageResponse will
//     refuse to render otherwise.

import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const alt = "lumes.pt — Incêndios florestais em Portugal ao vivo";
export const contentType = "image/png";

const PALETTE = {
  bg: "#0c1821",
  bg2: "#1c2733",
  bg3: "#2b1c1c",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  brand: "#fb923c",
  sev: {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#ca8a04",
    low: "#16a34a",
  },
} as const;

interface OgPayload {
  activeCount: number;
  topDisplayName: string | null;
  topSeverity: "critical" | "high" | "medium" | "low" | null;
  totalCount: number;
  sourceError: string | null;
}

async function loadPayload(): Promise<OgPayload> {
  // Default — used during build / if Prisma can't connect.
  const fallback: OgPayload = {
    activeCount: 0,
    topDisplayName: null,
    topSeverity: null,
    totalCount: 0,
    sourceError: null,
  };
  try {
    const { db } = await import("@/lib/db");
    const [total, active, top] = await Promise.all([
      db.incident.count(),
      db.incident.count({
        where: { status: { in: ["active", "detected", "contained"] } },
      }),
      db.incident.findFirst({
        where: { status: { in: ["active", "detected", "contained"] } },
        orderBy: { lastUpdated: "desc" },
        select: { displayName: true, severity: true },
      }),
    ]);
    return {
      activeCount: active,
      topDisplayName: top?.displayName ?? null,
      topSeverity: (top?.severity as OgPayload["topSeverity"]) ?? null,
      totalCount: total,
      sourceError: null,
    };
  } catch (e) {
    return {
      ...fallback,
      sourceError: e instanceof Error ? e.message : "unknown",
    };
  }
}

export default async function Image() {
  const p = await loadPayload();
  const sevBg = p.topSeverity ? PALETTE.sev[p.topSeverity] : PALETTE.muted;
  const sevLabel = (p.topSeverity ?? "—").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${PALETTE.bg} 0%, ${PALETTE.bg2} 50%, ${PALETTE.bg3} 100%)`,
          color: PALETTE.text,
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 60,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: PALETTE.brand,
              color: PALETTE.bg,
              fontSize: 32,
              fontWeight: 900,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            🔥
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: 18,
              fontSize: 36,
              fontWeight: 700,
              color: PALETTE.brand,
            }}
          >
            lumes.pt
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
            }}
          >
            {p.activeCount > 0
              ? `${p.activeCount} incêndios ativos`
              : "Mapa de incêndios em direto"}
          </div>
          {p.topDisplayName ? (
            <div
              style={{
                display: "flex",
                marginTop: 12,
                fontSize: 30,
                fontWeight: 500,
                color: PALETTE.muted,
              }}
            >
              {`Prioridade: ${p.topDisplayName}`}
            </div>
          ) : null}
        </div>

        {p.topSeverity ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 36,
            }}
          >
            <div
              style={{
                display: "flex",
                background: sevBg,
                color: "white",
                padding: "10px 22px",
                borderRadius: 14,
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "0.05em",
              }}
            >
              {sevLabel}
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 18,
                fontSize: 24,
                color: PALETTE.muted,
              }}
            >
              {`severidade do incêndio mais recente`}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flex: 1 }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid #27272a`,
            paddingTop: 24,
            fontSize: 20,
            color: PALETTE.muted,
          }}
        >
          <div style={{ display: "flex" }}>
            lumes.pt · citizen wildfire intelligence
          </div>
          <div style={{ display: "flex" }}>
            {p.sourceError
              ? `estado a reagrupar dados`
              : `${p.totalCount.toLocaleString("pt-PT")} ocorrências registadas`}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
