"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Incident } from "@/lib/sample-data";
import { featureFlags } from "@/lib/features";
import {
  INCIDENT_FOCUS_ENTER_DURATION_MS,
  INCIDENT_FOCUS_EXIT_DURATION_MS,
  isValidIncidentCenter,
  type CameraSnapshot,
  type IncidentFocusMode,
  type IncidentFocusTarget,
  type MapPadding,
} from "@/lib/map/incident-focus-controller";
import {
  getIncidentFocusCapability,
  type IncidentFocusCapability,
} from "@/lib/map/incident-focus-capability";
import type { EmberMapHandle } from "@/components/ember-map";
import type { IncidentFocusUiState } from "@/lib/map/incident-focus-state";
import { MAP_READY_EVENT, MAP_STYLE_RESTORED_EVENT } from "@/lib/map/map-events";

export interface UseIncidentFocusOptions {
  mapRef: RefObject<EmberMapHandle | null>;
  incident: Pick<Incident, "id" | "displayName" | "latitude" | "longitude"> | null;
}

export interface UseIncidentFocusResult {
  enabled: boolean;
  state: IncidentFocusUiState;
  capability: IncidentFocusCapability;
  focusedIncidentId: string | null;
  enter: () => void;
  exit: () => void;
  returnToOverview: () => void;
}

function readDeviceMemory(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidate = navigator as Navigator & { deviceMemory?: number };
  return candidate.deviceMemory;
}

function readWebglSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function toTarget(
  incident: UseIncidentFocusOptions["incident"],
  viewportWidth: number,
): IncidentFocusTarget | null {
  if (!incident) return null;
  const center = [incident.longitude, incident.latitude] as [number, number];
  if (!isValidIncidentCenter(center)) return null;
  return {
    incidentId: incident.id,
    center,
    padding: focusPadding(viewportWidth),
  };
}

function focusPadding(viewportWidth: number): MapPadding {
  if (viewportWidth >= 1280) {
    // Keep the selected point left of the 360px Inspector plus the 48px rail.
    return { top: 80, right: 420, bottom: 24, left: 32 };
  }
  if (viewportWidth >= 768) {
    return { top: 80, right: 24, bottom: 280, left: 24 };
  }
  // The mobile incident sheet occupies most of the lower viewport.
  return { top: 64, right: 16, bottom: 360, left: 16 };
}

export function useIncidentFocus({ mapRef, incident }: UseIncidentFocusOptions): UseIncidentFocusResult {
  const enabled = featureFlags.incidentFocus3d;
  const [mapReady, setMapReady] = useState(false);
  const [webglSupported, setWebglSupported] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [mode, setMode] = useState<IncidentFocusMode>("overview");
  const [savedCamera, setSavedCamera] = useState<CameraSnapshot | null>(null);
  const [focusedIncidentId, setFocusedIncidentId] = useState<string | null>(null);
  const previousIncidentIdRef = useRef<string | null>(incident?.id ?? null);
  const openerRef = useRef<HTMLElement | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const prefersReducedMotion = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const restoreFocusToOpener = useCallback(() => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const currentOpener = openerRef.current;
      if (currentOpener && document.contains(currentOpener)) {
        currentOpener.focus();
        return;
      }

      // The Inspector replaces the CTA with the active-state panel, so the
      // original DOM node can be gone when the camera restore completes.
      // Focus the visible replacement CTA rather than the hidden mobile copy.
      const replacement = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="incident-focus-entry"]'),
      ).find((element) => element.getClientRects().length > 0);
      replacement?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // WebGL capability is a browser-level probe, not a per-render calculation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebglSupported(readWebglSupport());
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!enabled) {
      return;
    }

    const updateViewport = () => setViewportWidth(window.innerWidth);
    const onMapSignal = () => {
      setMapReady(mapRef.current?.isMapReady() ?? false);
    };

    updateViewport();
    onMapSignal();
    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener(MAP_READY_EVENT, onMapSignal as EventListener);
    window.addEventListener(MAP_STYLE_RESTORED_EVENT, onMapSignal as EventListener);

    // The map can finish loading before this hook's effect subscribes to the
    // readiness event (especially with a warm style cache). Polling the
    // imperative handle closes that race without changing map behavior.
    const readinessTimer = window.setInterval(onMapSignal, 250);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener(MAP_READY_EVENT, onMapSignal as EventListener);
      window.removeEventListener(MAP_STYLE_RESTORED_EVENT, onMapSignal as EventListener);
      window.clearInterval(readinessTimer);
    };
  }, [enabled, mapRef]);

  const hasValidIncidentGeometry = useMemo(() => toTarget(incident, viewportWidth || 1440) !== null, [incident, viewportWidth]);
  const capability = useMemo(() => getIncidentFocusCapability({
    webglSupported,
    mapReady,
    hasValidIncidentGeometry,
    viewportWidth: viewportWidth || 1440,
    hardwareConcurrency: typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency,
    deviceMemory: readDeviceMemory(),
  }), [hasValidIncidentGeometry, mapReady, viewportWidth, webglSupported]);

  const exitImmediately = useCallback((snapshot: CameraSnapshot | null) => {
    clearTransitionTimer();
    mapRef.current?.exitIncidentFocus(snapshot);
    setMode("overview");
    setSavedCamera(null);
    setFocusedIncidentId(null);
    restoreFocusToOpener();
  }, [clearTransitionTimer, mapRef, restoreFocusToOpener]);

  useEffect(() => () => clearTransitionTimer(), [clearTransitionTimer]);

  // Run after the overview render commits. The active Inspector state replaces
  // the original CTA node, so restoring focus inside the camera callback can
  // race the React commit that recreates that button.
  useEffect(() => {
    if (mode !== "overview" || !openerRef.current) return;
    const timer = window.setTimeout(restoreFocusToOpener, 0);
    return () => window.clearTimeout(timer);
  }, [mode, restoreFocusToOpener]);

  const enter = useCallback(() => {
    const target = toTarget(incident, viewportWidth || (typeof window === "undefined" ? 1440 : window.innerWidth));
    if (!enabled || !capability.allowed || !target || !mapRef.current) return;

    clearTransitionTimer();
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMode("entering");
    const snapshot = mapRef.current.enterIncidentFocus(target);
    if (!snapshot) {
      setMode("overview");
      return;
    }
    setSavedCamera(snapshot);
    setFocusedIncidentId(target.incidentId);
    if (prefersReducedMotion()) {
      setMode("active");
    } else {
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        setMode("active");
      }, INCIDENT_FOCUS_ENTER_DURATION_MS);
    }
  }, [capability.allowed, clearTransitionTimer, enabled, incident, mapRef, prefersReducedMotion, viewportWidth]);

  const exit = useCallback(() => {
    if (mode === "overview") return;
    clearTransitionTimer();
    setMode("exiting");
    mapRef.current?.exitIncidentFocus(savedCamera);
    const complete = () => {
      transitionTimerRef.current = null;
      setMode("overview");
      setSavedCamera(null);
      setFocusedIncidentId(null);
      restoreFocusToOpener();
    };
    if (prefersReducedMotion()) complete();
    else transitionTimerRef.current = window.setTimeout(complete, INCIDENT_FOCUS_EXIT_DURATION_MS);
  }, [clearTransitionTimer, mode, mapRef, prefersReducedMotion, restoreFocusToOpener, savedCamera]);

  const returnToOverview = useCallback(() => {
    clearTransitionTimer();
    mapRef.current?.returnToPortugalOverview();
    setMode("overview");
    setSavedCamera(null);
    setFocusedIncidentId(null);
    restoreFocusToOpener();
  }, [clearTransitionTimer, mapRef, restoreFocusToOpener]);

  useEffect(() => {
    const nextId = incident?.id ?? null;
    const incidentChanged = previousIncidentIdRef.current !== nextId;
    previousIncidentIdRef.current = nextId;
    if (!incidentChanged || mode === "overview") return;

    const timer = window.setTimeout(() => exitImmediately(savedCamera), 0);
    return () => window.clearTimeout(timer);
  }, [exitImmediately, incident?.id, mode, savedCamera]);

  // A live refresh can retain the incident ID while replacing its coordinates
  // with an invalid value. Do not leave the map pitched with no visible exit
  // controls when that happens; restore the saved camera through the same
  // provider-neutral path used for a changed selection.
  useEffect(() => {
    if (mode === "overview" || hasValidIncidentGeometry) return;

    const timer = window.setTimeout(() => exitImmediately(savedCamera), 0);
    return () => window.clearTimeout(timer);
  }, [exitImmediately, hasValidIncidentGeometry, mode, savedCamera]);

  // Capability is an entry gate, not a reason to remove the exit controls
  // during a transient style reload. Map style transitions briefly report
  // `mapReady=false`; preserve the active mode until the controller can finish
  // the transition or the user explicitly exits.
  const state: IncidentFocusUiState = !enabled
    ? "idle"
    : mode !== "overview"
      ? mode
      : !capability.allowed
        ? "unavailable"
        : "idle";

  return {
    enabled,
    state,
    capability,
    focusedIncidentId,
    enter,
    exit,
    returnToOverview,
  };
}
