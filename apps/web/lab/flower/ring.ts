// The polygon and its bars. layout() and band() aren't exported from @petal/core, so this is a copy
// of what's in packages/core/src/render/geometry.ts and svg.ts (band), with the same numbers: a test
// holds it to the golden SVGs. It differs in being written for 60 frames a second: arrays filled in
// place instead of objects, and no sub-sides. layout() splits a side wider than 0.9 pi, and the tail
// when it's wider than 0.45 rad; no flower on this bench gets near that, 4x open included.
import type { ReadingPetal } from '@petal/core/types';

const TAU = Math.PI * 2;
/** render/v1's default size, so the numbers can be compared with the golden SVGs. */
export const SIZE = 800;
const GAP = 1.1;

export interface Ring {
  n: number;
  /** Where each side starts, in radians clockwise from twelve, before `rotation`. n + 1 values. */
  start: Float64Array;
  rotation: number;
  /** Each side's ends, gap taken off. */
  ax: Float64Array;
  ay: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  /** Outward unit normal at the side's middle angle. */
  nx: Float64Array;
  ny: Float64Array;
  /** The chord before the gap. */
  len: Float64Array;
  /** The bar's height. */
  h: Float64Array;
  /** Where the whole ring has been slid to keep an account under the pointer. */
  ox: number;
  oy: number;
}

export function newRing(n: number): Ring {
  const f = () => new Float64Array(n);
  return {
    n,
    start: new Float64Array(n + 1),
    rotation: 0,
    ax: f(),
    ay: f(),
    bx: f(),
    by: f(),
    nx: f(),
    ny: f(),
    len: f(),
    h: f(),
    ox: 0,
    oy: 0,
  };
}

export interface Shape {
  cx: number;
  cy: number;
  R: number;
  r0: number;
  L: number;
}

/** As in layout(): R leaves 15% for labels, the polygon is 32% of R, bars fill the rest. */
export const SHAPE: Shape = (() => {
  const R = SIZE / 2 - SIZE * 0.15;
  const r0 = R * 0.32;
  return { cx: SIZE / 2, cy: SIZE / 2, R, r0, L: R - r0 };
})();

/** Lays the ring out from widths (any scale, they share the circle) and heights (world units). */
export function lay(ring: Ring, widths: Float64Array, heights: Float64Array, rotation: number) {
  const { cx, cy, r0 } = SHAPE;
  const { n, start, ax, ay, bx, by, nx, ny, len, h } = ring;
  let total = 0;
  for (let i = 0; i < n; i++) total += widths[i] as number;
  const scale = TAU / (total || 1);
  ring.rotation = rotation;
  let a = 0;
  let sin0 = Math.sin(rotation);
  let cos0 = Math.cos(rotation);
  for (let i = 0; i < n; i++) {
    start[i] = a;
    const w = (widths[i] as number) * scale;
    const a1 = a + w;
    const sin1 = Math.sin(a1 + rotation);
    const cos1 = Math.cos(a1 + rotation);
    const mid = a + w / 2 + rotation;
    const x0 = cx + r0 * sin0;
    const y0 = cy - r0 * cos0;
    const x1 = cx + r0 * sin1;
    const y1 = cy - r0 * cos1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.sqrt(dx * dx + dy * dy);
    // a gap between petals, capped at 22% of the side
    const g = Math.min(GAP, l * 0.22) / 2 / (l || 1);
    ax[i] = x0 + dx * g;
    ay[i] = y0 + dy * g;
    bx[i] = x1 - dx * g;
    by[i] = y1 - dy * g;
    nx[i] = Math.sin(mid);
    ny[i] = -Math.cos(mid);
    len[i] = l;
    h[i] = heights[i] as number;
    a = a1;
    sin0 = sin1;
    cos0 = cos1;
  }
  start[n] = a;
}

/** Numbers for a path: three decimals, because the world is seen at up to 48x. */
export const n3 = (x: number): string => `${Math.round(x * 1000) / 1000}`;

/** The outline of a bar between heights hA and hB above its side: one parallelogram, as band(). */
export function bandPath(ring: Ring, i: number, hA: number, hB: number): string {
  const ax = ring.ax[i] as number;
  const ay = ring.ay[i] as number;
  const bx = ring.bx[i] as number;
  const by = ring.by[i] as number;
  const nx = ring.nx[i] as number;
  const ny = ring.ny[i] as number;
  return `M${n3(ax + nx * hB)} ${n3(ay + ny * hB)}L${n3(bx + nx * hB)} ${n3(by + ny * hB)}L${n3(bx + nx * hA)} ${n3(by + ny * hA)}L${n3(ax + nx * hA)} ${n3(ay + ny * hA)}Z`;
}

/** The polygon, closed: both ends of each side, so at any zoom its line runs along the bars' feet. */
export function polygonPath(ring: Ring): string {
  let d = '';
  for (let i = 0; i < ring.n; i++) {
    d += `${i ? 'L' : 'M'}${n3(ring.ax[i] as number)} ${n3(ring.ay[i] as number)}`;
    d += `L${n3(ring.bx[i] as number)} ${n3(ring.by[i] as number)}`;
  }
  return `${d}Z`;
}

/** All the bars as one path: the silhouette. */
export function silhouettePath(ring: Ring): string {
  let d = '';
  for (let i = 0; i < ring.n; i++) d += bandPath(ring, i, 0, ring.h[i] as number);
  return d;
}

/** What a petal needs from the reading to be a shape. */
export type PetalShape = Pick<ReadingPetal, 'width' | 'height'>;

export interface Rest {
  /** The ring with nothing swollen. Never written to after this. */
  ring: Ring;
  width: Float64Array;
  height: Float64Array;
  /** Middle of each side, in radians, at rest. */
  mid: Float64Array;
}

export function restOf(petals: PetalShape[]): Rest {
  const n = petals.length;
  const width = Float64Array.from(petals, (p) => p.width);
  const height = Float64Array.from(petals, (p) => p.height * SHAPE.L);
  const ring = newRing(n);
  lay(ring, width, height, 0);
  const mid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = ((ring.start[i] as number) + (ring.start[i + 1] as number)) / 2;
  }
  return { ring, width, height, mid };
}
