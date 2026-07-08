"use client";
// RightSidebar — Collapsible right rail combining Filters + Detail + News.
//
// Pattern (based on FlightRadar24, Watch Duty, modern map apps):
// - Default: collapsed to a slim 48px rail on the right edge
// - Each tab (Filters/Detail/News) becomes a floating panel that slides
//   in from the right when activated
// - Map gets maximum screen real estate by default
// - Active filter count badge always visible on the rail
//
// This is a major UX improvement over a fixed sidebar.

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Funnel, FileText, Newspaper, X } from "@/components/icons/phosphor-icons";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";

export type RightSidebarTab = "filters" | "detail" | "news";

export interface RightSidebarProps {
  filters: ReactNode;
  detail: ReactNode | null;
  news?: ReactNode | null;
  /** Currently selected incident id (or null) */
  selectedIncidentId?: string | null;
  /** Active filter count (shown as badge on the rail) */
  activeFilterCount?: number;
  /** Unread notification count (shown as badge on bell) */
  unreadCount?: number;
  /** Open the panel by default (used for detail auto-open) */
  defaultOpenTab?: RightSidebarTab | null;
  /** Called when user clicks the X on the detail tab */
  onCloseDetail?: () => void;
}

export function RightSidebar({
  filters,
  detail,
  news,
  selectedIncidentId,
  activeFilterCount = 0,
  unreadCount = 0,
  defaultOpenTab = null,
  onCloseDetail,
}: RightSidebarProps) {
  const { language: lang } = useLanguage();
  const [openTab, setOpenTab] = useState<RightSidebarTab | null>(defaultOpenTab);

  // Auto-open detail tab when an incident is selected (if not already open)
  useEffect(() => {
    if (selectedIncidentId && openTab !== "detail") {
      setOpenTab("detail");
    }
  }, [selectedIncidentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasDetail = !!detail;
  const hasNews = !!news;
  const isOpen = openTab !== null;

  const handleTabClick = (tab: RightSidebarTab) => {
    if (openTab === tab) {
      // Toggle off if same tab
      setOpenTab(null);
    } else {
      setOpenTab(tab);
    }
  };

  return (
    <>
      {/* Slim rail - always visible */}
      <aside
        className="hidden lg:flex flex-col items-center py-3 px-1.5 gap-2 bg-[var(--ember-surface)]/95 backdrop-blur-md border-l border-[var(--ember-border)] flex-shrink-0 z-20 w-12"
        aria-label={lang === "pt" ? "Barra lateral" : "Side rail"}
      >
        <RailButton
          icon={<Funnel size={20} weight={openTab === "filters" ? "fill" : "regular"} />}
          label={t(lang, "tabs.filters")}
          active={openTab === "filters"}
          badge={activeFilterCount}
          onClick={() => handleTabClick("filters")}
        />
        {hasDetail && (
          <RailButton
            icon={<FileText size={20} weight={openTab === "detail" ? "fill" : "regular"} />}
            label={t(lang, "tabs.detail")}
            active={openTab === "detail"}
            badge={selectedIncidentId ? "●" : undefined}
            onClick={() => handleTabClick("detail")}
          />
        )}
        {hasNews && (
          <RailButton
            icon={<Newspaper size={20} weight={openTab === "news" ? "fill" : "regular"} />}
            label={t(lang, "tabs.news")}
            active={openTab === "news"}
            onClick={() => handleTabClick("news")}
          />
        )}
      </aside>

      {/* Floating panel - slides in from the right */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key={openTab}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:flex flex-col absolute right-12 top-0 bottom-0 w-[360px] bg-[var(--ember-bg)] border-l border-[var(--ember-border)] z-30 shadow-[-8px_0_24px_rgba(0,0,0,0.3)]"
            aria-label={
              openTab === "filters" ? t(lang, "tabs.filters") :
              openTab === "detail" ? t(lang, "tabs.detail") :
              t(lang, "tabs.news")
            }
          >
            {/* Tab header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
              <div className="flex items-center gap-2">
                {openTab === "filters" && <Funnel size={16} weight="bold" className="text-[var(--ember-accent)]" />}
                {openTab === "detail" && <FileText size={16} weight="bold" className="text-[var(--ember-accent)]" />}
                {openTab === "news" && <Newspaper size={16} weight="bold" className="text-[var(--ember-accent)]" />}
                <h2 className="text-sm font-semibold text-[var(--ember-text)]">
                  {openTab === "filters" && t(lang, "tabs.filters")}
                  {openTab === "detail" && t(lang, "tabs.detail")}
                  {openTab === "news" && t(lang, "tabs.news")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenTab(null)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
                aria-label={t(lang, "a11y.closePanel")}
              >
                <X size={14} />
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {openTab === "filters" && (
                  <motion.div
                    key="filters"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18 }}
                    className="h-full overflow-y-auto ember-scroll"
                  >
                    {filters}
                  </motion.div>
                )}
                {openTab === "detail" && detail && (
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
                {openTab === "news" && news && (
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
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function RailButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: number | string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
        active
          ? "bg-[var(--ember-accent)] text-white"
          : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)]"
      }`}
    >
      {icon}
      {badge && badge !== "0" && badge !== 0 && (
        <span
          className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums ${
            badge === "●"
              ? "bg-[var(--ember-accent)] text-white w-2 h-2 min-w-0 p-0"
              : active
                ? "bg-white text-[var(--ember-accent)]"
                : "bg-[var(--ember-accent)] text-white"
          }`}
        >
          {badge === "●" ? "" : badge}
        </span>
      )}
    </button>
  );
}