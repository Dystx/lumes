"use client";
// BrandIcons — Custom SVG icon set replacing generic Lucide icons.
//
// Why custom:
// - Lucide is overused in AI projects; the user wanted anti-AI design
// - Custom icons can have more character and match the burnt-sienna / warm
//   parchment aesthetic of the rest of the brand
// - Variable stroke width and asymmetric details give them personality
//
// Pattern: each icon is a small React component that accepts className
// and standard SVG props. Designed at 24x24 viewBox, 1.5px stroke.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function baseProps({ size = 18, className, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    ...rest,
  };
}

// ============================================================
// FIRE / EMBER — the brand mark
// Distinctive asymmetric flame with a tilted inner core
// ============================================================
export function EmberIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3.5c.5 2.5-1 4-2 5.5-1 1.5-2 3-2 5 0 3.5 2.5 6 4 6.5 1.5-.5 4-3 4-6.5 0-2-1-3.5-2-5-.5-.7-.7-1.5-.5-2.5-1 .5-1.5 1-1.5 2z" fill="currentColor" fillOpacity="0.18" />
      <path d="M12 3.5c.5 2.5-1 4-2 5.5-1 1.5-2 3-2 5 0 3.5 2.5 6 4 6.5 1.5-.5 4-3 4-6.5 0-2-1-3.5-2-5-.5-.7-.7-1.5-.5-2.5" />
      <path d="M12 11c-.4 1 .2 2 .8 2.5.6.5 1.2 1.2 1.2 2.2 0 1.4-1 2.3-2 2.5-1-.2-2-1.1-2-2.5 0-1 .6-1.7 1.2-2.2.6-.5 1.2-1.5.8-2.5z" fill="currentColor" />
    </svg>
  );
}

// ============================================================
// LOCATION — map marker with an inner pulse dot
// Hand-drawn asymmetric shape
// ============================================================
export function PinIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 21c-3-4-6.5-8-6.5-12a6.5 6.5 0 1 1 13 0c0 4-3.5 8-6.5 12z" />
      <circle cx="12" cy="9" r="2.2" fill="currentColor" />
    </svg>
  );
}

// ============================================================
// BELL — follows/notify
// Asymmetric with a tilted clapper
// ============================================================
export function EmberBellIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      <path d="M11 7.5c.3-1 1.2-1.5 2-1.5" />
    </svg>
  );
}

// ============================================================
// FILTER — sliders, used for the FILTROS tab
// Asymmetric slider positions
// ============================================================
export function EmberFilterIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="8" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

// ============================================================
// DOCUMENT — used for DETALHE tab
// Slightly tilted with fold corner
// ============================================================
export function EmberDocIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8L14 3z" />
      <path d="M14 3v5h5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

// ============================================================
// NEWSPAPER — used for NEWS tab
// Folded paper with text lines
// ============================================================
export function EmberNewsIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <line x1="7" y1="9" x2="11" y2="9" />
      <line x1="7" y1="12" x2="11" y2="12" />
      <line x1="7" y1="15" x2="11" y2="15" />
      <rect x="13" y="9" width="5" height="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="13" y="13" width="5" height="5" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

// ============================================================
// RADIO/WAVE — for "active" indicator
// Asymmetric pulse waves
// ============================================================
export function EmberRadioIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9" />
      <path d="M16.5 7.5a6.4 6.4 0 0 1 0 9" />
      <path d="M4.5 4.5a10 10 0 0 0 0 15" />
      <path d="M19.5 4.5a10 10 0 0 1 0 15" />
    </svg>
  );
}

// ============================================================
// ALERT — for "critical" severity
// Triangle with asymmetric center
// ============================================================
export function EmberAlertIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3.5 21 19.5H3L12 3.5z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}

// ============================================================
// CLOSE / X
// Hand-drawn asymmetric X
// ============================================================
export function EmberCloseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6.5" y1="18" x2="18" y2="6" />
    </svg>
  );
}

// ============================================================
// SEARCH
// Asymmetric magnifier
// ============================================================
export function EmberSearchIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20" y1="20" x2="15.5" y2="15.5" />
    </svg>
  );
}

// ============================================================
// CHEVRON RIGHT
// ============================================================
export function EmberChevronRight(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

// ============================================================
// CHEVRON DOWN
// ============================================================
export function EmberChevronDown(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ============================================================
// CHEVRON UP
// ============================================================
export function EmberChevronUp(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

// ============================================================
// MAP / GLOBE — for MAPA tab
// ============================================================
export function EmberMapIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

// ============================================================
// MORE (3 dots horizontal)
// ============================================================
export function EmberMoreIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

// ============================================================
// SHARE
// ============================================================
export function EmberShareIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <line x1="8" y1="11" x2="16" y2="7" />
      <line x1="8" y1="13" x2="16" y2="17" />
    </svg>
  );
}

// ============================================================
// CHECK / VERIFIED
// ============================================================
export function EmberCheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

// ============================================================
// FIRES / FLAME PILL — used in incident count badges
// Bigger, more character than lucide
// ============================================================
export function EmberFlameIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 21c-3.5 0-6.5-2.5-6.5-6 0-2.5 1.5-4 3-5.5C10 8 11 6 11 4c.5 1 1.5 2 2 3 1 1.5 2 3 2 5.5 0 1.5-.5 2.5-1 3.5.5-.5 1-1 1-2 1 1.5 2 3 2 5 0 2-1.5 3-3 2z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}