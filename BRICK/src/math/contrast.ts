import { finite, positive } from "./spacing.js";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function channelToLinear(c: number): number {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminanceFromRgb(r: number, g: number, b: number): number {
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return relativeLuminanceFromRgb(rgb[0], rgb[1], rgb[2]);
}

export function parseColor(input: string): RgbColor | undefined {
  const s = input.trim();

  if (s.startsWith("#")) {
    const rgb = hexToRgb(s);
    return rgb ? { r: rgb[0], g: rgb[1], b: rgb[2] } : undefined;
  }

  const rgbMatch = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i.exec(s);
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]),
      g: parseFloat(rgbMatch[2]),
      b: parseFloat(rgbMatch[3]),
    };
  }

  const hslMatch = /^hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/i.exec(s);
  if (hslMatch) {
    return hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]) / 100, parseFloat(hslMatch[3]) / 100);
  }

  const oklchMatch = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i.exec(s);
  if (oklchMatch) {
    const lRaw = oklchMatch[1];
    const l = lRaw.endsWith("%") ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
    const c = parseFloat(oklchMatch[2]);
    const h = parseFloat(oklchMatch[3]);
    return oklchToRgb(l, c, h);
  }

  return undefined;
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const l1 = relativeLuminanceFromRgb(ca.r, ca.g, ca.b);
  const l2 = relativeLuminanceFromRgb(cb.r, cb.g, cb.b);
  const L1 = l1 + 0.05;
  const L2 = l2 + 0.05;
  return Math.max(L1, L2) / Math.min(L1, L2);
}

export function contrastSlop(ratio: number, target: number = 4.5): number {
  const r = finite(ratio, 0);
  const t = positive(target, 4.5);
  if (r >= t) return 0;
  return Math.min((t - r) / t, 1);
}

function hexToRgb(hex: string): [number, number, number] | undefined {
  const s = hex.trim();
  const m = /^#?([0-9a-f]{3,8})$/i.exec(s);
  if (!m) return undefined;
  let digits = m[1];
  if (digits.length === 3 || digits.length === 4) {
    digits = digits.split("").map((d) => d + d).join("");
  }
  if (digits.length !== 6 && digits.length !== 8) return undefined;
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  if ([r, g, b].some((c) => Number.isNaN(c))) return undefined;
  return [r, g, b];
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
  };
}

function oklchToRgb(l: number, c: number, h: number): RgbColor | undefined {
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return undefined;

  // OKLCH -> OKLab
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab -> XYZ (D65)
  const lms_ = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ];
  const lms = lms_.map((v) => Math.pow(v, 3));
  const xyz = [
    0.8189330101 * lms[0] + 0.3618667424 * lms[1] - 0.1288597137 * lms[2],
    0.0329845436 * lms[0] + 0.9293118715 * lms[1] + 0.0361456387 * lms[2],
    0.0482003018 * lms[0] + 0.2643662691 * lms[1] + 0.633851707 * lms[2],
  ];

  // XYZ -> linear sRGB
  const linear = [
    3.2406 * xyz[0] - 1.5372 * xyz[1] - 0.4986 * xyz[2],
    -0.9689 * xyz[0] + 1.8758 * xyz[1] + 0.0415 * xyz[2],
    0.0557 * xyz[0] - 0.204 * xyz[1] + 1.057 * xyz[2],
  ];

  // sRGB gamma
  const [r, g, bOut] = linear.map((v) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  );

  return {
    r: Math.max(0, Math.min(1, r)) * 255,
    g: Math.max(0, Math.min(1, g)) * 255,
    b: Math.max(0, Math.min(1, bOut)) * 255,
  };
}
