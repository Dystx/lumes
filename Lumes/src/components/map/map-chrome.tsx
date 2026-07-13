"use client";

import type { CSSProperties, ReactNode } from "react";
import type { MapChromeInsets } from "@/lib/map-chrome";

export type MapChromeRegion = "status" | "controls" | "legend" | "playback";

export interface MapChromeProps {
  insets: MapChromeInsets;
  region: MapChromeRegion;
  children: ReactNode;
  anchor?: "left" | "right";
  mobile?: boolean;
  topOffset?: number;
  className?: string;
  testId?: string;
}

/**
 * Shared positioning boundary for map chrome. Children own their visual
 * styling; this component owns the safe inset and collision geometry.
 */
export function MapChrome({
  insets,
  region,
  children,
  anchor = "right",
  mobile = false,
  topOffset = 0,
  className = "",
  testId,
}: MapChromeProps) {
  const style: CSSProperties = { position: "absolute" };
  const safeTopOffset = Number.isFinite(topOffset) ? Math.max(0, topOffset) : 0;

  if (mobile && region === "controls") {
    style.bottom = insets.bottom + 16;
    style.right = insets.right;
  } else if (mobile && region === "status") {
    style.bottom = insets.bottom + 260;
    style.left = insets.left;
    style.right = insets.right;
  } else if (region === "status" || region === "controls") {
    style.top = insets.top + safeTopOffset;
    if (region === "status" && anchor === "left") {
      style.left = insets.left;
    } else {
      style.right = region === "status" ? insets.right + 72 : insets.right;
    }
  } else if (region === "legend") {
    style.left = insets.left;
    style.bottom = insets.bottom + 16;
  } else {
    style.left = 0;
    style.right = 0;
    style.bottom = insets.bottom;
  }

  return (
    <div
      className={`pointer-events-none z-10 ${className}`}
      style={style}
      data-map-chrome-region={region}
      data-testid={testId ?? `map-chrome-${region}`}
    >
      {children}
    </div>
  );
}
