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
 * A closed path round a convex shape with its corners softened, each corner by its own radius (one number for
 * all), each cut to half its shorter side, so a small petal is never made bigger or rounder than it is. A radius
 * of 0 leaves that corner square: a band in the middle of a petal keeps its straight edges.
 */
export function roundedPath(q: readonly Point[], r: number | readonly number[]): string {
  const n = q.length;
  let d = '';
  for (let j = 0; j < n; j++) {
    const c = q[j] as Point;
    const prev = q[(j - 1 + n) % n] as Point;
    const next = q[(j + 1) % n] as Point;
    const lp = Math.hypot(prev[0] - c[0], prev[1] - c[1]) || 1;
    const ln = Math.hypot(next[0] - c[0], next[1] - c[1]) || 1;
    const want = typeof r === 'number' ? r : (r[j] ?? 0);
    const rr = Math.max(0, Math.min(want, lp / 2, ln / 2));
    const a: Point = [c[0] + ((prev[0] - c[0]) * rr) / lp, c[1] + ((prev[1] - c[1]) * rr) / lp];
    const b: Point = [c[0] + ((next[0] - c[0]) * rr) / ln, c[1] + ((next[1] - c[1]) * rr) / ln];
    d += `${j ? 'L' : 'M'}${n3(a[0])} ${n3(a[1])}Q${n3(c[0])} ${n3(c[1])} ${n3(b[0])} ${n3(b[1])}`;
  }
  return `${d}Z`;
}

/**
 * The radii of a band's four corners (tip left, tip right, foot right, foot left) when only the petal's outside
 * is softened (Elco, 11 Nov: "radius and stroke only on the outside shape, so the colour separations and the
 * overall shape of the petal remain on straight lines"): the foot's corners on the first band, the tip's on the
 * last, none between.
 */
export const outsideRadii = (first: boolean, last: boolean, r: number): number[] => [
  last ? r : 0,
  last ? r : 0,
  first ? r : 0,
  first ? r : 0,
];

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** A point `rr` along from corner c towards p. */
const toward = (c: Point, p: Point, rr: number): Point => {
  const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
  return [c[0] + ((p[0] - c[0]) * rr) / l, c[1] + ((p[1] - c[1]) * rr) / l];
};

/**
 * The stretch of a petal's outside stroke that runs along one band, between heights a and b of a petal h tall:
 * its two sides, and round the foot on the first band and the tip on the last, so the stroke goes round the petal
 * once and never between its bands. `inner` is the whole petal moved in by half the stroke (insetBy), tip left,
 * tip right, foot right, foot left; `w` the stroke's width; `r` the corners' radius on that inner shape.
 */
export function outsidePiece(
  inner: readonly Point[],
  h: number,
  w: number,
  a: number,
  b: number,
  first: boolean,
  last: boolean,
  r: number,
): string {
  const [tl, tr, fr, fl] = inner as [Point, Point, Point, Point];
  const span = h - w || 1;
  const at = (y: number) => Math.max(0, Math.min(1, (y - w / 2) / span));
  const left = (y: number) => lerp(fl, tl, at(y));
  const right = (y: number) => lerp(fr, tr, at(y));
  const p = (x: Point) => `${n3(x[0])} ${n3(x[1])}`;
  const corner = (c: Point, from: Point, to: Point) => {
    const rr = Math.max(
      0,
      Math.min(
        r,
        Math.hypot(from[0] - c[0], from[1] - c[1]) / 2,
        Math.hypot(to[0] - c[0], to[1] - c[1]) / 2,
      ),
    );
    return `L${p(toward(c, from, rr))}Q${p(c)} ${p(toward(c, to, rr))}`;
  };
  if (first && last) return roundedPath(inner, r);
  if (first)
    return `M${p(left(b))}${corner(fl, left(b), fr)}${corner(fr, fl, right(b))}L${p(right(b))}`;
  if (last)
    return `M${p(left(a))}${corner(tl, left(a), tr)}${corner(tr, tl, right(a))}L${p(right(a))}`;
  return `M${p(left(a))}L${p(left(b))}M${p(right(a))}L${p(right(b))}`;
}
