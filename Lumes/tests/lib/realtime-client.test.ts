import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeClient,
  parseRealtimeIncidentPayload,
  parseRealtimeIncidentEvent,
  type RealtimeEventSource,
  type RealtimeIncidentEvent,
} from "@/lib/realtime-client";

interface FakeEventSource extends RealtimeEventSource {
  emitError: () => void;
  emitMessage: (data: string) => void;
  emitOpen: () => void;
}

function makeSource(): FakeEventSource {
  const source: FakeEventSource = {
    onopen: null,
    onerror: null,
    onmessage: null,
    close: vi.fn(),
    emitError: () => source.onerror?.(),
    emitMessage: (data) => source.onmessage?.({ data }),
    emitOpen: () => source.onopen?.(),
  };
  return source;
}

describe("realtime client", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("parses only valid realtime frames and preserves the incident payload", () => {
    expect(parseRealtimeIncidentEvent("not-json")).toBeNull();
    expect(parseRealtimeIncidentEvent(JSON.stringify({ type: "heartbeat" }))).toBeNull();
    expect(parseRealtimeIncidentPayload({ displayName: "Lisboa", privateField: "ignored" })).toEqual({ displayName: "Lisboa" });
    expect(parseRealtimeIncidentPayload("malformed")).toEqual({});
    expect(parseRealtimeIncidentEvent(JSON.stringify({
      type: "new-incident",
      timestamp: "2026-07-12T12:00:00.000Z",
      incident: { displayName: "Lisboa" },
    }))).toEqual({
      type: "new-incident",
      timestamp: "2026-07-12T12:00:00.000Z",
      incident: { displayName: "Lisboa" },
    });
  });

  it("coalesces repeated errors into one reconnect and resets delay on open", () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    const connected: boolean[] = [];
    const events: RealtimeIncidentEvent[] = [];
    const client = createRealtimeClient({
      createEventSource: () => {
        const source = makeSource();
        sources.push(source);
        return source;
      },
      onConnected: (value) => connected.push(value),
      onEvent: (event) => events.push(event),
    });

    client.connect();
    sources[0].emitOpen();
    sources[0].emitError();
    sources[0].emitError();
    expect(sources).toHaveLength(1);

    vi.advanceTimersByTime(1_999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    sources[1].emitOpen();
    sources[1].emitMessage(JSON.stringify({ type: "heartbeat", timestamp: "now" }));
    expect(connected).toEqual([true, false, true]);
    expect(events).toEqual([{ type: "heartbeat", timestamp: "now", incident: undefined }]);
    client.dispose();
  });

  it("retries when EventSource construction throws and does not reconnect after dispose", () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    let attempts = 0;
    const client = createRealtimeClient({
      createEventSource: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("constructor failed");
        const source = makeSource();
        sources.push(source);
        return source;
      },
      onConnected: vi.fn(),
      onEvent: vi.fn(),
    });

    client.connect();
    expect(attempts).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(attempts).toBe(2);
    expect(sources).toHaveLength(1);

    sources[0].emitError();
    client.dispose();
    vi.advanceTimersByTime(30_000);
    expect(attempts).toBe(2);
    expect(sources[0].close).toHaveBeenCalledTimes(1);
  });
});
