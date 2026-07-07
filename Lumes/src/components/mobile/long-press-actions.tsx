"use client";
// LongPressActions — quick-actions menu shown on long-press of a map marker.
//
// Mobile-friendly gesture: instead of tap-then-tap, users can long-press
// a marker to open a context menu with follow / share / open-detail options.
//
// Pattern: pointerdown starts a 500ms timer; if user doesn't move and
// releases, the menu opens. If they move or release early, it's a tap.

import { useState, useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Share2, MapPin, X, Bell } from "lucide-react";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";

export interface LongPressActionsProps {
  /** Coordinates where the menu should appear */
  x: number;
  y: number;
  onClose: () => void;
  onFollow?: () => void;
  onShare?: () => void;
  onLocate?: () => void;
  onAlert?: () => void;
  onOpenDetail?: () => void;
  isFollowed?: boolean;
}

export function LongPressActions({
  x,
  y,
  onClose,
  onFollow,
  onShare,
  onLocate,
  onAlert,
  onOpenDetail,
  isFollowed = false,
}: LongPressActionsProps) {
  const { language: lang } = useLanguage();

  // Reposition menu if it would overflow viewport
  const adjustedX = Math.min(Math.max(x, 100), window.innerWidth - 100);
  const adjustedY = Math.min(Math.max(y, 100), window.innerHeight - 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
        className="fixed z-50 pointer-events-auto"
        style={{ left: adjustedX, top: adjustedY, transform: "translate(-50%, -50%)" }}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm -z-10"
          onClick={onClose}
        />

        {/* Menu card */}
        <div className="bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.4)] p-1.5 min-w-[180px]">
          <ActionItem
            icon={<Bell className="w-3.5 h-3.5" />}
            label={isFollowed ? t(lang, "incident.following") : t(lang, "incident.follow")}
            onClick={() => { onFollow?.(); onClose(); }}
            active={isFollowed}
          />
          <ActionItem
            icon={<MapPin className="w-3.5 h-3.5" />}
            label={lang === "pt" ? "Centrar no mapa" : "Center on map"}
            onClick={() => { onLocate?.(); onClose(); }}
          />
          <ActionItem
            icon={<Bookmark className="w-3.5 h-3.5" />}
            label={lang === "pt" ? "Ver detalhes" : "View details"}
            onClick={() => { onOpenDetail?.(); onClose(); }}
            hidden
          />
          <ActionItem
            icon={<Share2 className="w-3.5 h-3.5" />}
            label={lang === "pt" ? "Partilhar" : "Share"}
            onClick={() => { onShare?.(); onClose(); }}
          />
          <ActionItem
            icon={<X className="w-3.5 h-3.5" />}
            label={lang === "pt" ? "Fechar" : "Close"}
            onClick={onClose}
            variant="destructive"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  active,
  hidden,
  variant = "default",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  hidden?: boolean;
  variant?: "default" | "destructive";
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-xs ${
        active
          ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)]"
          : variant === "destructive"
          ? "text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)]"
          : "text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)]"
      } transition-colors`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

/** Hook to detect long-press on a map element. */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  delay = 500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    startPosRef.current = { x: e.clientX, y: e.clientY };
    triggeredRef.current = false;
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      if (startPosRef.current) {
        onLongPress(startPosRef.current.x, startPosRef.current.y);
      }
    }, delay);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    // Cancel if user moves more than 10px (probably scrolling or panning)
    if (dx > 10 || dy > 10) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      startPosRef.current = null;
    }
  }
  function onPointerUp() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startPosRef.current = null;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}