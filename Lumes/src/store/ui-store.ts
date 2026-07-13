// useUIStore — central UI state (filters, layers, modals, selection).
//
// TASK D (refactor plan): Extract 30+ useState hooks from page.tsx.
// Data fetching state uses useAppData (in /lib/use-app-data.ts); realtime and
// browser-local follow state use focused hooks in /lib/use-realtime-incidents
// and /lib/use-followed-incidents.
//
// All setter functions are exposed as actions. This replaces prop
// drilling and useState/UseEffect sprawl.

import { create } from "zustand";
import { ALL_SEVERITIES, type IncidentFilterState, type ResourceFilter } from "@/lib/incident-filters";
import type { BasemapMode, SourceType, Severity as IncidentSeverity } from "@/lib/types";
import type { MobileTab } from "@/lib/mobile-navigation";
import { closeOverlay, closeTopOverlay, openOverlay } from "@/lib/overlay-stack";

export type IncidentSort = "recent" | "severity" | "area" | "personnel";
export type QuickFilter = "all" | "critical" | "high" | "active";
export type Severity = IncidentSeverity;
export type { ActiveFilter, IncidentFilterState, ResourceFilter } from "@/lib/incident-filters";

/** Display state is intentionally separate from incident query state. */
export interface MapDisplayState {
  basemap: BasemapMode;
  visibleSources: ReadonlySet<SourceType>;
  fireRiskFilter: number | null;
  showFireRisk: boolean;
  showFireStations: boolean;
  showSatellite: boolean;
  showAerial: boolean;
  showBiomass: boolean;
  showCompositeRisk: boolean;
}

export type OverlayId = "notifications" | "history" | "report" | "help" | "shortcuts" | "mobile-sidebar";

export interface UIState {
  // ─── Map / basemap ───
  basemap: BasemapMode;
  setBasemap: (b: BasemapMode) => void;

  // ─── Layer visibility ───
  showFireRisk: boolean;
  setShowFireRisk: (v: boolean | ((p: boolean) => boolean)) => void;
  showFireStations: boolean;
  setShowFireStations: (v: boolean | ((p: boolean) => boolean)) => void;
  showSatellite: boolean;
  setShowSatellite: (v: boolean | ((p: boolean) => boolean)) => void;
  showAerial: boolean;
  setShowAerial: (v: boolean | ((p: boolean) => boolean)) => void;
  showBiomass: boolean;
  setShowBiomass: (v: boolean | ((p: boolean) => boolean)) => void;
  showCompositeRisk: boolean;
  setShowCompositeRisk: (v: boolean | ((p: boolean) => boolean)) => void;

  // ─── Filters ───
  severityFilter: Set<Severity>;
  toggleSeverity: (s: Severity) => void;
  resetSeverityFilter: () => void;
  visibleSources: Set<SourceType>;
  toggleSource: (s: SourceType) => void;
  hideResolved: boolean;
  setHideResolved: (v: boolean | ((p: boolean) => boolean)) => void;
  fireRiskFilter: number | null;
  setFireRiskFilter: (v: number | null) => void;
  phaseFilter: string | null;
  setPhaseFilter: (p: string | null) => void;
  resourceFilter: "personnel" | "engines" | "aircraft" | null;
  setResourceFilter: (r: "personnel" | "engines" | "aircraft" | null) => void;
  quickFilter: QuickFilter;
  setQuickFilter: (q: QuickFilter) => void;
  sortMode: IncidentSort;
  setSortMode: (s: IncidentSort) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** Atomically replaces query filters while preserving map display state. */
  replaceIncidentFilters: (filters: IncidentFilterState) => void;
  /** Restores the documented incident-query baseline only; map display is preserved. */
  resetIncidentFilters: () => void;

  // ─── Selection / focus ───
  selectedIncidentId: string | null;
  setSelectedIncidentId: (id: string | null) => void;
  flyToIncidentId: string | null;
  setFlyToIncidentId: (id: string | null) => void;
  /** Clears selected/fly-to state when an active query no longer includes it. */
  reconcileIncidentSelection: (visibleIncidentIds: ReadonlySet<string>) => void;

  // ─── Modals / drawers ───
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  showHistoryModal: boolean;
  setShowHistoryModal: (v: boolean) => void;
  showReportModal: boolean;
  setShowReportModal: (v: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  showShortcuts: boolean;
  setShowShortcuts: (v: boolean) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (v: boolean) => void;
  overlayStack: OverlayId[];
  openOverlay: (overlay: OverlayId) => void;
  closeOverlay: (overlay: OverlayId) => void;
  closeTopOverlay: () => OverlayId | null;

  // ─── Mobile ───
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;

  // ─── History playback ───
  playbackHour: number;
  setPlaybackHour: (h: number | ((p: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean | ((p: boolean) => boolean)) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Map / basemap
  basemap: "dark",
  setBasemap: (basemap) => set({ basemap }),

  // Layer visibility
  showFireRisk: false,
  setShowFireRisk: (v) =>
    set((s) => ({ showFireRisk: typeof v === "function" ? v(s.showFireRisk) : v })),
  showFireStations: false,
  setShowFireStations: (v) =>
    set((s) => ({ showFireStations: typeof v === "function" ? v(s.showFireStations) : v })),
  showSatellite: false,
  setShowSatellite: (v) =>
    set((s) => ({ showSatellite: typeof v === "function" ? v(s.showSatellite) : v })),
  showAerial: false,
  setShowAerial: (v) =>
    set((s) => ({ showAerial: typeof v === "function" ? v(s.showAerial) : v })),
  showBiomass: false,
  setShowBiomass: (v) =>
    set((s) => ({ showBiomass: typeof v === "function" ? v(s.showBiomass) : v })),
  showCompositeRisk: false,
  setShowCompositeRisk: (v) =>
    set((s) => ({ showCompositeRisk: typeof v === "function" ? v(s.showCompositeRisk) : v })),

  // Filters
  severityFilter: new Set(ALL_SEVERITIES),
  toggleSeverity: (s) =>
    set((state) => {
      const next = new Set(state.severityFilter);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { severityFilter: next };
    }),
  /** Reset severity filter to show all severities (default). */
  resetSeverityFilter: () =>
    set(() => ({ severityFilter: new Set(ALL_SEVERITIES) })),
  visibleSources: new Set(["satellite", "official", "community", "news"] as SourceType[]),
  toggleSource: (s) =>
    set((state) => {
      const next = new Set(state.visibleSources);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { visibleSources: next };
    }),
  hideResolved: true,
  setHideResolved: (v) =>
    set((s) => ({ hideResolved: typeof v === "function" ? v(s.hideResolved) : v })),
  fireRiskFilter: null,
  setFireRiskFilter: (v) => set({ fireRiskFilter: v }),
  phaseFilter: null,
  setPhaseFilter: (p) => set({ phaseFilter: p }),
  resourceFilter: null,
  setResourceFilter: (r) => set({ resourceFilter: r }),
  quickFilter: "all",
  setQuickFilter: (q) => set({ quickFilter: q }),
  sortMode: "recent",
  setSortMode: (s) => set({ sortMode: s }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  replaceIncidentFilters: (filters) => set({
    severityFilter: new Set(filters.severities),
    hideResolved: filters.hideResolved,
    quickFilter: filters.quick,
    phaseFilter: filters.phase,
    resourceFilter: filters.resource,
    searchQuery: filters.search,
  }),
  resetIncidentFilters: () =>
    set({
      severityFilter: new Set(ALL_SEVERITIES),
      hideResolved: true,
      phaseFilter: null,
      resourceFilter: null,
      quickFilter: "all",
      searchQuery: "",
    }),

  // Selection
  selectedIncidentId: null,
  setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),
  flyToIncidentId: null,
  setFlyToIncidentId: (id) => set({ flyToIncidentId: id }),
  reconcileIncidentSelection: (visibleIncidentIds) =>
    set((state) => {
      const selectedIncidentId = state.selectedIncidentId && !visibleIncidentIds.has(state.selectedIncidentId)
        ? null
        : state.selectedIncidentId;
      const flyToIncidentId = state.flyToIncidentId && !visibleIncidentIds.has(state.flyToIncidentId)
        ? null
        : state.flyToIncidentId;
      // Avoid publishing an identical Zustand state on every visible-list
      // render; otherwise the reconciliation effect loops indefinitely.
      if (
        selectedIncidentId === state.selectedIncidentId &&
        flyToIncidentId === state.flyToIncidentId
      ) {
        return state;
      }
      return { selectedIncidentId, flyToIncidentId };
    }),

  // Modals
  notifOpen: false,
  setNotifOpen: (v) => set((state) => ({
    notifOpen: v,
    overlayStack: v ? openOverlay(state.overlayStack, "notifications") : closeOverlay(state.overlayStack, "notifications"),
  })),
  showHistoryModal: false,
  setShowHistoryModal: (v) => set((state) => ({
    showHistoryModal: v,
    overlayStack: v ? openOverlay(state.overlayStack, "history") : closeOverlay(state.overlayStack, "history"),
  })),
  showReportModal: false,
  setShowReportModal: (v) => set((state) => ({
    showReportModal: v,
    overlayStack: v ? openOverlay(state.overlayStack, "report") : closeOverlay(state.overlayStack, "report"),
  })),
  helpOpen: false,
  setHelpOpen: (v) => set((state) => ({
    helpOpen: v,
    overlayStack: v ? openOverlay(state.overlayStack, "help") : closeOverlay(state.overlayStack, "help"),
  })),
  showShortcuts: false,
  setShowShortcuts: (v) => set((state) => ({
    showShortcuts: v,
    overlayStack: v ? openOverlay(state.overlayStack, "shortcuts") : closeOverlay(state.overlayStack, "shortcuts"),
  })),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set((state) => ({
    mobileSidebarOpen: v,
    overlayStack: v ? openOverlay(state.overlayStack, "mobile-sidebar") : closeOverlay(state.overlayStack, "mobile-sidebar"),
  })),
  overlayStack: [],
  openOverlay: (overlay) => set((state) => ({ overlayStack: openOverlay(state.overlayStack, overlay) })),
  closeOverlay: (overlay) => set((state) => ({ overlayStack: closeOverlay(state.overlayStack, overlay) })),
  closeTopOverlay: () => {
    let closed: OverlayId | null = null;
    set((state) => {
      const result = closeTopOverlay(state.overlayStack);
      closed = result.closed;
      if (!result.closed) return state;
      return {
        overlayStack: result.stack,
        notifOpen: result.closed === "notifications" ? false : state.notifOpen,
        showHistoryModal: result.closed === "history" ? false : state.showHistoryModal,
        showReportModal: result.closed === "report" ? false : state.showReportModal,
        helpOpen: result.closed === "help" ? false : state.helpOpen,
        showShortcuts: result.closed === "shortcuts" ? false : state.showShortcuts,
        mobileSidebarOpen: result.closed === "mobile-sidebar" ? false : state.mobileSidebarOpen,
      };
    });
    return closed;
  },

  // Mobile
  mobileTab: "map",
  setMobileTab: (tab) => set({ mobileTab: tab }),

  // Playback
  playbackHour: 0,
  setPlaybackHour: (h) =>
    set((s) => ({ playbackHour: typeof h === "function" ? h(s.playbackHour) : h })),
  isPlaying: false,
  setIsPlaying: (v) =>
    set((s) => ({ isPlaying: typeof v === "function" ? v(s.isPlaying) : v })),
}));

// Helper: read-only selector hook
export function useUIStoreShallow<T>(selector: (s: UIState) => T): T {
  return useUIStore(selector);
}

/** Converts the legacy store field names into the canonical query contract. */
export function selectIncidentFilterState(state: UIState): IncidentFilterState {
  return {
    severities: state.severityFilter,
    hideResolved: state.hideResolved,
    quick: state.quickFilter,
    phase: state.phaseFilter,
    resource: state.resourceFilter,
    search: state.searchQuery,
  };
}

export function selectMapDisplayState(state: UIState): MapDisplayState {
  return {
    basemap: state.basemap,
    visibleSources: state.visibleSources,
    fireRiskFilter: state.fireRiskFilter,
    showFireRisk: state.showFireRisk,
    showFireStations: state.showFireStations,
    showSatellite: state.showSatellite,
    showAerial: state.showAerial,
    showBiomass: state.showBiomass,
    showCompositeRisk: state.showCompositeRisk,
  };
}
