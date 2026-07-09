export const MOBILE_TABS = ["map", "incidents", "alerts", "more"] as const;
export type MobileTab = typeof MOBILE_TABS[number];

const labels: Record<MobileTab, Record<"pt" | "en", string>> = {
  map: { pt: "Mapa", en: "Map" },
  incidents: { pt: "Incêndios", en: "Incidents" },
  alerts: { pt: "Alertas", en: "Alerts" },
  more: { pt: "Mais", en: "More" },
};

export function mobileTabLabel(tab: MobileTab, locale: "pt" | "en"): string {
  return labels[tab][locale];
}
