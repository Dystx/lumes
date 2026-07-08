"use client";

// Reusable animated building blocks for the Ember UI
// Built on framer-motion + CSS keyframes

import { motion, AnimatePresence } from "framer-motion";
import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "@/components/icons/phosphor-icons";

// ============================================================
// AnimatedButton — button with hover lift + press scale + loading
// ============================================================
interface AnimatedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "default" | "accent" | "critical" | "ghost";
  size?: "sm" | "md" | "icon";
}

export function AnimatedButton({
  children,
  loading,
  variant = "default",
  size = "md",
  className = "",
  disabled,
  ...rest
}: AnimatedButtonProps) {
  const variantClass =
    variant === "accent"
      ? "bg-[var(--ember-accent)] text-[var(--ember-bg)] border-transparent hover:bg-[var(--ember-accent-hover)]"
      : variant === "critical"
      ? "bg-[var(--ember-critical)] text-white border-transparent hover:opacity-90"
      : variant === "ghost"
      ? "bg-transparent border-transparent text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)]"
      : "bg-[var(--ember-surface)] border-[var(--ember-border)] text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)]";

  const sizeClass =
    size === "icon"
      ? "w-11 h-11 md:w-9 md:h-9 justify-center"
      : size === "sm"
      ? "h-9 md:h-8 px-3 md:px-2.5 text-[11px]"
      : "h-10 md:h-9 px-3.5 md:px-3 text-xs";

  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      disabled={disabled || loading}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium border ember-focus ${variantClass} ${sizeClass} ${className} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
      {...(rest as any)}
    >
      {loading && (
        <Loader2 className="w-3.5 h-3.5 ember-spin" />
      )}
      {children}
    </motion.button>
  );
}

// ============================================================
// SlideIn — panel/drawer slide-in animation
// ============================================================
export function SlideIn({
  children,
  direction = "right",
  duration = 0.28,
}: {
  children: ReactNode;
  direction?: "right" | "left" | "up" | "down";
  duration?: number;
}) {
  const offsets = {
    right: { x: "100%", opacity: 0 },
    left: { x: "-100%", opacity: 0 },
    up: { y: 24, opacity: 0 },
    down: { y: -24, opacity: 0 },
  };
  return (
    <motion.div
      initial={offsets[direction]}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={offsets[direction]}
      transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
      style={{ height: "100%" }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// StaggerChildren — children animate in sequence
// ============================================================
export function StaggerChildren({
  children,
  className = "",
  delay = 0,
  stagger = 0.04,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren: delay,
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { y: 8, opacity: 0 },
        visible: {
          y: 0,
          opacity: 1,
          transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// Skeleton — shimmer loading placeholder
// ============================================================
export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      className={`ember-skeleton ${className}`}
      style={{ width, height }}
      aria-hidden
    />
  );
}

// ============================================================
// FadePresence — AnimatePresence wrapper for exit animations
// ============================================================
export function FadePresence({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// ScalePresence — scale + fade in/out (for dropdowns, popovers)
// ============================================================
export function ScalePresence({
  show,
  children,
  origin = "top right",
}: {
  show: boolean;
  children: ReactNode;
  origin?: string;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: origin }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// StatusDot — animated status indicator
// ============================================================
export function StatusDot({
  status,
  size = 6,
  pulse,
}: {
  status: "ok" | "stale" | "error" | "loading" | "disabled";
  size?: number;
  pulse?: boolean;
}) {
  const color =
    status === "ok"
      ? "var(--ember-accent)"
      : status === "stale"
      ? "var(--ember-warning)"
      : status === "loading"
      ? "var(--ember-text-faint)"
      : status === "disabled"
      ? "var(--ember-text-faint)"
      : "var(--ember-critical)";

  return (
    <span
      className="relative inline-flex flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {(pulse || status === "ok") && (
        <span
          className="absolute inset-0 rounded-full opacity-60"
          style={{
            background: color,
            animation: "ember-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
          }}
        />
      )}
      <span
        className="relative inline-flex rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
        }}
      />
    </span>
  );
}

// Add the ping keyframe inline via a style tag is messy; use existing ember-critical-pulse
// Actually let me add it to globals via a style element
const PING_KEYFRAME = `
@keyframes ember-ping {
  0% { transform: scale(1); opacity: 0.6; }
  75%, 100% { transform: scale(2.2); opacity: 0; }
}
`;

// Inject the ping keyframe once on module load
if (typeof document !== "undefined" && !document.getElementById("ember-ping-keyframe")) {
  const style = document.createElement("style");
  style.id = "ember-ping-keyframe";
  style.textContent = PING_KEYFRAME;
  document.head.appendChild(style);
}
