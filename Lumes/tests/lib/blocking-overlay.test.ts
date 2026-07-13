import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBlockingOverlay, registerOverlayEscape } from "@/lib/blocking-overlay";

let restoreWindow: (() => void) | undefined;

afterEach(() => {
  restoreWindow?.();
  restoreWindow = undefined;
});

describe("blocking overlay runtime", () => {
  it("dispatches Escape to only the newest registered overlay", () => {
    let listener: ((event: KeyboardEvent) => void) | undefined;
    const fakeWindow = {
      addEventListener: (_type: string, handler: EventListenerOrEventListenerObject) => {
        listener = handler as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => {
        listener = undefined;
      },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    restoreWindow = () => {
      delete (globalThis as { window?: unknown }).window;
    };

    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = registerBlockingOverlay({ getContainer: () => null, onEscape: first });
    const releaseSecond = registerBlockingOverlay({ getContainer: () => null, onEscape: second });
    const event = {
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    listener?.(event);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();

    releaseSecond();
    listener?.(event);
    expect(first).toHaveBeenCalledOnce();

    releaseFirst();
    expect(listener).toBeUndefined();
  });

  it("allows a non-modal rail to own Escape without trapping focus", () => {
    let listener: ((event: KeyboardEvent) => void) | undefined;
    const fakeWindow = {
      addEventListener: (_type: string, handler: EventListenerOrEventListenerObject) => {
        listener = handler as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => {
        listener = undefined;
      },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    restoreWindow = () => {
      delete (globalThis as { window?: unknown }).window;
    };

    const closeRail = vi.fn();
    const release = registerOverlayEscape(closeRail);
    const event = {
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    listener?.(event);

    expect(closeRail).toHaveBeenCalledOnce();
    release();
  });
});
