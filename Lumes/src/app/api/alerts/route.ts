// Alert Subscriptions API — geofence-based notification triggers
// Users can create geographic alert zones; when new incidents appear
// within the radius, the SSE realtime service pushes notifications.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/api/rate-limit";
import { assertSafeOrigin } from "@/lib/api/csrf";
import { createDataStateMeta } from "@/lib/data-state";

const ALERTS_UNAVAILABLE = "Personal alerts are unavailable until an account owner can be verified.";

// GET — list all alert subscriptions
export async function GET() {
  return NextResponse.json(
    { error: ALERTS_UNAVAILABLE, count: 0, subscriptions: [], dataState: createDataStateMeta("retryable-error", "Alert ownership is not configured") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
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
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { error: ALERTS_UNAVAILABLE, dataState: createDataStateMeta("retryable-error", "Alert ownership is not configured") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
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
      { error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter), "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { error: ALERTS_UNAVAILABLE, dataState: createDataStateMeta("retryable-error", "Alert ownership is not configured") },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
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
  // Until alert ownership is backed by an authenticated account/session,
  // never query or evaluate the shared subscription table. This helper is
  // intentionally fail-closed so a future notifier cannot leak or trigger
  // another visitor's subscriptions by accident.
  void incident;
  return [];
}
