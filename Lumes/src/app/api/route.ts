import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { service: "lumes.pt", status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
