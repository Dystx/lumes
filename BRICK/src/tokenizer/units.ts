import type { TokenValue } from "../types.js";

const REM_BASE = 16;

/**
 * Convert a CSS dimension string into a normalized TokenValue.
 * Rem values are converted to px using a 16px base; px strings become numbers.
 */
export function parseNumericValue(raw: string): TokenValue | undefined {
  const s = raw.trim();
  if (s === "0" || s === "0px") {
    return { value: 0, unit: "px", raw: s };
  }

  const remMatch = s.match(/^([\d.]+)rem$/i);
  if (remMatch) {
    const value = parseFloat(remMatch[1]) * REM_BASE;
    if (Number.isFinite(value)) {
      return { value, unit: "px", raw: s };
    }
  }

  const pxMatch = s.match(/^([\d.]+)px$/);
  if (pxMatch) {
    const value = parseFloat(pxMatch[1]);
    if (Number.isFinite(value)) {
      return { value, unit: "px", raw: s };
    }
  }

  const emMatch = s.match(/^([\d.]+)em$/i);
  if (emMatch) {
    const value = parseFloat(emMatch[1]);
    if (Number.isFinite(value)) {
      return { value, unit: "em", raw: s };
    }
  }

  // Bare number: treat as rem-ish multiple of the base grid when it looks like a scale key.
  const bareMatch = s.match(/^([\d.]+)$/);
  if (bareMatch) {
    const value = parseFloat(bareMatch[1]);
    if (Number.isFinite(value)) {
      return { value, unit: "rem", raw: s };
    }
  }

  return undefined;
}
