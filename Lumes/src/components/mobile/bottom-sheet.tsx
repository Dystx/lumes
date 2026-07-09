"use client";
// BottomSheet — mobile bottom sheet with drag-to-dismiss + backdrop tap-to-close.
//
// Provides proper iOS-style bottom sheet UX:
// - Drag down to dismiss (with velocity + distance threshold)
// - Tap backdrop to close
// - Snap points for partial/full expand
// - Body scroll lock when open
// - Smooth gesture tracking
//
// Pattern adapted from Radix UI Dialog + Vaul (https://vaul.emilkowal.ski)
// Simplified to a single snap point (full) since we don't need partial.

import { useRef, useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { trapFocus } from "@/lib/focus-trap";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible label for the sheet */
  ariaLabel: string;
  /** Z-index — defaults to z-40 */
  zIndex?: number;
  /** Show backdrop dim layer — defaults to true */
  showBackdrop?: boolean;
  /** Snap point in vh — defaults to 90 (most of the screen) */
  snapVh?: number;
  /** Optional className for the sheet panel */
  panelClassName?: string;
  /** Header content (replaces the default drag handle) */
  header?: ReactNode;
}

const DISMISS_VELOCITY = 500; // px/s
const DISMISS_DISTANCE = 0.3; // fraction of sheet height

export function BottomSheet({
  open,
  onClose,
  children,
  ariaLabel,
  zIndex = 40,
  showBackdrop = true,
  snapVh = 90,
  panelClassName = "",
  header,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  // Body scroll lock when open
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => sheetRef.current?.focus());
    return () => {
      document.body.style.overflow = original;
      openerRef.current?.focus();
    };
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (sheetRef.current) trapFocus(sheetRef.current, e);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight ?? 0;
    const shouldDismiss =
      info.velocity.y > DISMISS_VELOCITY ||
      (info.offset.y > 0 && info.offset.y > sheetHeight * DISMISS_DISTANCE);
    if (shouldDismiss) {
      onClose();
    } else {
      // Spring back
      y.set(0);
    }
  };

  // Backdrop opacity tracks the sheet position (1 → 0 as user drags down)
  const backdropOpacity = useTransform(y, [-200, 0], [0.8, 0]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bottom-sheet"
          className="xl:hidden fixed inset-0"
          style={{ zIndex, pointerEvents: "auto" }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          {/* Backdrop */}
          {showBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="absolute inset-0 bg-black"
              style={{ opacity: backdropOpacity }}
              aria-hidden="true"
            />
          )}

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              isDragging
                ? { duration: 0 }
                : { type: "spring", damping: 30, stiffness: 280, mass: 0.8 }
            }
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            style={{ y, maxHeight: `${snapVh}vh` }}
            tabIndex={-1}
            className={`absolute inset-x-0 bottom-0 bg-[var(--ember-bg)] border-t border-[var(--ember-border)] rounded-t-xl shadow-[0_-8px_24px_rgba(0,0,0,0.3)] flex flex-col outline-none ${panelClassName}`}
          >
            {/* Drag handle / header */}
            {header ?? (
              <div className="flex-shrink-0 px-4 pt-2 pb-2 flex items-center justify-center border-b border-[var(--ember-border)] relative">
                <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)]" />
              </div>
            )}
            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
