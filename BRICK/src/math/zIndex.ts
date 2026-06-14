import { finite } from "./spacing.js";

export const DEFAULT_Z_SCALE = [0, 10, 20, 30, 40, 50, 100, 200, 500, 1000];

export function zIndexSlop(
  value: number | number[],
  allowedScale: number[] = DEFAULT_Z_SCALE
): number {
  const values = Array.isArray(value) ? value : [value];
  let maxSlop = 0;
  for (const v of values) {
    const single = singleZIndexSlop(v, allowedScale);
    if (single > maxSlop) maxSlop = single;
  }
  return maxSlop;
}

function singleZIndexSlop(value: number, allowedScale: number[]): number {
  const v = finite(value, NaN);
  if (allowedScale.length === 0 || v !== v) return 0;
  if (allowedScale.includes(v)) return 0;
  const nearest = allowedScale.reduce((best, z) =>
    Math.abs(z - v) < Math.abs(best - v) ? z : best
  );
  const max = Math.max(...allowedScale.map(Math.abs));
  return max === 0 ? 0 : Math.min(Math.abs(v - nearest) / max, 1);
}
