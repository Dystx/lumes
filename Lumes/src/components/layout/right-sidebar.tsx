"use client";
// RightSidebar — Smart tabbed sidebar combining Filters + Incident Detail.
//
// Tab 1: Filtros (always available)
// Tab 2: Detalhe (auto-appears when incident selected, auto-activates)
//
// Both panels stay mounted, only one is visible at a time.
// Tab state controlled internally; auto-switches to Detalhe when
// incidentId changes from null to a value.

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, FileText, Newspaper, X } from "@/components/icons/phosphor-icons";
import { EmberFilterIcon, EmberDocIcon, EmberNewsIcon, EmberCloseIcon } from "@/components/icons/brand-icons";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";

export type RightSidebarTab = "filters" | "detail" | "news";

export interface RightSidebarProps {
  filters: ReactNode;
  detail: ReactNode | null;
  news?: ReactNode | null;
  /** Currently selected incident id (or null) */
  selectedIncidentId?: string | null;
  /** External tab control (optional) */
  activeTab?: RightSidebarTab;
  onTabChange?: (tab: RightSidebarTab) => void;
  /** Width — defaults to 360px on desktop */
  width?: number;
  /** Called when user clicks the X on the detail tab */
  onCloseDetail?: () => void;
}

export function RightSidebar({
  filters,
  detail,
  news,
  selectedIncidentId,
  activeTab: externalTab,
  onTabChange: onExternalTabChange,
  width = 360,
  onCloseDetail,
}: RightSidebarProps) {
  const { language: lang } = useLanguage();
  const [internalTab, setInternalTab] = useState<RightSidebarTab>("filters");

  const activeTab = externalTab ?? internalTab;
  const setActiveTab = (tab: RightSidebarTab) => {
    if (onExternalTabChange) {
      onExternalTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Auto-switch to detail tab when an incident is selected
  useEffect(() => {
    if (selectedIncidentId && activeTab !== "detail") {
      setActiveTab("detail");
    }
  }, [selectedIncidentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasDetail = !!detail;
  const hasNews = !!news;
  const showDetailTab = hasDetail;
  const showNewsTab = hasNews;

  return (
    <aside
      className="hidden lg:flex h-full flex-col bg-[var(--ember-bg)] border-l border-[var(--ember-border)] flex-shrink-0 z-30"
      style={{ width }}
      aria-label={lang === "pt" ? "Painel lateral" : "Side panel"}
    >
      {/* Tabs */}
      <div className="flex items-stretch border-b border-[var(--ember-border)] bg-[var(--ember-surface-2)] flex-shrink-0">
        <TabButton
          icon={<EmberFilterIcon className="w-3.5 h-3.5" />}
          label={t(lang, "tabs.filters")}
          active={activeTab === "filters"}
          onClick={() => setActiveTab("filters")}
          count={undefined}
        />
        <TabButton
          icon={<EmberDocIcon className="w-3.5 h-3.5" />}
          label={t(lang, "tabs.detail")}
          active={activeTab === "detail"}
          onClick={() => setActiveTab("detail")}
          count={selectedIncidentId ? "●" : undefined}
          hidden={!showDetailTab}
        />
        <TabButton
          icon={<EmberNewsIcon className="w-3.5 h-3.5" />}
          label={t(lang, "tabs.news")}
          active={activeTab === "news"}
          onClick={() => setActiveTab("news")}
          count={undefined}
          hidden={!showNewsTab}
        />
        {/* Spacer + close detail button */}
        <div className="ml-auto flex items-center pr-1">
          {activeTab === "detail" && onCloseDetail && (
            <button
              type="button"
              onClick={onCloseDetail}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface)] transition-colors"
              aria-label={t(lang, "a11y.closePanel")}
            >
              <EmberCloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "filters" && (
            <motion.div
              key="filters"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-y-auto ember-scroll"
            >
              {filters}
            </motion.div>
          )}
          {activeTab === "detail" && detail && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-y-auto ember-scroll"
            >
              {detail}
            </motion.div>
          )}
          {activeTab === "news" && news && (
            <motion.div
              key="news"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-y-auto ember-scroll"
            >
              {news}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
  count,
  hidden,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
        active
          ? "text-[var(--ember-accent)] bg-[var(--ember-bg)]"
          : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
      }`}
    >
      {icon}
      <span>{label}</span>
      {count && (
        <span className={`text-[9px] font-mono tabular-nums ${
          count === "●" ? "text-[var(--ember-accent)]" : ""
        }`}>
          {count}
        </span>
      )}
      {active && (
        <span className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--ember-accent)]" />
      )}
    </button>
  );
}