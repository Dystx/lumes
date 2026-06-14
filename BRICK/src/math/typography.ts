import { finite } from "./spacing.js";

export function typographyScaleSlop(sizes: number[], targetRatio: number): number {
  const valid = sizes.filter((s) => Number.isFinite(s) && s > 0);
  if (valid.length < 2 || targetRatio <= 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const ratios = sorted.slice(1).map((s, i) => s / sorted[i]);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (mean === 0) return 0;
  const variance = ratios.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratios.length;
  const cv = Math.sqrt(variance) / mean;
  const targetError = Math.abs(mean - targetRatio) / targetRatio;
  return Math.min((cv + targetError) / 0.35, 1);
}

export interface HeadingEntry {
  level: number;
  fontSize: number;
}

export function headingHierarchySlop(headings: HeadingEntry[]): number {
  if (headings.length < 2) return 0;
  const pairs = headings.map((h) => ({ level: h.level, size: finite(h.fontSize, 0) }));
  let inversions = 0;
  let total = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i].level === pairs[j].level) continue;
      total++;
      const levelOrder = pairs[i].level < pairs[j].level;
      const sizeOrder = pairs[i].size > pairs[j].size;
      if (levelOrder !== sizeOrder && pairs[i].size !== pairs[j].size) {
        inversions++;
      }
    }
  }
  return total === 0 ? 0 : inversions / total;
}
