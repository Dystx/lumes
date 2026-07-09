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
import { Activity, Filter as FilterIcon, Flame, Layers as LayersIcon, Map as MapIcon, MoreHorizontal, X } from "@/components/icons/phosphor-icons";
import { EmberMapIcon, EmberFilterIcon, EmberMoreIcon, EmberFlameIcon, EmberCloseIcon } from "@/components/icons/brand-icons";
import { MobileMapControls } from "./mobile-map-controls";
import { MobileLegend } from "./mobile-legend";
import { MobileAttribution } from "./mobile-attribution";
import { MobileFilterPill } from "./mobile-filter-pill";
import { ActiveFilterChips, type ActiveFilter } from "./active-filter-chip";
import { MapPeek, type PeekIncident } from "./map-peek";
import { PullToRefresh } from "./pull-to-refresh";
import { MOBILE_TABS, mobileTabLabel, type MobileTab } from "@/lib/mobile-navigation";
import { trapFocus } from "@/lib/focus-trap";
import type { DataTrustState } from "@/lib/data-trust";

export type { MobileTab } from "@/lib/mobile-navigation";

interface MobileViewProps {
  // Map content
  map: React.ReactNode;
  // Dashboard panel content (priority list, counters, phases)
  dashboard: React.ReactNode;
  // Sidebar content (filters, layers, sources, news)
  sidebar: React.ReactNode;
  // More menu (notifications, history, report fire)
  more: React.ReactNode;
  // Followed incidents, notification history, and urgent updates.
  alerts: React.ReactNode;
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
  dataTrust?: DataTrustState;
  // Pull-to-refresh callback (Live tab)
  onRefresh?: () => Promise<void> | void;
}

const TAB_ICONS: Record<MobileTab, typeof MapIcon> = {
  map: EmberMapIcon,
  incidents: EmberFlameIcon,
  alerts: Activity,
  more: EmberMoreIcon,
};

export function MobileView({
  map,
  dashboard,
  sidebar,
  more,
  alerts,
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
  dataTrust,
  onRefresh,
}: MobileViewProps) {
  const [internalTab, setInternalTab] = useState<MobileTab>("map");
  const [mapSheetExpanded, setMapSheetExpanded] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLElement>(null);
  const exploreOpenerRef = useRef<HTMLElement | null>(null);
  const activeTab = externalTab ?? internalTab;
  const setActiveTab = (tab: MobileTab) => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
    if (tab !== "map") setMapSheetExpanded(false);
    setExploreOpen(false);
  };
  const openExplore = () => {
    exploreOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setExploreOpen(true);
  };

  useEffect(() => {
    if (!exploreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExploreOpen(false);
        return;
      }
      if (exploreRef.current) trapFocus(exploreRef.current, event);
    };
    const focusTimer = requestAnimationFrame(() => {
      exploreRef.current?.querySelector<HTMLElement>("button, input, select, [tabindex]:not([tabindex='-1'])")?.focus();
    });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      exploreOpenerRef.current?.focus();
    };
  }, [exploreOpen]);

  // The map starts with a one-row summary. It expands before rendering
  // incident cards, avoiding the clipped 96px peek.
  const sheetHeightClass =
    activeTab === "map"
      ? (mapSheetExpanded ? "h-[52vh]" : "h-14")
      : "h-[calc(100vh-3.5rem-3.5rem)]";

  return (
    <div className="xl:hidden fixed inset-0 flex flex-col bg-transparent text-[var(--ember-text)]">
      {/* Tablet toolbar: keep the map-first shell while replacing phone-only
          bottom navigation with a compact, reachable top control row. */}
      <div className="hidden md:flex xl:hidden absolute inset-x-0 top-0 z-20 items-center gap-1 border-b border-[var(--ember-border)] bg-[var(--ember-bg)]/90 px-3 py-2 backdrop-blur-md">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors ${activeTab === tab ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)]" : "text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)]"}`}
          >
            {mobileTabLabel(tab, lang ?? "pt")}
          </button>
        ))}
        <button
          type="button"
          onClick={openExplore}
          className="ml-auto min-h-11 rounded-md border border-[var(--ember-border)] px-3 text-sm font-medium text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)]"
        >
          {lang === "en" ? "Explore" : "Explorar"}
        </button>
      </div>
      {/* Map area (always rendered, opacity controlled by tab) */}
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: activeTab === "map" ? 1 : 0,
          // The MapScene is shared underneath this chrome. Only explicit
          // controls opt back into pointer events; the transparent surface
          // must not intercept map gestures.
          pointerEvents: "none",
          transition: "opacity 200ms",
        }}
        aria-hidden={activeTab !== "map"}
      >
        {map}
        {/* Mobile-only map overlays — FABs, attribution, legend */}
        {activeTab === "map" && (
          <>
            <MobileAttribution count={incidentCount} dataTrust={dataTrust} onTap={() => setActiveTab("incidents")} />
            <MobileFilterPill count={filterCount} onTap={openExplore} />
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
                onLayers={onLayers ?? openExplore}
                lang={lang}
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
              onExpand={() => setMapSheetExpanded(true)}
              onViewIncidents={() => setActiveTab("incidents")}
              lastUpdated={lastUpdated}
              compact={!mapSheetExpanded}
            />
          </div>
        )}
        {activeTab !== "map" && (
          <SheetHandle
            label={(lang ?? "pt") === "pt" ? "Recolher" : "Collapse"}
            onClick={() => setActiveTab("map")}
          />
        )}
        {activeTab === "incidents" && (
          <PullToRefresh
            onRefresh={async () => {
              if (onRefresh) {
                try { await onRefresh(); } catch {}
              }
            }}
          >
            <div className="h-full overflow-y-auto ember-scroll">
              <SheetHeader
                title={(lang ?? "pt") === "pt" ? "Incêndios ativos" : "Active incidents"}
                onClose={() => setActiveTab("map")}
              />
              {activeFilters.length > 0 && (
                <ActiveFilterChips filters={activeFilters} lang={lang ?? "pt"} />
              )}
              {dashboard}
            </div>
          </PullToRefresh>
        )}
        {activeTab === "alerts" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title={(lang ?? "pt") === "pt" ? "Alertas" : "Alerts"}
              onClose={() => setActiveTab("map")}
            />
            {alerts}
          </div>
        )}
        {activeTab === "more" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title={(lang ?? "pt") === "pt" ? "Mais" : "More"}
              onClose={() => setActiveTab("map")}
            />
            {more}
          </div>
        )}
      </BottomSheet>

      <AnimatePresence>
        {exploreOpen && (
          <motion.section
            ref={exploreRef}
            role="dialog"
            aria-modal="true"
            aria-label={(lang ?? "pt") === "pt" ? "Explorar mapa" : "Explore map"}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 z-30 flex max-h-[92vh] flex-col rounded-t-2xl border-t border-[var(--ember-border)] bg-[var(--ember-bg)] shadow-[var(--ember-shadow-lg)] md:left-auto md:right-0 md:w-[min(28rem,calc(100vw-1rem))]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <SheetHeader
              title={(lang ?? "pt") === "pt" ? "Explorar" : "Explore"}
              onClose={() => setExploreOpen(false)}
            />
            <div className="min-h-0 flex-1 overflow-y-auto ember-scroll">{sidebar}</div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Bottom navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        incidentCount={incidentCount}
        criticalCount={criticalCount}
        lang={lang ?? "pt"}
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
    <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between px-4 py-3 bg-[var(--ember-bg)] border-b border-[var(--ember-border)]">
      <h2 className="text-base font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="w-11 h-11 -mr-2 flex items-center justify-center rounded-md text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] transition-colors"
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
        drag={activeTab === "map" ? "y" : false}
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
        className={`relative z-10 mt-auto bg-[var(--ember-bg)] border-t border-[var(--ember-border)] rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.3)] ${heightClass} flex flex-col transition-[height] duration-300`}
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
  lang,
}: {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  incidentCount: number;
  criticalCount: number;
  lang: "pt" | "en";
}) {
  return (
    <nav
      className="relative z-20 grid grid-cols-4 bg-[var(--ember-bg)] border-t border-[var(--ember-border)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label={lang === "pt" ? "Navegação principal" : "Primary navigation"}
    >
      {MOBILE_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const isActive = activeTab === tab;
        const label = mobileTabLabel(tab, lang);
        const showIncidentBadge = tab === "incidents" && incidentCount > 0;
        const showCriticalBadge = tab === "incidents" && criticalCount > 0;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            aria-current={isActive ? "page" : undefined}
            aria-label={label}
            className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
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
