// SSE (Server-Sent Events) realtime endpoint
// Pushes incident updates to connected clients.
// Client connects with: new EventSource("/api/realtime")
// Server polls /api/incidents every 60s and pushes diffs.

import { NextRequest } from "next/server";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { createDataStateMeta } from "@/lib/data-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function incidentFeedUrl(requestUrl: string): string {
  return new URL("/api/incidents", requestUrl).toString();
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(clientKey(request), { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded", dataState: createDataStateMeta("retryable-error", "Rate limit exceeded") }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(rl.retryAfter) },
    });
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      // Track the last incident set to detect changes. Each poll has its own
      // abort controller and deadline so a slow upstream cannot overlap the
      // next tick or keep a disconnected stream alive.
      let lastIncidentIds: Set<string> = new Set();
      let inFlight = false;
      let closed = false;
      let pollController: AbortController | null = null;

      const poll = async () => {
        if (closed) return;
        if (inFlight) return;
        inFlight = true;
        const currentController = new AbortController();
        pollController = currentController;
        const timeout = setTimeout(() => currentController.abort(), 10_000);
        try {
          const res = await fetch(incidentFeedUrl(request.url), {
            headers: { "Cache-Control": "no-cache" },
            signal: currentController.signal,
          });
          if (!res.ok || closed) return;
          const raw: unknown = await res.json();
          if (closed) return;
          const payload = raw && typeof raw === "object" ? raw as { incidents?: unknown; count?: unknown } : {};
          const incidents = Array.isArray(payload.incidents)
            ? payload.incidents.filter((incident): incident is Record<string, unknown> & { id: string } => Boolean(incident && typeof incident === "object" && "id" in incident && typeof (incident as { id?: unknown }).id === "string"))
            : [];
          const currentIds = new Set<string>(incidents.map((incident) => incident.id));

          // New incidents (in current but not in last)
          const newIds = Array.from(currentIds).filter((id) => !lastIncidentIds.has(id));
          // Gone incidents (in last but not in current)
          const goneIds = Array.from(lastIncidentIds).filter((id) => !currentIds.has(id));

          // Always send heartbeat
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "heartbeat",
              timestamp: new Date().toISOString(),
              count: typeof payload.count === "number" ? payload.count : currentIds.size,
            })}\n\n`)
          );

          // Send new incidents
          for (const id of newIds) {
            const inc = incidents.find((incident) => incident.id === id);
            if (inc) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: "new-incident",
                  incident: inc,
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              );
            }
          }

          // Send gone incidents
          for (const id of goneIds) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "incident-resolved",
                incidentId: id,
                timestamp: new Date().toISOString(),
              })}\n\n`)
            );
          }

          lastIncidentIds = currentIds;
        } catch {
          // Silently skip — will retry next interval. Aborts are expected when
          // the client disconnects or the upstream exceeds its budget.
        } finally {
          clearTimeout(timeout);
          if (pollController === currentController) pollController = null;
          inFlight = false;
        }
      };

      // Poll for changes every 30 seconds.
      const interval = setInterval(() => void poll(), 30_000);
      void poll();

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        pollController?.abort();
        try {
          controller.close();
        } catch {
          // The stream may already be closed by the runtime.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
