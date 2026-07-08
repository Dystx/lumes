// Synthetic biomass grid for Portugal.
//
// Generates a JSON file compatible with /api/biomass lookups without
// needing the ICNF IFN5 raster. The grid uses a 0.05° spacing (~ 5 km) which
// yields ~ 1,500 cells — a tiny payload (~ 90 KB minified).
//
// Real data: replace this with parsing ICNF IFN5 and running the build script.

import {
  BIOMASS_PROFILES,
  SPECIES_DISTRIBUTION_PORTUGAL,
  type BiomassProfile,
  type SpeciesGroup,
} from "./equations";

interface GridCell {
  id: string;
  lat: number;
  lon: number;
  dominantSpecies: SpeciesGroup;
  tonsPerHectare: number;
  profile: BiomassProfile;
}

const LAT_MIN = 36.95;
const LAT_MAX = 42.15;
const LON_MIN = -9.50;
const LON_MAX = -6.20;
const STEP = 0.05;

function pickSpecies(lat: number, lon: number): SpeciesGroup {
  // Synthetic geographic bias: north → maritime pine & chestnut; south → shrub & olive.
  const nordicness = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
  const occidentalness = (lon - LON_MIN) / (LON_MAX - LON_MIN);

  if (nordicness > 0.65 && occidentalness < 0.4) return "chestnut";
  if (nordicness > 0.55) return "maritime_pine";
  if (nordicness > 0.4 && occidentalness < 0.5) return "maritime_pine";
  if (nordicness < 0.25) {
    return occiduality(lon) > 0.6 ? "cork_oak" : "mediterranean_shrub";
  }
  if (nordicness < 0.4 && occidentalness > 0.7) return "olive";
  if (occiduality(lon) < 0.4) return "holm_oak";

  // Default roll through the population distribution.
  const r = Math.random();
  let acc = 0;
  for (const [sp, p] of Object.entries(SPECIES_DISTRIBUTION_PORTUGAL)) {
    acc += p;
    if (r <= acc) return sp as SpeciesGroup;
  }
  return "maritime_pine";
}
function occiduality(_lon: number): number {
  return 0.5;
}

let cachedGrid: GridCell[] | null = null;

export function getSyntheticBiomassGrid(): GridCell[] {
  if (cachedGrid) return cachedGrid;

  const cells: GridCell[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
    for (let lon = LON_MIN; lon <= LON_MAX; lon += STEP) {
      const species = pickSpecies(lat, lon);
      const profile = BIOMASS_PROFILES[species];
      cells.push({
        id: `${lat.toFixed(4)}_${lon.toFixed(4)}`,
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100,
        dominantSpecies: species,
        tonsPerHectare: profile.tonsPerHectare,
        profile,
      });
    }
  }
  cachedGrid = cells;
  return cells;
}

const lat2km = 111;
const lon2km = (lat: number) => 111 * Math.cos((lat * Math.PI) / 180);

export function lookupCell(
  cells: GridCell[],
  lat: number,
  lon: number,
): GridCell | null {
  let best: GridCell | null = null;
  let bestDistSq = Infinity;
  for (const c of cells) {
    const dLatKm = (c.lat - lat) * lat2km;
    const dLonKm = (c.lon - lon) * lon2km(c.lat);
    const distSq = dLatKm * dLatKm + dLonKm * dLonKm;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = c;
    }
  }
  return best;
}

export function gridInBbox(
  cells: GridCell[],
  bbox: [number, number, number, number],
): GridCell[] {
  const [w, s, e, n] = bbox;
  return cells.filter((c) => c.lon >= w && c.lon <= e && c.lat >= s && c.lat <= n);
}
