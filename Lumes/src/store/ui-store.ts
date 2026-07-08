// useUIStore — central UI state (filters, layers, modals, selection).
//
// TASK D (refactor plan): Extract 30+ useState hooks from page.tsx.
// Data fetching state stays in useLiveData (in /lib/use-live-data.ts).
//
// All setter functions are exposed as actions. This replaces prop
// drilling and useState/UseEffect sprawl.

import { create } from "zustand";
import type { BasemapMode } from "@/lib/types";

type MobileTab = "map" | "live" | "layers" | "more";

export type IncidentSort = "recent" | "severity" | "area" | "personnel";
export type QuickFilter = "all" | "critical" | "high" | "active";
export type Severity = "critical" | "high" | "medium" | "low";
export type SourceType = "satellite" | "official" | "community" | "news";

interface UIState {
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
  visibleSources: Set<SourceType>;
  toggleSource: (s: SourceType) => void;
  criticalOnly: boolean;
  setCriticalOnly: (v: boolean | ((p: boolean) => boolean)) => void;
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

  // ─── Selection / focus ───
  selectedIncidentId: string | null;
  setSelectedIncidentId: (id: string | null) => void;
  flyToIncidentId: string | null;
  setFlyToIncidentId: (id: string | null) => void;

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
  severityFilter: new Set(["critical", "high", "medium", "low"] as Severity[]),
  toggleSeverity: (s) =>
    set((state) => {
      const next = new Set(state.severityFilter);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { severityFilter: next };
    }),
  visibleSources: new Set(["satellite", "official", "community", "news"] as SourceType[]),
  toggleSource: (s) =>
    set((state) => {
      const next = new Set(state.visibleSources);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { visibleSources: next };
    }),
  criticalOnly: false,
  setCriticalOnly: (v) =>
    set((s) => ({ criticalOnly: typeof v === "function" ? v(s.criticalOnly) : v })),
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

  // Selection
  selectedIncidentId: null,
  setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),
  flyToIncidentId: null,
  setFlyToIncidentId: (id) => set({ flyToIncidentId: id }),

  // Modals
  notifOpen: false,
  setNotifOpen: (v) => set({ notifOpen: v }),
  showHistoryModal: false,
  setShowHistoryModal: (v) => set({ showHistoryModal: v }),
  showReportModal: false,
  setShowReportModal: (v) => set({ showReportModal: v }),
  helpOpen: false,
  setHelpOpen: (v) => set({ helpOpen: v }),
  showShortcuts: false,
  setShowShortcuts: (v) => set({ showShortcuts: v }),
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),

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