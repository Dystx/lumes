import { t, type Language } from "@/lib/i18n";
import { statusLabel, type IncidentStatus } from "@/lib/incident";
import type { LiveIncident } from "@/lib/types";

export type IncidentPresentation = {
  title: string;
  location: string | null;
  stateLabel: string;
  stateGroup: "active" | "contained" | "resolved" | "unknown";
  observedAt: string;
  receivedAt: string;
};

type IncidentStateInput = Pick<LiveIncident, "incidentStatus"> | { status?: string };

const SENTINEL_LABELS = new Set([
  "",
  "-",
  "—",
  "--",
  "---",
  "n/a",
  "na",
  "unknown",
  "desconhecido",
]);

function cleanLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || SENTINEL_LABELS.has(normalized.toLowerCase())) return null;
  return normalized;
}

function stateGroup(status: string | null | undefined): IncidentPresentation["stateGroup"] {
  switch (status) {
    case "active":
    case "detected":
    case "monitoring":
      return "active";
    case "contained":
      return "contained";
    case "resolved":
      return "resolved";
    default:
      return "unknown";
  }
}

export function presentIncident(incident: LiveIncident, lang: Language): IncidentPresentation {
  const locality = cleanLabel(incident.properties.localidade ?? incident.properties.locality);
  const municipality = cleanLabel(incident.properties.municipality);
  const district = cleanLabel(incident.properties.region ?? incident.properties.subregion);
  const parish = cleanLabel(incident.properties.parish);
  const group = stateGroup(incident.incidentStatus);
  const status = incident.incidentStatus as IncidentStatus;
  const locationParts = [parish, municipality].filter((value, index, values) => value && values.indexOf(value) === index);

  return {
    title: locality ?? municipality ?? district ?? t(lang, "incident.unnamed"),
    location: locationParts.length > 0 ? locationParts.join(", ") : district,
    stateLabel: group === "unknown" ? t(lang, "incident.unknownState") : statusLabel(status, lang),
    stateGroup: group,
    observedAt: incident.observedAt,
    receivedAt: incident.ingestedAt,
  };
}
function stateForIncident(incident: IncidentStateInput): string | undefined {
  if ("incidentStatus" in incident) return incident.incidentStatus;
  return incident.status;
}

export function countIncidentStates(incidents: IncidentStateInput[]): {
  visible: number;
  active: number;
  contained: number;
  resolved: number;
} {
  return incidents.reduce(
    (counts, incident) => {
      counts.visible += 1;
      const group = stateGroup(stateForIncident(incident));
      if (group === "active") counts.active += 1;
      if (group === "contained") counts.contained += 1;
      if (group === "resolved") counts.resolved += 1;
      return counts;
    },
    { visible: 0, active: 0, contained: 0, resolved: 0 },
  );
}
