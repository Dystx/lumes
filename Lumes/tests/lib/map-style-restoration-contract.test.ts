import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MapLibre style restoration contract", () => {
  it("guards core style replay and satellite callbacks by the latest generation", () => {
    const map = readFileSync("src/components/ember-map.tsx", "utf8");
    const styleEffect = map.slice(
      map.indexOf("EFFECT 2 — Switch style"),
      map.indexOf("EFFECT 2b — Satellite raster overlay"),
    );

    expect(styleEffect).toContain("styleTransitionRef.current.begin()");
    expect(styleEffect).toContain("styleTransitionRef.current.isCurrent(transitionToken)");
    expect(styleEffect).toContain("styleTransitionRef.current.invalidate(transitionToken)");
    expect(styleEffect).toContain("mapLoaded");
    expect(styleEffect).toContain("[theme, basemap, mapLoaded]");
    expect(styleEffect).toContain("createStyleTransitionRuntime");
    expect(styleEffect).toContain("STYLE_LOAD_TIMEOUT_MS");
    expect(styleEffect).toContain('setMapStyleState("retryable-error")');
    expect(map).toContain("initialStyleTimer");
    expect(map).toContain("isStyleLoadError(event)");
    expect(map).toContain('setMapStyleState(recovered ? "recovered" : "ready")');
    expect(styleEffect.match(/addEmberSourcesAndLayers\(map/g)?.length ?? 0).toBe(1);

    const satelliteEffect = map.slice(
      map.indexOf("EFFECT 2b — Satellite raster overlay"),
      map.indexOf("EFFECT 3 — Update incidents source"),
    );
    expect(satelliteEffect).toContain("styleTransitionRef.current.current()");
    expect(satelliteEffect).toContain("styleTransitionRef.current.isCurrent(styleGeneration)");
    expect(satelliteEffect).toContain('map.off("style.load", applySatellite)');
  });

  it("cancels delayed optional-layer remounts on newer restores and cleanup", () => {
    const host = readFileSync("src/components/advanced-layers-host.tsx", "utf8");

    expect(host).toContain("createDeferredRestoreScheduler");
    expect(host).toContain("MAP_STYLE_TRANSITION_EVENT");
    expect(host).toContain("window.addEventListener(MAP_STYLE_TRANSITION_EVENT");
    expect(host).toContain("restoreScheduler.cancel()");
    expect(host).toContain("restoreScheduler.schedule(detail.map)");

    expect(readFileSync("src/components/ember-map.tsx", "utf8")).toContain(
      "data-map-style-state={mapStyleState}",
    );
  });
});
