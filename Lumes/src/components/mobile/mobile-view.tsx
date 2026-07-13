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

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
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
import { tFmt } from "@/lib/i18n";
import { notificationBadgeLabel } from "@/lib/notification-presentation";
import { useBlockingOverlay } from "@/lib/blocking-overlay";
import type { DataTrustState } from "@/lib/data-trust";
import { MapChrome } from "@/components/map/map-chrome";
import { deriveMapChromeInsets, type MapChromeMode } from "@/lib/map-chrome";

export type { MobileTab } from "@/lib/mobile-navigation";

interface MobileViewProps {
  // Map content
  map: React.ReactNode;
  // Optional controlled 3D incident status/exit chrome rendered above the map.
  incidentFocusStatus?: React.ReactNode;
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
  // Incident Focus temporarily owns the map surface on compact/tablet shells.
  incidentFocusActive?: boolean;
  // Active incident count for badge
  incidentCount?: number;
  criticalCount?: number;
  // Unread notification count for the Alerts tab badge.
  unreadNotificationCount?: number;
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
  peekActive?: number;
  peekCritical?: number;
  peekHigh?: number;
  onTapIncident?: (id: string) => void;
  // Last data refresh time (for "Updated Xs ago" indicator)
  lastUpdated?: Date | null;
  dataTrust?: DataTrustState;
  optionalLayerWarning?: string;
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
  incidentFocusStatus,
  dashboard,
  sidebar,
  more,
  alerts,
  activeTab: externalTab,
  onTabChange,
  incidentFocusActive = false,
  incidentCount = 0,
  criticalCount = 0,
  unreadNotificationCount = 0,
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
  peekActive,
  peekCritical,
  peekHigh,
  onTapIncident,
  lastUpdated,
  dataTrust,
  optionalLayerWarning,
  onRefresh,
}: MobileViewProps) {
  const [internalTab, setInternalTab] = useState<MobileTab>("map");
  const [mapSheetExpanded, setMapSheetExpanded] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const exploreRef = useRef<HTMLElement>(null);
  const exploreOpenerRef = useRef<HTMLElement | null>(null);
  const selectedTab = externalTab ?? internalTab;
  const activeTab = incidentFocusActive ? "map" : selectedTab;
  const setActiveTab = (tab: MobileTab) => {
    if (incidentFocusActive && tab !== "map") return;
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
    if (tab !== "map") setMapSheetExpanded(false);
    setExploreOpen(false);
  };
  const openExplore = () => {
    exploreOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setExploreOpen(true);
  };

  useBlockingOverlay(exploreOpen, exploreRef, () => setExploreOpen(false));

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const mapChromeMode: MapChromeMode = viewport.width >= 768 ? "tablet" : "phone";
  const visibleMapSheetExpanded = mapSheetExpanded && !incidentFocusActive;
  const mapChromeInsets = useMemo(() => deriveMapChromeInsets({
    mode: mapChromeMode,
    exploreOpen,
    drawerWidth: mapChromeMode === "tablet" ? 448 : 0,
    sheetHeight: activeTab === "map"
      ? (visibleMapSheetExpanded ? viewport.height * 0.52 : 56)
      : 0,
    safeAreaBottom: mapChromeMode === "phone" ? 56 : 0,
  }), [activeTab, exploreOpen, mapChromeMode, visibleMapSheetExpanded, viewport.height]);

  useEffect(() => {
    if (!exploreOpen) return;
    const focusTimer = requestAnimationFrame(() => {
      exploreRef.current?.querySelector<HTMLElement>("button, input, select, [tabindex]:not([tabindex='-1'])")?.focus();
    });
    return () => {
      cancelAnimationFrame(focusTimer);
      exploreOpenerRef.current?.focus();
    };
  }, [exploreOpen]);

  // The map starts with a one-row summary. It expands before rendering
  // incident cards, avoiding the clipped 96px peek.
  const sheetHeightClass =
    activeTab === "map"
      ? (visibleMapSheetExpanded ? "h-[52vh]" : "h-14")
      : "h-[calc(100vh_-_3.5rem_-_3.5rem)]";
  const dataTrustWarning = dataTrust && dataTrust.state !== "fresh" && dataTrust.state !== "updating"
    ? dataTrust.state === "fallback"
      ? (lang === "pt" ? "A mostrar dados alternativos" : "Showing fallback data")
      : dataTrust.state === "stale"
        ? (lang === "pt" ? "Dados desatualizados" : "Data may be stale")
        : dataTrust.state === "empty"
          ? (lang === "pt" ? "Sem dados disponíveis" : "No data available")
          : (lang === "pt" ? "A atualização falhou" : "Refresh failed")
    : null;

  return (
    <div className="xl:hidden fixed inset-0 flex flex-col bg-transparent text-[var(--ember-text)]">
      {/* Tablet toolbar: keep the map-first shell while replacing phone-only
          bottom navigation with a compact, reachable top control row. */}
      <div className="hidden md:flex xl:hidden absolute inset-x-0 top-0 z-20 items-center gap-1 border-b border-[var(--ember-border)] bg-[var(--ember-bg)]/90 px-3 py-2 backdrop-blur-md" data-testid="mobile-tablet-toolbar">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-label={tab === "alerts" && notificationBadgeLabel(unreadNotificationCount)
              ? tFmt(lang ?? "pt", "mobile.alertsWithUnread", { count: unreadNotificationCount })
              : mobileTabLabel(tab, lang ?? "pt")}
            disabled={incidentFocusActive && tab !== "map"}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors ${activeTab === tab ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)]" : "text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)]"}`}
          >
            {mobileTabLabel(tab, lang ?? "pt")}
            {tab === "alerts" && notificationBadgeLabel(unreadNotificationCount) && (
              <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--ember-critical)] px-1 text-meta font-bold text-white" aria-hidden="true">
                {notificationBadgeLabel(unreadNotificationCount)}
              </span>
            )}
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
        data-testid="mobile-map-surface"
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
            {incidentFocusStatus && (
              <MapChrome insets={mapChromeInsets} region="status" mobile className="xl:hidden" testId="incident-focus-status-mobile-chrome">
                {incidentFocusStatus}
              </MapChrome>
            )}
            <MobileAttribution count={incidentCount} dataTrust={dataTrust} topOffset={mapChromeInsets.top} onTap={() => setActiveTab("incidents")} />
            {!exploreOpen && (
              <>
                <MobileFilterPill count={filterCount} topOffset={mapChromeInsets.top} onTap={openExplore} />
                <MobileLegend
                  lang={lang ?? "pt"}
                  counts={severityCounts}
                  activeSeverities={activeSeverities}
                  onToggleSeverity={onToggleSeverity}
                  topOffset={mapChromeInsets.top + 52}
                />
                {(onZoomIn || onZoomOut || onLocate) && (
                  <MobileMapControls
                    onZoomIn={onZoomIn ?? (() => {})}
                    onZoomOut={onZoomOut ?? (() => {})}
                    onLocate={onLocate ?? (() => {})}
                    onLayers={onLayers ?? openExplore}
                    lang={lang}
                    chromeInsets={mapChromeInsets}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        activeTab={activeTab}
        heightClass={sheetHeightClass}
        onClose={() => {
          if (activeTab === "map") setMapSheetExpanded(false);
          else setActiveTab("map");
        }}
      >
        {activeTab === "map" && (
          // Peek view: hero count + top 5 priority incidents
          <div className="h-full overflow-hidden">
            <MapPeek
              total={peekTotal ?? incidentCount}
              activeCount={peekActive ?? incidentCount}
              critical={peekCritical ?? criticalCount}
              high={peekHigh ?? 0}
              topIncidents={peekIncidents}
              onTapIncident={onTapIncident ?? (() => {})}
              onExpand={() => setMapSheetExpanded(true)}
              onViewIncidents={() => setActiveTab("incidents")}
              lastUpdated={lastUpdated}
              compact={!visibleMapSheetExpanded}
              dataTrust={dataTrust}
              optionalLayerWarning={optionalLayerWarning}
            />
          </div>
        )}
        {activeTab !== "map" && (
          <SheetHandle
            label={(lang ?? "pt") === "pt" ? "Recolher" : "Collapse"}
            ariaLabel={(lang ?? "pt") === "pt" ? "Recolher painel" : "Collapse panel"}
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
            {/* PullToRefresh is the single vertical scroll owner for the
                incident sheet. Child panels must not create a competing
                overflow container that steals touch gestures. */}
            <div className="h-full">
              <SheetHeader
                title={(lang ?? "pt") === "pt" ? "Incidentes" : "Incidents"}
                closeLabel={(lang ?? "pt") === "pt" ? "Fechar painel" : "Close panel"}
                onClose={() => setActiveTab("map")}
              />
              {activeFilters.length > 0 && (
                <ActiveFilterChips filters={activeFilters} lang={lang ?? "pt"} />
              )}
              <div className="mobile-phone-content">
                {dataTrustWarning && (
                  <div
                    className="mx-4 mt-2 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)] px-3 py-2 text-meta text-[var(--ember-warning)]"
                    data-testid="mobile-data-trust-warning"
                    role="status"
                  >
                    {dataTrustWarning}
                  </div>
                )}
                {optionalLayerWarning && (
                  <div className="mx-4 mt-2 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)] px-3 py-2 text-meta text-[var(--ember-warning)]" role="status">
                    {optionalLayerWarning}
                  </div>
                )}
                {dashboard}
              </div>
            </div>
          </PullToRefresh>
        )}
        {activeTab === "alerts" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title={(lang ?? "pt") === "pt" ? "Alertas" : "Alerts"}
              closeLabel={(lang ?? "pt") === "pt" ? "Fechar painel" : "Close panel"}
              onClose={() => setActiveTab("map")}
            />
            {alerts}
          </div>
        )}
        {activeTab === "more" && (
          <div className="h-full overflow-y-auto ember-scroll">
            <SheetHeader
              title={(lang ?? "pt") === "pt" ? "Mais" : "More"}
              closeLabel={(lang ?? "pt") === "pt" ? "Fechar painel" : "Close panel"}
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
              closeLabel={(lang ?? "pt") === "pt" ? "Fechar painel" : "Close panel"}
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
        incidentFocusActive={incidentFocusActive}
        incidentCount={incidentCount}
        criticalCount={criticalCount}
        unreadNotificationCount={unreadNotificationCount}
        lang={lang ?? "pt"}
      />
    </div>
  );
}

function SheetHandle({
  label,
  ariaLabel,
  onClick,
  className = "",
}: {
  label: string;
  ariaLabel: string;
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
      aria-label={ariaLabel}
    >
      <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)] mb-1.5" />
      <span className="text-meta uppercase tracking-wider text-[var(--ember-text-muted)] font-semibold">
        {label}
      </span>
    </button>
  );
}

function SheetHeader({ title, closeLabel, onClose }: { title: string; closeLabel: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between px-4 py-3 bg-[var(--ember-bg)] border-b border-[var(--ember-border)]">
      <h2 className="text-base font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="w-11 h-11 -mr-2 flex items-center justify-center rounded-md text-[var(--ember-text-muted)] hover:bg-[var(--ember-surface-2)] hover:text-[var(--ember-text)] transition-colors"
        aria-label={closeLabel}
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
      transition={
        isDragging
          ? { duration: 0 }
          : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
      }
      style={{
        y,
        ...(activeTab === "map" ? {} : { height: "calc(100vh - 7rem)" }),
      }}
      data-testid={activeTab === "map" ? "mobile-map-sheet" : "mobile-content-sheet"}
      className={`relative z-10 mt-auto bg-[var(--ember-bg)] border-t border-[var(--ember-border)] rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.3)] ${heightClass} flex flex-col transition-[height] duration-300`}
    >
      {/* Drag handle indicator (always visible) */}
      <div className="flex-shrink-0 flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)]" />
      </div>
      {children}
    </motion.div>
  );
}

function BottomNav({
  activeTab,
  onTabChange,
  incidentFocusActive,
  incidentCount,
  criticalCount,
  unreadNotificationCount,
  lang,
}: {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  incidentFocusActive: boolean;
  incidentCount: number;
  criticalCount: number;
  unreadNotificationCount: number;
  lang: "pt" | "en";
}) {
  const unreadBadge = notificationBadgeLabel(unreadNotificationCount);
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
        const showUnreadBadge = tab === "alerts" && unreadBadge !== null;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            disabled={incidentFocusActive && tab !== "map"}
            aria-current={isActive ? "page" : undefined}
            aria-label={showUnreadBadge ? tFmt(lang, "mobile.alertsWithUnread", { count: unreadNotificationCount }) : label}
            className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              isActive
                ? "text-[var(--ember-accent)]"
                : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              {showCriticalBadge && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-critical)] text-white text-meta font-bold flex items-center justify-center">
                  {criticalCount}
                </span>
              )}
              {showIncidentBadge && !showCriticalBadge && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-accent)] text-[var(--ember-bg)] text-meta font-bold flex items-center justify-center">
                  {incidentCount}
                </span>
              )}
              {showUnreadBadge && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--ember-critical)] text-white text-meta font-bold flex items-center justify-center">
                  {unreadBadge}
                </span>
              )}
            </div>
            <span className="text-meta font-medium uppercase tracking-wider">
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
