"use client";
// CollapsibleLegend — collapsible map legend overlay.
//
// Shows: severity colors, source type colors, evacuation zone, IPMA fire risk
// levels. Toggleable expand/collapse. Positioned bottom-left of the map.
//
// Tasks C-leaves (refactor plan): extracted from page.tsx.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import { SEVERITY_LABEL, type Severity } from "@/lib/incident";
import { visibleLegendLayers, type MapLegendLayerState } from "@/lib/map-layer-legend";

export function CollapsibleLegend({
  lang,
  positioned = true,
  visibleCount,
  showLayerDetails = false,
  layerStates = { satellite: "disabled", community: "disabled", evacuation: "disabled", fireRisk: "disabled" },
}: {
  lang: Language;
  positioned?: boolean;
  visibleCount?: number;
  showLayerDetails?: boolean;
  layerStates?: MapLegendLayerState;
}) {
  const [expanded, setExpanded] = useState(true);
  const legendLayers = visibleLegendLayers(layerStates, showLayerDetails);

  return (
    <div className={`${positioned ? "absolute bottom-28 left-6 z-10" : "relative"} bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border)] rounded-md text-xs shadow-[var(--ember-shadow-sm)] pointer-events-auto overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--ember-surface-2)] transition-colors"
      >
        <span className="font-semibold uppercase tracking-wider text-[var(--ember-text-faint)] text-meta">
          {t(lang, "sidebar.legend")}
        </span>
        {visibleCount !== undefined && (
          <span className="ml-auto mr-2 text-meta font-mono tabular-nums text-[var(--ember-text-muted)]">
            {visibleCount}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-[var(--ember-text-faint)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {/* Severity */}
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => {
                const color =
                  s === "critical" ? "var(--ember-critical)"
                  : s === "high" ? "var(--ember-warning)"
                  : s === "medium" ? "var(--ember-info)"
                  : "var(--ember-success)";
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span
                      className={`flex h-3 w-3 items-center justify-center border text-[8px] font-bold text-white ${s === "critical" ? "rounded-sm" : "rounded-full"}`}
                      style={{ background: color, borderColor: "rgba(255,255,255,0.2)" }}
                      aria-hidden
                    >{s === "critical" ? "!" : ""}</span>
                    <span className="text-[var(--ember-text-muted)]">
                      {SEVERITY_LABEL[s][lang]}
                    </span>
                  </div>
                );
              })}

              {/* Optional layer explanations stay out of the default map legend. */}
              {showLayerDetails && legendLayers.some((layer) => layer !== "severity") && (
              <div className="pt-2 mt-1 border-t border-[var(--ember-border)] space-y-1.5">
                {legendLayers.includes("satellite") && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "var(--ember-source-satellite)" }}
                    aria-hidden
                  />
                  <span className="text-[var(--ember-text-muted)] text-meta">
                    {t(lang, "legend.satellite")}
                  </span>
                </div>
                )}
                {legendLayers.includes("community") && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "var(--ember-source-community)" }}
                    aria-hidden
                  />
                  <span className="text-[var(--ember-text-muted)] text-meta">
                    {t(lang, "legend.community")}
                  </span>
                </div>
                )}
                {legendLayers.includes("evacuation") && (
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-1 rounded-sm"
                    style={{ background: "var(--ember-source-evacuation)", opacity: 0.5 }}
                    aria-hidden
                  />
                  <span className="text-[var(--ember-text-muted)] text-meta">
                    {t(lang, "legend.evacuation")}
                  </span>
                </div>
                )}
                <div className="pt-1 text-meta text-[var(--ember-text-faint)]">{t(lang, "legend.synthetic")}</div>
              </div>
              )}

              {/* Fire Risk legend */}
              {showLayerDetails && legendLayers.includes("fire-risk") && (
              <div className="pt-2 mt-1 border-t border-[var(--ember-border)]">
                <div className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-1.5">
                  {t(lang, "sidebar.fireRisk")}
                </div>
                <div className="space-y-1">
                  {([
                    { key: "risk.maximum", color: "var(--ember-risk-maximum)" },
                    { key: "risk.veryHigh", color: "var(--ember-risk-very-high)" },
                    { key: "risk.high", color: "var(--ember-risk-high)" },
                    { key: "risk.moderate", color: "var(--ember-risk-moderate)" },
                    { key: "risk.reduced", color: "var(--ember-risk-reduced)" },
                  ]).map((r) => (
                    <div key={r.key} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: r.color }}
                        aria-hidden
                      />
                      <span className="text-[var(--ember-text-muted)] text-meta">
                        {t(lang, r.key)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
