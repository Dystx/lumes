export interface RealtimeIncidentEvent {
  type: string;
  timestamp: string;
  incident?: unknown;
}

export interface RealtimeIncidentPayload {
  displayName?: string;
}

export interface RealtimeEventSource {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  close: () => void;
}

export interface RealtimeClientOptions {
  createEventSource: () => RealtimeEventSource;
  onConnected: (connected: boolean) => void;
  onEvent: (event: RealtimeIncidentEvent) => void;
}

export interface RealtimeClient {
  connect: () => void;
  dispose: () => void;
}

const INITIAL_RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_DELAY = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseRealtimeIncidentEvent(raw: string): RealtimeIncidentEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.type !== "string" || typeof value.timestamp !== "string") {
      return null;
    }
    return {
      type: value.type,
      timestamp: value.timestamp,
      incident: value.incident,
    };
  } catch {
    return null;
  }
}

export function parseRealtimeIncidentPayload(value: unknown): RealtimeIncidentPayload {
  if (!isRecord(value) || typeof value.displayName !== "string") return {};
  return { displayName: value.displayName };
}

export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  let eventSource: RealtimeEventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = INITIAL_RECONNECT_DELAY;
  let disposed = false;

  const scheduleReconnect = (): void => {
    if (disposed || reconnectTimer !== null) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  };

  const handleError = (source: RealtimeEventSource): void => {
    if (disposed || eventSource !== source) return;
    options.onConnected(false);
    source.close();
    eventSource = null;
    scheduleReconnect();
  };

  const connect = (): void => {
    if (disposed || eventSource !== null) return;

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    let source: RealtimeEventSource;
    try {
      source = options.createEventSource();
    } catch {
      options.onConnected(false);
      scheduleReconnect();
      return;
    }

    eventSource = source;
    source.onopen = () => {
      if (disposed || eventSource !== source) return;
      options.onConnected(true);
      reconnectDelay = INITIAL_RECONNECT_DELAY;
    };
    source.onerror = () => handleError(source);
    source.onmessage = (message) => {
      if (disposed || eventSource !== source) return;
      const nextEvent = parseRealtimeIncidentEvent(message.data);
      if (nextEvent) options.onEvent(nextEvent);
    };
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    eventSource?.close();
    eventSource = null;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  return { connect, dispose };
}
