// Alert Subscriptions API — geofence-based notification triggers
// Users can create geographic alert zones; when new incidents appear
// within the radius, the SSE realtime service pushes notifications.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alertSubscribeSchema, followSchema, validateBody } from "@/lib/api/schemas";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";

// GET — list all alert subscriptions
export async function GET() {
  try {
    const subscriptions = await db.alertSubscription.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      count: subscriptions.length,
      subscriptions,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), count: 0, subscriptions: [] },
      { status: 500 }
    );
  }
}

// POST — create a new alert subscription
export async function POST(request: NextRequest) {
  // S-01 CSRF protection
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  // F-22 — rate limit (10 alerts/min per IP)
  const rl = rateLimit(clientKey(request), { limit: 10 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // F-24 — zod validation
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const v = validateBody(alertSubscribeSchema, body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const data = v.data;

    const sub = await db.alertSubscription.create({
      data: {
        name: data.topic,
        latitude: 0, // alertSubscribeSchema doesn't include lat/lon — future enhancement
        longitude: 0,
        radiusKm: 10,
        alertTypes: data.minSeverity,
      },
    });

    return NextResponse.json({ ok: true, subscription: sub }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// DELETE — remove an alert subscription
export async function DELETE(request: NextRequest) {
  // S-01 CSRF protection
  const csrfBlock = assertSafeOrigin(request);
  if (csrfBlock) return csrfBlock;

  // F-22 — rate limit
  const rl = rateLimit(clientKey(request), { limit: 10 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // F-24 — zod validation (reuse followSchema since it has the same shape)
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const v = validateBody(followSchema, body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const { incidentId: id } = v.data;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await db.alertSubscription.delete({ where: { id } }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Helper: check if a new incident triggers any alert subscriptions
// Called by the SSE realtime service when new incidents are detected
export async function checkAlertTriggers(incident: {
  latitude: number;
  longitude: number;
  eventType: string;
  severity: string;
  displayName: string;
}) {
  try {
    const subscriptions = await db.alertSubscription.findMany({
      where: { active: true },
    });

    const triggered: Array<{ subscription: any; distanceKm: number }> = [];

    for (const sub of subscriptions) {
      // Haversine distance
      const R = 6371;
      const dLat = ((incident.latitude - sub.latitude) * Math.PI) / 180;
      const dLon = ((incident.longitude - sub.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((sub.latitude * Math.PI) / 180) *
          Math.cos((incident.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const distanceKm = 2 * R * Math.asin(Math.sqrt(a));

      if (distanceKm <= sub.radiusKm) {
        // Check if alert type matches
        const alertTypes = sub.alertTypes.split(",");
        if (alertTypes.includes("all") || alertTypes.includes(incident.eventType)) {
          triggered.push({ subscription: sub, distanceKm });
        }
      }
    }

    return triggered;
  } catch {
    return [];
  }
}
