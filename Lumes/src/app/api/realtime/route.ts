// SSE (Server-Sent Events) realtime endpoint
// Pushes incident updates to connected clients.
// Client connects with: new EventSource("/api/realtime")
// Server polls /api/incidents every 60s and pushes diffs.

import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      // Track last incident count to detect changes
      let lastCount = 0;
      let lastIncidentIds: Set<string> = new Set();

      // Poll for changes every 30 seconds
      const interval = setInterval(async () => {
        try {
          const res = await fetch(new URL("/api/incidents", request.url), {
            headers: { "Cache-Control": "no-cache" },
          });
          if (!res.ok) return;
          const data = await res.json();
          const currentIds = new Set<string>(((data as any).incidents || []).map((i: any) => i.id));

          // New incidents (in current but not in last)
          const newIds = Array.from(currentIds).filter((id) => !lastIncidentIds.has(id));
          // Gone incidents (in last but not in current)
          const goneIds = Array.from(lastIncidentIds).filter((id) => !currentIds.has(id));

          // Always send heartbeat
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "heartbeat",
              timestamp: new Date().toISOString(),
              count: data.count,
            })}\n\n`)
          );

          // Send new incidents
          for (const id of newIds) {
            const inc = (data as any).incidents.find((i: any) => i.id === id);
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

          lastIncidentIds = currentIds as Set<string>;
          lastCount = data.count;
        } catch (err) {
          // Silently skip — will retry next interval
        }
      }, 30_000);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
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
