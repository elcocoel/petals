// The highlight (design/flower-art-direction/default-system-vnext.md and highlight-style-v1.json; Elco accepted
// it on 11 Nov): one treatment, on or off, for the petals of a chosen group of wallets. A fine solid stroke inside
// the petal, a little darker than its fill; softened corners; a gently inflated surface, light from the upper left
// and shade from the lower right, both in the petal's own colour. Height, segments and colour stay as they are,
// and the line between petals stays open. For /lab first (#76). Pure.
import { leftAt, type Ring, rightAt } from './ring.ts';

/**
 * Figma's numbers, in px of the 800 px reference flower (node 201:2812). That flower is the world drawn at 1.1
 * (design/flower-art-direction/make-dimension-studies.mjs), so a world unit is REFERENCE px there.
 */
export const HIGHLIGHT = {
  /** 1 px, inside, solid, the fill × 0.62 */
  stroke: { width: 1, tone: 0.62 },
  /** 2 px, fill and stroke together */
  radius: 2,
  /** an inner shadow: the fill × min(1.15, 1 / its brightest channel), from the upper left */
  light: { lift: 1.15, opacity: 0.65, dx: 1.5, dy: 1.5, blur: 5 },
  /** an inner shadow: the fill × 0.78, from the lower right */
  shade: { tone: 0.78, opacity: 0.32, dx: -1.5, dy: -1.5, blur: 5 },
} as const;

/** px of the reference flower per world unit. */
export const REFERENCE = 1.1;

export interface Tones {
  fill: string;
  stroke: string;
  light: string;
  shade: string;
}

const channels = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const hexOf = (rgb: readonly number[]): string =>
  `#${rgb
    .map((c) =>
      Math.round(Math.max(0, Math.min(1, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/** The highlight's tones for a fill: one multiplier across the channels, so hue and saturation stay. */
export function tonesOf(fill: string): Tones {
  const rgb = channels(fill);
  const lift = Math.min(HIGHLIGHT.light.lift, 1 / Math.max(...rgb, 1e-6));
  return {
    fill: fill.toUpperCase(),
    stroke: hexOf(rgb.map((c) => c * HIGHLIGHT.stroke.tone)),
    light: hexOf(rgb.map((c) => c * lift)),
    shade: hexOf(rgb.map((c) => c * HIGHLIGHT.shade.tone)),
  };
}

export type Point = [number, number];

/** A stretch of a wedge between heights hA and hB, as its four corners: tip left, tip right, foot right, foot left. */
export const bandCorners = (ring: Ring, i: number, hA: number, hB: number): Point[] => [
  leftAt(ring, i, hB),
  rightAt(ring, i, hB),
  rightAt(ring, i, hA),
  leftAt(ring, i, hA),
];

const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const area = (q: readonly Point[]): number => {
  let s = 0;
  for (let j = 0; j < q.length; j++) {
    const a = q[j] as Point;
    const b = q[(j + 1) % q.length] as Point;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

/**
 * The same convex shape with every side moved in by d, or null when it's too thin to hold that: a stroke of
 * width 2d along it lies wholly inside the shape.
 */
export function insetBy(q: readonly Point[], d: number): Point[] | null {
  const n = q.length;
  const turn = Math.sign(area(q));
  if (turn === 0) return null;
  // each side as a point and a direction, moved in along its normal
  const sides = q.map((a, j) => {
    const b = q[(j + 1) % n] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    // inward is to the left of a side for a shape wound with positive area
    const nx = (-dy / l) * turn;
    const ny = (dx / l) * turn;
    return { px: a[0] + nx * d, py: a[1] + ny * d, dx, dy };
  });
  const out: Point[] = [];
  for (let j = 0; j < n; j++) {
    const s = sides[(j - 1 + n) % n] as (typeof sides)[0];
    const t = sides[j] as (typeof sides)[0];
    const den = s.dx * t.dy - s.dy * t.dx;
    if (Math.abs(den) < 1e-12) return null;
    const u = ((t.px - s.px) * t.dy - (t.py - s.py) * t.dx) / den;
    out.push([s.px + s.dx * u, s.py + s.dy * u]);
  }
  // moved in too far, it turns inside out
  if (Math.sign(area(out)) !== turn || Math.abs(area(out)) < 1e-9) return null;
  for (let j = 0; j < n; j++) {
    if (
      Math.sign(cross(out[j] as Point, out[(j + 1) % n] as Point, out[(j + 2) % n] as Point)) ===
      -turn
    )
      return null;
  }
  return out;
}

const n3 = (x: number): string => `${Math.round(x * 1000) / 1000}`;

/**
 * A closed path round a convex shape with its corners softened to radius r, each corner's radius cut to half
 * its shorter side, so a small petal is never made bigger or rounder than it is.
 */
export function roundedPath(q: readonly Point[], r: number): string {
  const n = q.length;
  let d = '';
  for (let j = 0; j < n; j++) {
    const c = q[j] as Point;
    const prev = q[(j - 1 + n) % n] as Point;
    const next = q[(j + 1) % n] as Point;
    const lp = Math.hypot(prev[0] - c[0], prev[1] - c[1]) || 1;
    const ln = Math.hypot(next[0] - c[0], next[1] - c[1]) || 1;
    const rr = Math.max(0, Math.min(r, lp / 2, ln / 2));
    const a: Point = [c[0] + ((prev[0] - c[0]) * rr) / lp, c[1] + ((prev[1] - c[1]) * rr) / lp];
    const b: Point = [c[0] + ((next[0] - c[0]) * rr) / ln, c[1] + ((next[1] - c[1]) * rr) / ln];
    d += `${j ? 'L' : 'M'}${n3(a[0])} ${n3(a[1])}Q${n3(c[0])} ${n3(c[1])} ${n3(b[0])} ${n3(b[1])}`;
  }
  return `${d}Z`;
}
