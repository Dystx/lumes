import type { ColorToken } from "../types.js";

export interface ParsedColor {
  raw: string;
  hex?: string;
  oklch?: string;
}

/**
 * Normalize a color string into a ColorToken shape.
 * For MVP we preserve the raw value and store an oklch/raw field when the input
 * is already OKLCH/LCH. Optional conversion to OKLCH coordinates can be added later.
 */
export function parseColor(input: string, name: string): ColorToken {
  const raw = input.trim();

  // OKLCH / LCH are already perceptually uniform; keep them as-is in the oklch field.
  if (/^(oklch|lch)\s*\(/i.test(raw)) {
    return { name, raw, oklch: raw };
  }

  // For hex/rgb/hsl we keep the raw value and, when easy, derive hex for contrast math.
  // We only populate oklch when a real conversion is available.
  const hex = deriveHex(raw);
  return { name, raw, hex };
}

function deriveHex(raw: string): string | undefined {
  const s = raw.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s.toLowerCase();
  return undefined;
}
