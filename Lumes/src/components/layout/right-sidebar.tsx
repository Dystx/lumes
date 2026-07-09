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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Funnel, FileText, Newspaper, X } from "@/components/icons/phosphor-icons";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";
import { IconButton } from "@/components/ui/icon-button";

export type RightSidebarTab = "explore" | "inspector" | "updates";

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
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Auto-open detail tab when an incident is selected (if not already open).
  // This is an intentional "prop change -> UI state" side effect (common for auto-opening panels).
  useEffect(() => {
    if (selectedIncidentId && openTab !== "inspector") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenTab("inspector");
    }
  }, [selectedIncidentId]);

  const hasDetail = !!detail;
  const hasNews = !!news;
  const isOpen = openTab !== null;

  // The rail is a non-modal drawer, but it still owns focus while open and
  // returns focus to the button that opened it. Escape is handled in capture
  // phase so it wins over lower-priority page shortcuts/selected detail.
  useEffect(() => {
    if (!isOpen) {
      openerRef.current?.focus();
      return;
    }
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpenTab(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  const handleTabClick = (tab: RightSidebarTab) => {
    if (openTab === null) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
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
        className="hidden xl:flex flex-col items-center py-3 px-1.5 gap-2 bg-[var(--ember-surface)]/95 backdrop-blur-md border-l border-[var(--ember-border)] flex-shrink-0 z-20 w-12"
        aria-label={lang === "pt" ? "Barra lateral" : "Side rail"}
      >
        <RailButton
          icon={<Funnel size={20} />}
          label={lang === "pt" ? "Explorar" : "Explore"}
          active={openTab === "explore"}
          badge={activeFilterCount}
          onClick={() => handleTabClick("explore")}
        />
        {hasDetail && (
          <RailButton
            icon={<FileText size={20} />}
            label={lang === "pt" ? "Inspector" : "Inspector"}
            active={openTab === "inspector"}
            badge={selectedIncidentId ? "●" : undefined}
            onClick={() => handleTabClick("inspector")}
          />
        )}
        {hasNews && (
          <RailButton
            icon={<Newspaper size={20} />}
            label={lang === "pt" ? "Atualizações" : "Updates"}
            active={openTab === "updates"}
            onClick={() => handleTabClick("updates")}
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
            className="hidden xl:flex flex-col absolute right-12 top-0 bottom-0 w-[360px] bg-[var(--ember-bg)] border-l border-[var(--ember-border)] z-30 shadow-[-8px_0_24px_rgba(0,0,0,0.3)]"
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            tabIndex={-1}
            aria-label={
              openTab === "explore" ? (lang === "pt" ? "Explorar" : "Explore") :
              openTab === "inspector" ? "Inspector" :
              (lang === "pt" ? "Atualizações" : "Updates")
            }
          >
            {/* Tab header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
              <div className="flex items-center gap-2">
                {openTab === "explore" && <Funnel size={16} className="text-[var(--ember-accent)]" />}
                {openTab === "inspector" && <FileText size={16} className="text-[var(--ember-accent)]" />}
                {openTab === "updates" && <Newspaper size={16} className="text-[var(--ember-accent)]" />}
                <h2 className="text-sm font-semibold text-[var(--ember-text)]">
                  {openTab === "explore" && (lang === "pt" ? "Explorar" : "Explore")}
                  {openTab === "inspector" && "Inspector"}
                  {openTab === "updates" && (lang === "pt" ? "Atualizações" : "Updates")}
                </h2>
              </div>
              <IconButton
                onClick={() => setOpenTab(null)}
                className="min-h-9 min-w-9"
                label={t(lang, "a11y.closePanel")}
              >
                <X size={14} />
              </IconButton>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {openTab === "explore" && (
                  <motion.div
                    key="explore"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18 }}
                    className="h-full overflow-y-auto ember-scroll"
                  >
                    {filters}
                  </motion.div>
                )}
                {openTab === "inspector" && detail && (
                  <motion.div
                    key="inspector"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18 }}
                    className="h-full overflow-y-auto ember-scroll"
                  >
                    {detail}
                  </motion.div>
                )}
                {openTab === "updates" && news && (
                  <motion.div
                    key="updates"
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
      className={`relative h-11 w-11 rounded-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember-accent)]/70 ${
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
