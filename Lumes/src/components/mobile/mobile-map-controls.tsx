"use client";
// MobileMapControls — floating action buttons (FABs) for map zoom and locate.
//
// Positioned bottom-right of the map (thumb-reachable zone for one-handed
// mobile use). 48×48 px touch targets per Apple HIG / Material Design 3.

import { Minus, Plus, Locate, Layers as LayersIcon } from "@/components/icons/phosphor-icons";
import { motion } from "framer-motion";
import type { MapChromeInsets } from "@/lib/map-chrome";

interface MobileMapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  onLayers?: () => void;
  lang?: "pt" | "en";
  chromeInsets?: MapChromeInsets;
}

export function MobileMapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  onLayers,
  lang = "pt",
  chromeInsets,
}: MobileMapControlsProps) {
  const labels = lang === "pt"
    ? { zoomIn: "Aumentar zoom", zoomOut: "Diminuir zoom", locate: "Centrar mapa", layers: "Explorar mapa" }
    : { zoomIn: "Zoom in", zoomOut: "Zoom out", locate: "Center map", layers: "Explore map" };
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className={`absolute z-20 flex flex-col gap-2 pointer-events-auto ${chromeInsets ? "" : "right-3 top-1/2 -translate-y-1/2"}`}
      style={chromeInsets ? { bottom: chromeInsets.bottom + 16, right: chromeInsets.right } : undefined}
      aria-label="Map controls"
      data-testid="mobile-map-controls"
    >
      <FabButton onClick={onZoomIn} ariaLabel={labels.zoomIn}>
        <Plus className="w-5 h-5" />
      </FabButton>
      <FabButton onClick={onZoomOut} ariaLabel={labels.zoomOut}>
        <Minus className="w-5 h-5" />
      </FabButton>
      <FabButton onClick={onLocate} ariaLabel={labels.locate} className="mt-1">
        <Locate className="w-5 h-5" />
      </FabButton>
      {onLayers && (
        <FabButton onClick={onLayers} ariaLabel={labels.layers} className="mt-1">
          <LayersIcon className="w-5 h-5" />
        </FabButton>
      )}
    </motion.div>
  );
}

function FabButton({
  children,
  onClick,
  ariaLabel,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-12 h-12 rounded-full bg-[var(--ember-surface)]/95 backdrop-blur-md border border-[var(--ember-border)] text-[var(--ember-text)] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.3)] active:scale-95 transition-transform hover:border-[var(--ember-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/50 ${className}`}
    >
      {children}
    </button>
  );
}
