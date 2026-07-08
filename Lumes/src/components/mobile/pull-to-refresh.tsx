"use client";
// PullToRefresh — touch-gesture wrapper that triggers a refresh callback
// when the user pulls down from the top.
//
// Pattern: native iOS / Material Design pull-to-refresh. Listens for
// pointerdown on the scrollable element, tracks vertical drag distance,
// fires onRefresh() when threshold is exceeded and user releases.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "@/components/icons/phosphor-icons";

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  /** Pull distance in px to trigger refresh. Default 80. */
  threshold?: number;
  /** Children — the scrollable content */
  children: ReactNode;
}

export function PullToRefresh({
  onRefresh,
  threshold = 80,
  children,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onPointerDown(e: PointerEvent) {
      // Only start if scrolled to top
      if (el!.scrollTop === 0) {
        startYRef.current = e.clientY;
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (startYRef.current === null || refreshing) return;
      const delta = e.clientY - startYRef.current;
      if (delta > 0 && el!.scrollTop === 0) {
        // Apply resistance — pullDistance grows logarithmically
        setPullDistance(Math.min(delta * 0.4, threshold * 1.5));
      }
    }

    function onPointerUp() {
      if (startYRef.current === null) return;
      if (pullDistance >= threshold && !refreshing) {
        setRefreshing(true);
        Promise.resolve(onRefresh()).finally(() => {
          setRefreshing(false);
          setPullDistance(0);
        });
      } else {
        setPullDistance(0);
      }
      startYRef.current = null;
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [pullDistance, threshold, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const refreshingVisible = refreshing || pullDistance > 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto ember-scroll"
    >
      {/* Pull indicator */}
      <AnimatePresence>
        {refreshingVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sticky top-0 z-10 flex items-center justify-center py-2 pointer-events-none"
            style={{
              height: `${Math.max(pullDistance, refreshing ? 36 : 0)}px`,
            }}
          >
            <div
              className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${
                refreshing ? "text-[var(--ember-accent)]" : "text-[var(--ember-text-faint)]"
              }`}
              style={{
                opacity: refreshing ? 1 : progress,
              }}
            >
              <RefreshCw
                className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
                style={{
                  transform: `rotate(${pullDistance * 4}deg)`,
                }}
              />
              <span>
                {refreshing
                  ? "Atualizando…"
                  : progress >= 1
                  ? "Solte para atualizar"
                  : "Puxe para atualizar"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}