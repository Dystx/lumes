export interface GeoJSONSourceLike {
  type?: string;
  setData?: (data: GeoJSON.GeoJSON) => void;
}

export interface GeoJSONSourceMapLike {
  getSource: (sourceId: string) => GeoJSONSourceLike | undefined;
}

/**
 * Updates a MapLibre GeoJSON source without assuming that the source still
 * exists after a style transition. A missing, replaced, or partially restored
 * source is a recoverable map state; callers can skip the update and let the
 * normal style-restoration path replay the latest data.
 */
export function setGeoJSONSourceData(
  map: GeoJSONSourceMapLike,
  sourceId: string,
  data: GeoJSON.GeoJSON,
): boolean {
  const source = map.getSource(sourceId);
  if (source?.type !== "geojson" || typeof source.setData !== "function") return false;
  source.setData(data);
  return true;
}
