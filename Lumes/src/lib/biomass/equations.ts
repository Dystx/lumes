// Allometric biomass equations for Portuguese forest species groups.
//
// Reference: ICNF IFN5 / MARIOLA / USDA Wood Handbook.
// Values are aboveground biomass (AGB), in tonnes of dry matter per hectare
// for typical Portuguese conditions. These are *averages* — for a serious
// deployment swap with ICNF's parsed IFN5 raster data.

export type SpeciesGroup =
  | "maritime_pine"
  | "stone_pine"
  | "eucalyptus"
  | "cork_oak"
  | "holm_oak"
  | "chestnut"
  | "pyrenean_oak"
  | "mediterranean_shrub"
  | "olive"
  | "mixed_forest";

export interface BiomassProfile {
  tonsPerHectare: number;     // standing biomass, t DM / ha
  fuelModel: string;          // Scott & Burgan fuel model number
  emissionsPerHa: number;     // tonnes CO2-eq released if fully combusted
  dominantFuel: "needle" | "broadleaf" | "shrub" | "grass" | "litter";
  rateOfSpread: "slow" | "moderate" | "fast" | "very_fast";
  description: string;
  pt: string;                 // Portuguese label for the UI
}

// Tuned for typical Portuguese forest inventory densities (IFN5 ranges).
export const BIOMASS_PROFILES: Record<SpeciesGroup, BiomassProfile> = {
  maritime_pine: {
    tonsPerHectare: 96,
    fuelModel: "TU5",
    emissionsPerHa: 144,
    dominantFuel: "needle",
    rateOfSpread: "fast",
    description: "Maritime pine — extensively planted in Portugal since the 19th c.",
    pt: "Pinheiro-bravo",
  },
  stone_pine: {
    tonsPerHectare: 78,
    fuelModel: "TU4",
    emissionsPerHa: 117,
    dominantFuel: "needle",
    rateOfSpread: "moderate",
    description: "Stone pine — common in interior-central Portugal.",
    pt: "Pinheiro-manso",
  },
  eucalyptus: {
    tonsPerHectare: 124,
    fuelModel: "TU5",
    emissionsPerHa: 186,
    dominantFuel: "broadleaf",
    rateOfSpread: "very_fast",
    description: "Eucalyptus globulus — fastest-burning common species.",
    pt: "Eucalipto",
  },
  cork_oak: {
    tonsPerHectare: 88,
    fuelModel: "TU2",
    emissionsPerHa: 132,
    dominantFuel: "broadleaf",
    rateOfSpread: "slow",
    description: "Cork oak montado — slow-burning, very resistant.",
    pt: "Sobreiro",
  },
  holm_oak: {
    tonsPerHectare: 82,
    fuelModel: "TU2",
    emissionsPerHa: 123,
    dominantFuel: "broadleaf",
    rateOfSpread: "slow",
    description: "Holm oak — sclerophyllous evergreen, dominant in interior south.",
    pt: "Azinheira",
  },
  chestnut: {
    tonsPerHectare: 140,
    fuelModel: "TU2",
    emissionsPerHa: 210,
    dominantFuel: "broadleaf",
    rateOfSpread: "moderate",
    description: "Sweet chestnut — high biomass, northwest and Beira regions.",
    pt: "Castanheiro",
  },
  pyrenean_oak: {
    tonsPerHectare: 86,
    fuelModel: "TU2",
    emissionsPerHa: 129,
    dominantFuel: "broadleaf",
    rateOfSpread: "slow",
    description: "Pyrenean oak — interior north, low-intensity surface fire.",
    pt: "Carvalho-negral",
  },
  mediterranean_shrub: {
    tonsPerHectare: 28,
    fuelModel: "TU1",
    emissionsPerHa: 42,
    dominantFuel: "shrub",
    rateOfSpread: "very_fast",
    description: "Mediterranean shrubland (gorse, heather, rosemary) — fast surface fire.",
    pt: "Matagal mediterrânico",
  },
  olive: {
    tonsPerHectare: 46,
    fuelModel: "TU3",
    emissionsPerHa: 69,
    dominantFuel: "broadleaf",
    rateOfSpread: "moderate",
    description: "Olive groves — common in Alentejo and Algarve.",
    pt: "Olival",
  },
  mixed_forest: {
    tonsPerHectare: 92,
    fuelModel: "TU5",
    emissionsPerHa: 138,
    dominantFuel: "broadleaf",
    rateOfSpread: "fast",
    description: "Mixed forest — broadleaf-pine mixture.",
    pt: "Mata mista",
  },
};

// Probability-weighted species composition across Portugal's grid cells.
// These should eventually come from a raster; for now they're for synthetic data.
export const SPECIES_DISTRIBUTION_PORTUGAL: Record<SpeciesGroup, number> = {
  maritime_pine: 0.30,
  eucalyptus: 0.18,
  cork_oak: 0.12,
  holm_oak: 0.10,
  mediterranean_shrub: 0.12,
  olive: 0.06,
  stone_pine: 0.06,
  mixed_forest: 0.04,
  chestnut: 0.02,
  pyrenean_oak: 0.00,
};
