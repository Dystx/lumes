"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useBlockingOverlay } from "@/lib/blocking-overlay";

interface OverlayDialogProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  zIndex?: number;
}

/** A single focus-safe primitive for blocking public action overlays. */
export function OverlayDialog({
  ariaLabel,
  children,
  onClose,
  panelClassName = "mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl",
  zIndex = 60,
}: OverlayDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useBlockingOverlay(true, panelRef, onClose);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = priorOverflow;
      const restoreFocus = () => {
        if (openerRef.current?.isConnected) openerRef.current.focus();
      };
      restoreFocus();
      requestAnimationFrame(restoreFocus);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" style={{ zIndex }}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={ariaLabel} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative flex flex-col bg-[var(--ember-surface)] shadow-[var(--ember-shadow-lg)] outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
