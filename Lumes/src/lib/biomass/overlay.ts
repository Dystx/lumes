export interface BiomassOverlayFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    tonsPerHectare: number;
    species: string;
    speciesLabel: string;
    rateOfSpread: string;
    fuelModel: string;
  };
}
export interface BiomassOverlayCollection {
  type: "FeatureCollection";
  features: BiomassOverlayFeature[];
}

export type BiomassOverlayNormalization =
  | { state: "healthy"; data: BiomassOverlayCollection }
  | { state: "empty"; reason: string }
  | { state: "invalid"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeFeature(value: unknown): BiomassOverlayFeature | null {
  if (!isRecord(value) || value.type !== "Feature") return null;
  const geometry = isRecord(value.geometry) ? value.geometry : null;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
  const properties = isRecord(value.properties) ? value.properties : null;
  if (
    geometry?.type !== "Point"
    || !coordinates
    || coordinates.length < 2
    || !finiteNumber(coordinates[0])
    || !finiteNumber(coordinates[1])
    || !properties
    || !finiteNumber(properties.tonsPerHectare)
    || properties.tonsPerHectare < 0
    || typeof properties.species !== "string"
    || typeof properties.speciesLabel !== "string"
    || typeof properties.rateOfSpread !== "string"
    || typeof properties.fuelModel !== "string"
  ) return null;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [coordinates[0], coordinates[1]],
    },
    properties: {
      tonsPerHectare: properties.tonsPerHectare,
      species: properties.species,
      speciesLabel: properties.speciesLabel,
      rateOfSpread: properties.rateOfSpread,
      fuelModel: properties.fuelModel,
    },
  };
}

/** Converts the biomass-grid response into a safe, renderable GeoJSON shape. */
export function normalizeBiomassOverlayResponse(value: unknown): BiomassOverlayNormalization {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return { state: "invalid", reason: "Biomass response was malformed" };
  }

  const dataState = isRecord(value.dataState) ? value.dataState : null;
  if (dataState?.state === "empty" || value.features.length === 0) {
    return {
      state: "empty",
      reason: typeof dataState?.reason === "string" ? dataState.reason : "No biomass data",
    };
  }

  const features = value.features.map(normalizeFeature);
  if (features.some((feature) => feature === null)) {
    return { state: "invalid", reason: "Biomass response was malformed" };
  }

  return {
    state: "healthy",
    data: { type: "FeatureCollection", features: features as BiomassOverlayFeature[] },
  };
}
