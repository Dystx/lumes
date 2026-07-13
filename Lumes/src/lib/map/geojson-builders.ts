import type { Incident, IncidentStatus, Severity } from "@/lib/sample-data";

function severityColor(severity: Severity, theme: "dark" | "light"): string {
  const palette = theme === "dark"
    ? { critical: "#ff6b5b", high: "#ffb786", medium: "#5dade2", low: "#58d68d" }
    : { critical: "#c0392b", high: "#d4875a", medium: "#2e86c1", low: "#27ae60" };
  return palette[severity];
}

function statusOpacity(status: IncidentStatus): number {
  switch (status) {
    case "active":
    case "detected":
      return 0.9;
    case "contained":
      return 0.7;
    case "monitoring":
      return 0.5;
    case "resolved":
      return 0.3;
  }
}

function circlePolygon(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 48,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthRadiusKm = 6371;
  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index * 360) / steps;
    const lat1 = (lat * Math.PI) / 180;
    const lon1 = (lon * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;
    const dr = radiusKm / earthRadiusKm;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dr)
        + Math.cos(lat1) * Math.sin(dr) * Math.cos(bearingRad),
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearingRad) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2),
    );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

/** Build the operational incident point source used by the symbol layers. */
export function buildIncidentsGeoJSON(
  incidents: Incident[],
  theme: "dark" | "light",
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [incident.longitude, incident.latitude],
      },
      properties: {
        id: incident.id,
        displayName: incident.displayName,
        severity: incident.severity,
        status: incident.status,
        areaHa: incident.estimatedAreaHa,
        confidence: incident.confidence,
        verification: incident.verification,
        sourceCount: incident.sourceCount,
        opacity: statusOpacity(incident.status),
        color: severityColor(incident.severity, theme),
      },
    })),
  };
}

function jitterOffset(id: string, max: number, salt = 0): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  hash = (hash + salt) >>> 0;
  return ((hash % 1000) / 1000 - 0.5) * max;
}

/** Build timeline satellite detections as deterministic, non-overlapping points. */
export function buildSatelliteGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const incident of incidents) {
    for (const event of incident.timeline.filter(({ sourceType }) => sourceType === "satellite")) {
      features.push({
        type: "Feature",
        properties: {
          incidentId: incident.id,
          sourceName: event.sourceName,
          confidence: event.confidence,
          timestamp: event.timestamp,
          title: event.title,
        },
        geometry: {
          type: "Point",
          coordinates: [
            incident.longitude + jitterOffset(incident.id + event.id, 0.02),
            incident.latitude + jitterOffset(incident.id + event.id, 0.02, 1),
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Build community reports as deterministic points around their incident. */
export function buildCommunityGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const incident of incidents) {
    for (const event of incident.timeline.filter(({ sourceType }) => sourceType === "community")) {
      features.push({
        type: "Feature",
        properties: {
          incidentId: incident.id,
          sourceName: event.sourceName,
          confidence: event.confidence,
          verification: event.verification,
          timestamp: event.timestamp,
          title: event.title,
        },
        geometry: {
          type: "Point",
          coordinates: [
            incident.longitude + jitterOffset(incident.id + event.id, 0.04),
            incident.latitude + jitterOffset(incident.id + event.id, 0.04, 1),
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Build evacuation buffers around incidents carrying an evacuation order. */
export function buildEvacuationGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const incident of incidents) {
    if (!incident.evacuationOrder) continue;
    const radiusKm = Math.max(2, Math.sqrt(incident.estimatedAreaHa) / 6);
    const feature = circlePolygon(incident.latitude, incident.longitude, radiusKm, 64);
    feature.properties = { incidentId: incident.id, displayName: incident.displayName };
    features.push(feature);
  }
  return { type: "FeatureCollection", features };
}

/** Build the selected-incident halo, or an empty collection when cleared. */
export function buildSelectedGeoJSON(selected: Incident | null): GeoJSON.FeatureCollection {
  if (!selected) return { type: "FeatureCollection", features: [] };
  const radiusKm = Math.max(0.8, Math.sqrt(selected.estimatedAreaHa) / 10) + 1.5;
  const feature = circlePolygon(selected.latitude, selected.longitude, radiusKm, 64);
  feature.properties = { id: selected.id };
  return { type: "FeatureCollection", features: [feature] };
}
