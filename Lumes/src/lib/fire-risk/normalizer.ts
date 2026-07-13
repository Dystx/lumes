import type { FireRiskRecord } from "@/lib/types";

const MIN_LATITUDE = 36.95;
const MAX_LATITUDE = 42.15;
const MIN_LONGITUDE = -9.5;
const MAX_LONGITUDE = -6;
const MIN_RCM = 0;
const MAX_RCM = 5;

export interface NormalizedFireRiskPayload {
  dataPrev: string;
  dataRun: string;
  count: number;
  distribution: Record<number, number>;
  records: FireRiskRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isPortugalCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= MIN_LATITUDE
    && latitude <= MAX_LATITUDE
    && longitude >= MIN_LONGITUDE
    && longitude <= MAX_LONGITUDE;
}

function validRcm(value: unknown): number | null {
  const rcm = finiteNumber(value);
  if (rcm === null || !Number.isInteger(rcm) || rcm < MIN_RCM || rcm > MAX_RCM) return null;
  return rcm;
}

export function normalizeFireRiskPayload(raw: unknown): NormalizedFireRiskPayload {
  const payload = isRecord(raw) ? raw : {};
  const localMap = isRecord(payload.local) ? payload.local : {};
  const dataPrev = text(payload.dataPrev);
  const records: FireRiskRecord[] = [];

  for (const [dico, value] of Object.entries(localMap)) {
    if (!dico.trim()) continue;
    const record = isRecord(value) ? value : {};
    const data = isRecord(record.data) ? record.data : {};
    const latitude = finiteNumber(record.latitude);
    const longitude = finiteNumber(record.longitude);
    const rcm = validRcm(data.rcm);
    if (latitude === null || longitude === null || rcm === null || !isPortugalCoordinate(latitude, longitude)) {
      continue;
    }

    records.push({ dico, latitude, longitude, rcm, dataPrev });
  }

  const distribution: Record<number, number> = {};
  for (const record of records) {
    distribution[record.rcm] = (distribution[record.rcm] ?? 0) + 1;
  }

  return {
    dataPrev,
    dataRun: text(payload.dataRun),
    count: records.length,
    distribution,
    records,
  };
}
