export type MapChromeMode = "wide" | "tablet" | "phone";

export interface MapChromeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapChromeInsetInput {
  mode: MapChromeMode;
  exploreOpen: boolean;
  drawerWidth: number;
  sheetHeight: number;
  safeAreaBottom: number;
}

export interface MapChromeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function deriveMapChromeInsets({
  mode,
  exploreOpen,
  drawerWidth,
  sheetHeight,
  safeAreaBottom,
}: MapChromeInsetInput): MapChromeInsets {
  const drawer = nonNegative(drawerWidth);
  const bottom = mode === "wide"
    ? 0
    : nonNegative(sheetHeight) + nonNegative(safeAreaBottom);

  if (mode === "wide") {
    return {
      top: 80,
      right: exploreOpen ? 48 + drawer + 16 : 48,
      bottom,
      left: 24,
    };
  }

  return {
    top: mode === "tablet" ? 64 : 16,
    right: exploreOpen ? drawer + 16 : 16,
    bottom,
    left: 16,
  };
}

export function rectanglesOverlap(a: MapChromeRect, b: MapChromeRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
