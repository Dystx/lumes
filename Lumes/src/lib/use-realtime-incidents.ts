"use client";

import { useEffect, useRef, useState } from "react";
import {
  createRealtimeClient,
  parseRealtimeIncidentPayload,
  type RealtimeEventSource,
  type RealtimeIncidentEvent,
  type RealtimeIncidentPayload,
} from "@/lib/realtime-client";

export type { RealtimeIncidentEvent, RealtimeIncidentPayload } from "@/lib/realtime-client";

function createBrowserEventSource(): RealtimeEventSource {
  const source = new EventSource("/api/realtime");
  const adapter: RealtimeEventSource = {
    onopen: null,
    onerror: null,
    onmessage: null,
    close: () => source.close(),
  };
  source.onopen = () => adapter.onopen?.();
  source.onerror = () => adapter.onerror?.();
  source.onmessage = (event) => adapter.onmessage?.({ data: event.data });
  return adapter;
}

export function useRealtimeIncidents(onNewIncident?: (incident: RealtimeIncidentPayload) => void): {
  connected: boolean;
  lastEvent: RealtimeIncidentEvent | null;
} {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeIncidentEvent | null>(null);
  const callbackRef = useRef(onNewIncident);
  useEffect(() => {
    callbackRef.current = onNewIncident;
  }, [onNewIncident]);

  useEffect(() => {
    const client = createRealtimeClient({
      createEventSource: createBrowserEventSource,
      onConnected: setConnected,
      onEvent: (nextEvent) => {
        setLastEvent(nextEvent);
        if (nextEvent.type === "new-incident") {
          callbackRef.current?.(parseRealtimeIncidentPayload(nextEvent.incident));
        }
      },
    });

    client.connect();
    return () => client.dispose();
  }, []);

  return { connected, lastEvent };
}
