"use client";
// MobileMapControls — floating action buttons (FABs) for map zoom and locate.
//
// Positioned bottom-right of the map (thumb-reachable zone for one-handed
// mobile use). 48×48 px touch targets per Apple HIG / Material Design 3.

import { Minus, Plus, Locate, Layers as LayersIcon } from "lucide-react";
import { motion } from "framer-motion";

interface MobileMapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  onLayers?: () => void;
}

export function MobileMapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  onLayers,
}: MobileMapControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 pointer-events-auto"
      aria-label="Map controls"
    >
      <FabButton onClick={onZoomIn} ariaLabel="Zoom in">
        <Plus className="w-5 h-5" />
      </FabButton>
      <FabButton onClick={onZoomOut} ariaLabel="Zoom out">
        <Minus className="w-5 h-5" />
      </FabButton>
      <FabButton onClick={onLocate} ariaLabel="Locate me" className="mt-1">
        <Locate className="w-5 h-5" />
      </FabButton>
      {onLayers && (
        <FabButton onClick={onLayers} ariaLabel="Toggle layers" className="mt-1">
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