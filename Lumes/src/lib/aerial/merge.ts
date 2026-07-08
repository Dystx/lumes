// Multi-source ADS-B merge for the lumes.pt aerial layer.
//
// Sources (all free, all key-less for basic use):
//   - airplanes.live  : https://api.airplanes.live/v2/point/{lat}/{lon}/{dist}
//   - opendata.adsb.fi : https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}
//   - OpenSky Network  : https://opensky-network.org/api/states/all?bbox=...
//
// airplanes.live and adsb.fi share a near-identical schema (Dump1090-style
// JSON). OpenSky uses a different tuple-based schema (see faa_osky_states).
// We normalize all of them to a common AircraftState, dedupe by icao24, and
// return GeoJSON.
//
// For point-query feeds (airplanes.live, adsb.fi), large bboxes translate
// to large search radii — which many ADS-B aggregators reject or time out.
// We instead split a wide bbox into a sub-grid of ≤ 280 km circles and
// merge the results; OpenSky (which uses bbox) keeps single-query behavior.

export interface AircraftState {
  icao24: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  originCountry: string | null;
  latitude: number;
  longitude: number;
  altitudeBarometricFt: number | null;
  altitudeGeometricFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  headingDeg: number | null;
  onGround: boolean;
  squawk: string | null;
  distanceKm: number | null;
  bearingDeg: number | null;
  source: "airplanes.live" | "adsb.fi" | "opensky";
  fetchedAt: string;
}

export interface MergeResult {
  type: "FeatureCollection";
  fetchedAt: string;
  bbox: number[];
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number, number | null] };
    properties: Omit<AircraftState, "latitude" | "longitude">;
  }>;
  meta: {
    airplanes_live: number;
    adsb_fi: number;
    opensky: number;
    merged: number;
    sources_live: number;
    sub_queries: number;
  };
  errors: string[];
}

const PORTUGAL_BBOX: [number, number, number, number] = [-9.5, 36.95, -6.0, 42.15];
const MAX_RADIUS_KM = 280; // ~250 km, rounded up
const fetcherTimeoutMs = 8_000;
const metaFreshAt = () => new Date().toISOString();

function normalizeAirplanes(rawList: unknown[], source: "airplanes.live" | "adsb.fi"): AircraftState[] {
  const out: AircraftState[] = [];
  const now = metaFreshAt();
  for (const r of rawList) {
    if (!r || typeof r !== "object") continue;
    const a = r as Record<string, unknown>;
    const lat = typeof a.lat === "number" ? a.lat : null;
    const lon = typeof a.lon === "number" ? a.lon : null;
    if (lat === null || lon === null) continue;
    const altBar = typeof a.alt_baro === "number" ? a.alt_baro : null;
    const altGeo = typeof a.alt_geom === "number" ? a.alt_geom : null;
    const gs = typeof a.gs === "number" ? a.gs : null;
    const v = typeof a.baro_rate === "number" ? a.baro_rate : null;
    const h = typeof a.track === "number" ? a.track : null;
    out.push({
      icao24: String(a.hex ?? "").toLowerCase(),
      callsign: typeof a.flight === "string" ? a.flight.trim() || null : null,
      registration: typeof a.r === "string" ? a.r : null,
      aircraftType: typeof a.t === "string" ? a.t : null,
      originCountry: null,
      latitude: lat,
      longitude: lon,
      altitudeBarometricFt: altBar,
      altitudeGeometricFt: altGeo,
      groundSpeedKt: gs,
      verticalRateFpm: v,
      headingDeg: h,
      onGround: Boolean(a.alt_baro === "ground" || a.alt_baro === 0),
      squawk: typeof a.squawk === "string" ? a.squawk : null,
      distanceKm: typeof a.dst === "number" ? a.dst : null,
      bearingDeg: typeof a.dir === "number" ? a.dir : null,
      source,
      fetchedAt: now,
    });
  }
  return out;
}

function normalizeOpenSky(stateTuples: unknown[][]): AircraftState[] {
  const out: AircraftState[] = [];
  const now = metaFreshAt();
  for (const s of stateTuples) {
    if (!Array.isArray(s) || s.length < 17) continue;
    const [
      icao24, callsign, originCountry, , ,
      lon, lat, baroAlt, onGround, ,
      heading, , , squawk, , ,
    ] = s;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    out.push({
      icao24: String(icao24 ?? "").toLowerCase(),
      callsign: typeof callsign === "string" ? callsign.trim() || null : null,
      registration: null,
      aircraftType: null,
      originCountry: typeof originCountry === "string" ? originCountry : null,
      latitude: lat,
      longitude: lon,
      altitudeBarometricFt: typeof baroAlt === "number" ? baroAlt : null,
      altitudeGeometricFt: null,
      groundSpeedKt: null,
      verticalRateFpm: null,
      headingDeg: typeof heading === "number" ? heading : null,
      onGround: Boolean(onGround),
      squawk: typeof squawk === "string" ? squawk : null,
      distanceKm: null,
      bearingDeg: null,
      source: "opensky",
      fetchedAt: now,
    });
  }
  return out;
}

/**
 * Split a bbox into sub-rectangles of ≤ MAX_RADIUS_KM (~280 km), exposing
 * the center+radius for point-query ADS-B feeds. OpenSky uses bbox directly.
 */
function bboxSubQueries(
  bbox: [number, number, number, number],
): Array<{ center: [number, number]; radiusKm: number }> {
  const [w, s, e, n] = bbox;
  const spanLat = n - s;
  const spanLon = e - w;

  // Step size in degrees ≈ MAX_RADIUS_KM / 111 km/deg
  const stepDeg = MAX_RADIUS_KM / 111;

  // If bbox is small enough, a single query suffices.
  if (spanLat <= stepDeg && spanLon <= stepDeg) {
    return [{
      center: [(w + e) / 2, (s + n) / 2],
      radiusKm: Math.ceil(Math.hypot(spanLon / 2, spanLat / 2) * 111),
    }];
  }

  // Build a sub-grid by stepping through the bbox.
  const out: Array<{ center: [number, number]; radiusKm: number }> = [];
  for (let lat = s; lat < n; lat += stepDeg) {
    for (let lon = w; lon < e; lon += stepDeg) {
      const subLatMax = Math.min(lat + stepDeg, n);
      const subLonMax = Math.min(lon + stepDeg, e);
      const cx = (lon + subLonMax) / 2;
      const cy = (lat + subLatMax) / 2;
      const rKm = Math.ceil(
        Math.hypot((subLonMax - lon) / 2, (subLatMax - lat) / 2) * 111
      );
      out.push({ center: [cx, cy], radiusKm: rKm });
    }
  }
  return out;
}

async function fetchAirplanesPoint(lat: number, lon: number, radiusKm: number) {
  const url = `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusKm}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(fetcherTimeoutMs) });
  if (!r.ok) throw new Error(`airplanes.live HTTP ${r.status}`);
  const j = (await r.json()) as { ac?: unknown[] };
  return normalizeAirplanes(j.ac ?? [], "airplanes.live");
}

async function fetchAdsbFiPoint(lat: number, lon: number, radiusKm: number) {
  const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radiusKm}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(fetcherTimeoutMs) });
  if (!r.ok) throw new Error(`adsb.fi HTTP ${r.status}`);
  const j = (await r.json()) as { aircraft?: unknown[] };
  return normalizeAirplanes(j.aircraft ?? [], "adsb.fi");
}

async function fetchOpenSkyBbox(bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  const url = `https://opensky-network.org/api/states/all?lamin=${s}&lomin=${w}&lamax=${n}&lomax=${e}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(fetcherTimeoutMs) });
  if (!r.ok) throw new Error(`opensky HTTP ${r.status}`);
  const j = (await r.json()) as { states?: unknown[][] };
  return normalizeOpenSky(j.states ?? []);
}

export async function mergeAircraft(
  bbox: [number, number, number, number] = PORTUGAL_BBOX,
  opts: { maxAltitudeFt?: number | null; minAltitudeFt?: number | null } = {},
): Promise<MergeResult> {
  const errors: string[] = [];
  const subs = bboxSubQueries(bbox);

  // Serial execution for point-query feeds: each ADS-B aggregator has
  // aggressive per-IP rate limits (often 429 after a fanout burst).
  // A 100ms gap keeps us comfortably under the public quota while
  // adding only ~600ms to the merge for a typical 6-cell bbox split.
  const airplanesLists: AircraftState[][] = [];
  const adsbfiLists: AircraftState[][] = [];
  for (const { center, radiusKm } of subs) {
    const [lat, lon] = center;
    try {
      airplanesLists.push(await fetchAirplanesPoint(lat, lon, radiusKm));
    } catch (e) {
      errors.push(`airplanes.live: ${String(e)}`);
      airplanesLists.push([]);
    }
    try {
      adsbfiLists.push(await fetchAdsbFiPoint(lat, lon, radiusKm));
    } catch (e) {
      errors.push(`adsb.fi: ${String(e)}`);
      adsbfiLists.push([]);
    }
    if (subs.length > 1) await new Promise((r) => setTimeout(r, 100));
  }

  const opensky = await fetchOpenSkyBbox(bbox).catch((e) => {
    errors.push(`opensky: ${String(e)}`);
    return [];
  });
  const airplanes = airplanesLists.flat();
  const adsbfi = adsbfiLists.flat();

  const merged = new Map<string, AircraftState>();
  const addAircraft = (aircraft: AircraftState) => {
    if (!aircraft.icao24) return;
    if (
      opts.maxAltitudeFt != null &&
      aircraft.altitudeBarometricFt != null &&
      aircraft.altitudeBarometricFt > opts.maxAltitudeFt
    ) return;
    if (
      opts.minAltitudeFt != null &&
      aircraft.altitudeBarometricFt != null &&
      aircraft.altitudeBarometricFt < opts.minAltitudeFt
    ) return;
    if (!merged.has(aircraft.icao24)) {
      merged.set(aircraft.icao24, aircraft);
    }
  };
  // Priority order: airplanes.live > adsb.fi > opensky
  for (const list of [airplanes, adsbfi, opensky]) {
    for (const a of list) addAircraft(a);
  }

  return {
    type: "FeatureCollection",
    fetchedAt: new Date().toISOString(),
    bbox,
    features: Array.from(merged.values()).map((a) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [a.longitude, a.latitude, a.altitudeBarometricFt],
      },
      properties: {
        icao24: a.icao24,
        callsign: a.callsign,
        registration: a.registration,
        aircraftType: a.aircraftType,
        originCountry: a.originCountry,
        altitudeBarometricFt: a.altitudeBarometricFt,
        altitudeGeometricFt: a.altitudeGeometricFt,
        groundSpeedKt: a.groundSpeedKt,
        verticalRateFpm: a.verticalRateFpm,
        headingDeg: a.headingDeg,
        onGround: a.onGround,
        squawk: a.squawk,
        distanceKm: a.distanceKm,
        bearingDeg: a.bearingDeg,
        source: a.source,
        fetchedAt: a.fetchedAt,
      },
    })),
    meta: {
      airplanes_live: airplanes.length,
      adsb_fi: adsbfi.length,
      opensky: opensky.length,
      merged: merged.size,
      sources_live: [
        ...(airplanes.length ? (["airplanes.live"] as const) : []),
        ...(adsbfi.length ? (["adsb.fi"] as const) : []),
        ...(opensky.length ? (["opensky"] as const) : []),
      ].length,
      sub_queries: subs.length,
    },
    errors,
  };
}
