export function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function positive(n: number, fallback = 0): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function spacingGridSlop(valuePx: number, baseGrid: number): number {
  const base = positive(baseGrid, 0);
  const value = finite(valuePx, 0);
  if (base === 0) return 0;
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  const remainder = abs % base;
  const deviation = Math.min(remainder, base - remainder);
  return Math.min(deviation / (base / 2), 1);
}

export function spacingEntropySlop(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of clean) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = clean.length;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const max = Math.log2(counts.size || 1);
  return max === 0 ? 0 : entropy / max;
}
