"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useBlockingOverlay } from "@/lib/blocking-overlay";

interface OverlayDrawerProps {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
}

export function OverlayDrawer({ ariaLabel, children, onClose }: OverlayDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useBlockingOverlay(true, drawerRef, onClose);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    requestAnimationFrame(() => drawerRef.current?.focus());
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm" aria-label={ariaLabel} onClick={onClose} />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[400px] flex-col border-l border-[var(--ember-border)] bg-[var(--ember-bg)] shadow-[var(--ember-shadow-lg)] outline-none"
      >
        {children}
      </aside>
    </div>
  );
}
