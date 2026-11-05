// The flower's geometry, ported from draw() in research/spikes/flower/index.html (renderer.md):
// a polygon with one side per petal, bars standing straight out along each side's normal, cut
// into stacked parallelograms. Straight edges only: no curves, no rounded petals (constitution I).
// Pure numbers here; ./svg.ts writes them out.
import type { PetalRow } from '../types/index.ts';

export type Pt = [number, number];

export interface Side {
  p0: Pt;
  p1: Pt;
  /** outward unit normal at the side's middle angle */
  n: Pt;
  len: number;
}

export interface PetalGeo {
  row: PetalRow;
  sides: Side[];
  /** bar height in px: the height the reading resolved, x (R - r0) */
  H: number;
}

export interface Layout {
  size: number;
  cx: number;
  cy: number;
  R: number;
  r0: number;
  petals: PetalGeo[];
}

const TAU = Math.PI * 2;
/** A side wider than this is split, and so is the tail, so the polygon stays closed. */
const SPLIT_ABOVE = 0.9 * Math.PI;
const SUB_SIDE_MAX = 0.45;

/** Point at radius r and angle a, clockwise from twelve o'clock. */
const at = (cx: number, cy: number, r: number, a: number): Pt => [
  cx + r * Math.sin(a),
  cy - r * Math.cos(a),
];
export const along = (p: Pt, n: Pt, k: number): Pt => [p[0] + n[0] * k, p[1] + n[1] * k];

export function layout(
  rows: PetalRow[],
  widths: number[],
  heights: number[],
  opts: { size: number; thumb: boolean },
): Layout {
  const { size, thumb } = opts;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - (thumb ? 3 : size * 0.15);
  const r0 = R * 0.32;
  const L = R - r0;
  const gapPx = thumb ? 0.5 : 1.1;
  const totalW = widths.reduce((t, w) => t + w, 0) || 1;

  let a = 0;
  const petals = rows.map((row, i): PetalGeo => {
    const wf = widths[i] ?? 1;
    const h = heights[i] ?? 0;
    const w = (TAU * wf) / totalW;
    const k = row.tail || w > SPLIT_ABOVE ? Math.max(1, Math.ceil(w / SUB_SIDE_MAX)) : 1;
    const sides: Side[] = [];
    for (let j = 0; j < k; j++) {
      const t0 = a + (w * j) / k;
      const t1 = a + (w * (j + 1)) / k;
      const mid = (t0 + t1) / 2;
      let p0 = at(cx, cy, r0, t0);
      let p1 = at(cx, cy, r0, t1);
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const tan: Pt = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
      // a gap between petals, capped at 22% of the side
      const g = Math.min(gapPx, len * 0.22);
      if (j === 0) p0 = along(p0, tan, g / 2);
      if (j === k - 1) p1 = along(p1, tan, -g / 2);
      sides.push({ p0, p1, n: [Math.sin(mid), -Math.cos(mid)], len });
    }
    a += w;
    return { row, sides, H: h * L };
  });
  return { size, cx, cy, R, r0, petals };
}

/** The anchor of a petal: the middle of its middle sub-side, and that side's normal. */
export function anchorOf(g: PetalGeo): { x: number; y: number; n: Pt } {
  const s = g.sides[Math.floor(g.sides.length / 2)] as Side;
  return { x: (s.p0[0] + s.p1[0]) / 2, y: (s.p0[1] + s.p1[1]) / 2, n: s.n };
}

/** Total side length of a petal, in px. */
export const sideLength = (g: PetalGeo): number => g.sides.reduce((t, s) => t + s.len, 0);
