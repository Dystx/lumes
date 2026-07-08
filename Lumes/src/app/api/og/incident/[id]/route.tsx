// GET /api/og/incident/[id] — per-incident Open Graph card.
//
// Notes:
//   - Dynamic render to sidestep Turbopack prerender JSX validation
//     issues in the previous version.
//   - Every <div> with more than one child carries `display: flex`
//     explicitly (ImageResponse requirement).

import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const alt = "lumes.pt — Incêndio ativo";
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

const STATUS_PT: Record<string, string> = {
  detected: "Detectado",
  active: "Em curso",
  contained: "Contido",
  monitoring: "Em vigilância",
  resolved: "Resolvido",
};

interface IncidentRow {
  displayName: string | null;
  municipality: string | null;
  district: string | null;
  severity: string;
  status: string;
  personnelTotal: number;
  assetsGround: number;
  assetsAerial: number;
  estimatedAreaHa: number;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let inc: IncidentRow | null = null;
  try {
    inc = await db.incident.findUnique({
      where: { id },
      select: {
        displayName: true,
        municipality: true,
        district: true,
        severity: true,
        status: true,
        personnelTotal: true,
        assetsGround: true,
        assetsAerial: true,
        estimatedAreaHa: true,
      },
    });
  } catch {
    inc = null;
  }

  const sevKey = (inc?.severity ?? "medium") as keyof typeof PALETTE.sev;
  const sevBg = PALETTE.sev[sevKey] ?? PALETTE.sev.medium;
  const sevLabel = (inc?.severity ?? "—").toUpperCase();
  const statusLabel = STATUS_PT[inc?.status ?? "—"] ?? inc?.status ?? "—";

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
              fontSize: 32,
              fontWeight: 700,
              color: PALETTE.brand,
            }}
          >
            lumes.pt
          </div>
        </div>

        {inc ? (
          <>
            <div
              style={{
                display: "flex",
                background: sevBg,
                color: "white",
                padding: "10px 22px",
                borderRadius: 14,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.05em",
                width: "fit-content",
                marginTop: 30,
              }}
            >
              {sevLabel}
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 18,
                fontSize: 22,
                color: PALETTE.muted,
                marginTop: -38,
                position: "absolute",
              }}
            >
              {statusLabel}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 56,
                fontWeight: 800,
                lineHeight: 1.05,
                marginTop: 60,
                maxWidth: 1000,
                letterSpacing: "-0.04em",
              }}
            >
              {inc.displayName ?? "Incidente"}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 500,
                color: PALETTE.muted,
                marginTop: 8,
              }}
            >
              {[inc.municipality, inc.district].filter(Boolean).join(" · ") || "Portugal"}
            </div>

            <div style={{ display: "flex", flex: 1 }} />

            <div
              style={{
                display: "flex",
                gap: 32,
                borderTop: "1px solid #27272a",
                paddingTop: 24,
                fontSize: 22,
                color: PALETTE.muted,
              }}
            >
              <div style={{ display: "flex" }}>{inc.personnelTotal} operacionais</div>
              <div style={{ display: "flex" }}>{inc.assetsGround} meios terrestres</div>
              <div style={{ display: "flex" }}>{inc.assetsAerial} meios aéreos</div>
              <div style={{ display: "flex" }}>{inc.estimatedAreaHa.toFixed(0)} ha</div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 36,
              color: PALETTE.muted,
              marginTop: 60,
            }}
          >
            Incidente não encontrado
          </div>
        )}

        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#52525b",
            marginTop: 24,
          }}
        >
          lumes.pt · citizen wildfire intelligence
        </div>
      </div>
    ),
    { ...size }
  );
}
