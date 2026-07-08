"use client";
// MobileView — primary mobile layout for lumes.pt.
//
// Pattern (based on Material Design 3 + Apple HIG + Watch Duty / Cal Fire):
//   - Full-screen map as the canvas (always visible)
//   - Bottom sheet that swaps content based on active tab:
//       * Map tab    → peek (priority list snippet, 96px tall)
//       * Live tab   → expanded (full dashboard content)
//       * Layers tab → full screen overlay
//   - Bottom navigation with 4 tabs: Map / Live / Layers / More
//   - Top status header (sticky, blur background)
//   - Swipe-up gesture: drag the handle to expand the sheet
//
// Why this pattern: most wildfire intel apps (Watch Duty, Cal Fire, Fogos.pt)
// use map-first with bottom sheet for incident list. It respects thumb-zone,
// keeps important data one tap away, and avoids horizontal scroll.

import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence, useMotionValue, type PanInfo } from "framer-motion";
import { Activity, Filter as FilterIcon, Flame, Layers as LayersIcon, Map as MapIcon, MoreHorizontal, X } from "lucide-react";
import { MobileMapControls } from "./mobile-map-controls";
import { MobileLegend } from "./mobile-legend";
import { MobileAttribution } from "./mobile-attribution";
import { MobileFilterPill } from "./mobile-filter-pill";
import { ActiveFilterChips, type ActiveFilter } from "./active-filter-chip";
import { MapPeek, type PeekIncident } from "./map-peek";
import { PullToRefresh } from "./pull-to-refresh";

export type MobileTab = "map" | "live" | "layers" | "more";

interface MobileViewProps {
  // Map content
  map: React.ReactNode;
  // Dashboard panel content (priority list, counters, phases)
  dashboard: React.ReactNode;
  // Sidebar content (filters, layers, sources, news)
  sidebar: React.ReactNode;
  // More menu (notifications, history, report fire)
  more: React.ReactNode;
  // Optional active tab controlled externally
  activeTab?: MobileTab;
  onTabChange?: (tab: MobileTab) => void;
  // Active incident count for badge
  incidentCount?: number;
  criticalCount?: number;
  // Active filter count (for FILTROS tab badge)
  filterCount?: number;
  // Severity counts (for legend)
  severityCounts?: Partial<Record<"critical" | "high" | "medium" | "low", number>>;
  // Currently active severity filters
  activeSeverities?: Set<"critical" | "high" | "medium" | "low">;
  // Toggle a severity on/off from the legend
  onToggleSeverity?: (s: "critical" | "high" | "medium" | "low") => void;
  // Map controls (FABs) — shown overlaid on the map
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLocate?: () => void;
  onLayers?: () => void;
  // Current language (for legend translation)
  lang?: "pt" | "en";
  // Active filters shown as removable chips on the Live tab
  activeFilters?: ActiveFilter[];
  // Map peek data — top 3 priority incidents for the peek view
  peekIncidents?: PeekIncident[];
  peekTotal?: number;
  peekCritical?: number;
  peekHigh?: number;
  onTapIncident?: (id: string) => void;
  // Last data refresh time (for "Updated Xs ago" indicator)
  lastUpdated?: Date | null;
  // Pull-to-refresh callback (Live tab)
  onRefresh?: () => Promise<void> | void;
}

const TAB_LABELS: Record<MobileTab, string> = {
  map: "Mapa",
  live: "Incêndios",
  layers: "Filtros",
  more: "Mais",
};

const TAB_ICONS: Record<MobileTab, typeof MapIcon> = {
  map: MapIcon,
  live: Flame,
  layers: FilterIcon,
  more: MoreHorizontal,
};

export function MobileView({
  map,
  dashboard,
  sidebar,
  more,
  activeTab: externalTab,
  onTabChange,
  incidentCount = 0,
  criticalCount = 0,
  filterCount = 0,
  severityCounts,
  activeSeverities,
  onToggleSeverity,
  onZoomIn,
  onZoomOut,
  onLocate,
  onLayers,
  lang,
  activeFilters = [],
  peekIncidents = [],
  peekTotal,
  peekCritical,
  peekHigh,
  onTapIncident,
  lastUpdated,
  onRefresh,
}: MobileViewProps) {
  const [internalTab, setInternalTab] = useState<MobileTab>("map");
  const activeTab = externalTab ?? internalTab;
  const setActiveTab = (tab: MobileTab) => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
  };

  // Sheet height per tab — peek for map, full for others
  const sheetHeightClass =
    activeTab === "map" ? "h-24" : "h-[calc(100vh-3.5rem-3.5rem)]";

  return (
    <div className="lg:hidden fixed inset-0 flex flex-col bg-[var(--ember-bg)] text-[var(--ember-text)]">
      {/* Map area (always rendered, opacity controlled by tab) */}
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: activeTab === "map" ? 1 : 0,
          pointerEvents: activeTab === "map" ? "auto" : "none",
          transition: "opacity 200ms",
        }}
        aria-hidden={activeTab !== "map"}
      >
        {map}
        {/* Mobile-only map overlays — FABs, attribution, legend */}
        {activeTab === "map" && (
          <>
            <MobileAttribution count={incidentCount} onTap={() => setActiveTab("live")} />
            <MobileFilterPill count={filterCount} onTap={() => setActiveTab("layers")} />
            <MobileLegend
              lang={lang ?? "pt"}
              counts={severityCounts}
              activeSeverities={activeSeverities}
              onToggleSeverity={onToggleSeverity}
            />
            {(onZoomIn || onZoomOut || onLocate) && (
              <MobileMapControls
                onZoomIn={onZoomIn ?? (() => {})}
                onZoomOut={onZoomOut ?? (() => {})}
                onLocate={onLocate ?? (() => {})}
                onLayers={onLayers}
              />
            )}
          </>
        )}
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        activeTab={activeTab}
        heightClass={sheetHeightClass}
        onClose={() => setActiveTab("map")}
      >
        {activeTab === "map" && (
          // Peek view: hero count + top 5 priority incidents
          <div className="h-full overflow-hidden">
            <MapPeek
              total={peekTotal ?? incidentCount}
              critical={peekCritical ?? criticalCount}
              high={peekHigh ?? 0}
              topIncidents={peekIncidents}
              onTapIncident={onTapIncident ?? (() => {})}
              onExpand={() => setActiveTab("live")}
              lastUpdated={lastUpdated}
            />
          </div>
        )}
        {activeTab !== "map" && (
          <SheetHandle
            label={(lang ?? "pt") === "pt" ? "Recolher" : "Collapse"}
            onClick={() => setActiveTab("map")}
          />
        )}
        {activeTab === "live" && (
          <PullToRefresh
            onRefresh={async () => {
              if (onRefresh) {
                try { await onRefresh(); } catch {}
              }
            }}
          >
            <div className="h-full overflow-y-auto ember-scroll">
              <SheetHeader
                title="Incêndios Ativos"
                onClose={() => setActiveTab("map")}
              />
              {activeFilters.length > 0 && (
                <ActiveFilterChips filters={activeFilters} lang={lang ?? "pt"} />
              )}
              {dashboard}
            </div>
          </PullToRefresh>
        )}
        {activeTab === "layers" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title="Filtros & Camadas"
              onClose={() => setActiveTab("map")}
            />
            {sidebar}
          </div>
        )}
        {activeTab === "more" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title="Mais"
              onClose={() => setActiveTab("map")}
            />
            {more}
          </div>
        )}
      </BottomSheet>

      {/* Bottom navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        incidentCount={incidentCount}
        criticalCount={criticalCount}
        filterCount={filterCount}
      />
    </div>
  );
}

function SheetHandle({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const startYRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    draggedRef.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    const delta = startYRef.current - e.clientY; // upward is negative
    if (delta > 12) {
      draggedRef.current = true;
    }
  }
  function onPointerUp() {
    const wasDragged = draggedRef.current;
    startYRef.current = null;
    draggedRef.current = false;
    if (wasDragged && onClick) {
      onClick();
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`w-full flex flex-col items-center pt-2.5 pb-1.5 active:bg-[var(--ember-surface-2)] transition-colors touch-none ${className}`}
      aria-label={`Expandir ${label}`}
    >
      <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)] mb-1.5" />
      <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-muted)] font-semibold">
        {label}
      </span>
    </button>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[var(--ember-bg)] border-b border-[var(--ember-border)]">
      <h2 className="text-base font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="w-9 h-9 -mr-2 flex items-center justify-center rounded-md text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] transition-colors"
        aria-label="Fechar"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function BottomSheet({
  activeTab,
  heightClass,
  onClose,
  children,
}: {
  activeTab: MobileTab;
  heightClass: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const y = useMotionValue(0);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setIsDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight ?? 0;
    const shouldDismiss =
      info.velocity.y > 500 ||
      (info.offset.y > 0 && info.offset.y > sheetHeight * 0.3);
    if (shouldDismiss) {
      onClose();
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key={activeTab}
        ref={sheetRef}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={
          isDragging
            ? { duration: 0 }
            : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
        }
        style={{ y }}
        className={`relative z-10 mt-auto bg-[var(--ember-bg)] border-t border-[var(--ember-border)] rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.3)] ${heightClass} flex flex-col transition-[height] duration-300 touch-none`}
      >
        {/* Drag handle indicator (always visible) */}
        <div className="flex-shrink-0 flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)]" />
        </div>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function BottomNav({
  activeTab,
  onTabChange,
  incidentCount,
  criticalCount,
  filterCount,
}: {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  incidentCount: number;
  criticalCount: number;
  filterCount?: number;
}) {
  return (
    <nav
      className="relative z-20 grid grid-cols-4 bg-[var(--ember-bg)] border-t border-[var(--ember-border)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navegação principal"
    >
      {(["map", "live", "layers", "more"] as MobileTab[]).map((tab) => {
        const Icon = TAB_ICONS[tab];
        const isActive = activeTab === tab;
        const label = TAB_LABELS[tab];
        const showIncidentBadge = tab === "live" && incidentCount > 0;
        const showCriticalBadge = tab === "live" && criticalCount > 0;
        const showFilterBadge = tab === "layers" && (filterCount ?? 0) > 0;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            aria-current={isActive ? "page" : undefined}
            aria-label={label}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              isActive
                ? "text-[var(--ember-accent)]"
                : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              {showCriticalBadge && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-critical)] text-white text-[9px] font-bold flex items-center justify-center">
                  {criticalCount}
                </span>
              )}
              {showIncidentBadge && !showCriticalBadge && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-accent)] text-[var(--ember-bg)] text-[9px] font-bold flex items-center justify-center">
                  {incidentCount}
                </span>
              )}
              {showFilterBadge && (
                <span
                  className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-accent)] text-[var(--ember-bg)] text-[9px] font-bold flex items-center justify-center"
                  aria-label={`${filterCount} filtros ativos`}
                >
                  {filterCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {label}
            </span>
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[var(--ember-accent)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// Placeholder removed — MapPeek now handles the peek view directly.
function PrioritySnippet() {
  return null;
}