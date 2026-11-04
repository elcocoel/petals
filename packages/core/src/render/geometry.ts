// The flower's geometry, ported from draw() in research/spikes/flower/index.html (renderer.md):
// a polygon with one side per petal, bars standing straight out along each side's normal, cut
// into stacked parallelograms. Straight edges only: no curves, no rounded petals (constitution I).
// Pure numbers here; ./svg.ts writes them out.
import type { Encoding, PetalRow } from '../types/index.ts';

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
  /** width factor in [1, max_ratio] */
  w: number;
  /** height in [0, 1] before clamping (from the height encoding) */
  h: number;
  /** bar height in px: clamp(h, 0.03, 1) x (R - r0) */
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

/** Width: log share mapped onto [1, max_ratio], so the widest side is at most max_ratio times the
 * narrowest. `equal` gives every side the same length. The tail takes part like any petal. */
export function widthFactors(rows: PetalRow[], width: Encoding): number[] {
  if (width.by === 'equal') return rows.map(() => 1);
  const ratio = width.max_ratio ?? 2;
  const ls = rows.map((r) => Math.log(Math.max(r.share, 1e-12)));
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  return ls.map((l) => (hi > lo ? 1 + ((ratio - 1) * (l - lo)) / (hi - lo) : 1));
}

/**
 * Height in [0, 1] per petal: `sqrt` share / max share, `linear` share / max share, `log` amount
 * between the smallest and largest petal, `m:<metric>` metric / max metric, `equal` 0.82.
 * The tail stands for its average member (its mean share, mean amount, mean metric).
 */
export function heightValues(
  rows: PetalRow[],
  height: Encoding,
  metric: (row: PetalRow) => number,
): number[] {
  const real = rows.filter((r) => !r.tail);
  const per = (r: PetalRow, x: number) => (r.tail && r.count ? x / r.count : x);
  if (height.by === 'equal') return rows.map(() => 0.82);
  if (height.by === 'share') {
    const max = Math.max(...real.map((r) => r.share)) || 1;
    return rows.map((r) => {
      const x = per(r, r.share) / max;
      return height.scale === 'linear' ? x : Math.sqrt(x);
    });
  }
  if (height.by === 'amount') {
    const amounts = real.map((r) => Number(r.amount)).filter((a) => a > 0);
    const lo = Math.min(...amounts);
    const hi = Math.max(...amounts);
    return rows.map((r) => {
      const a = per(r, Number(r.amount));
      return hi > lo && a > 0 ? Math.max(0, Math.log(a / lo) / Math.log(hi / lo)) : 1;
    });
  }
  // m:<metric>; metric() already averages the tail
  const values = rows.map(metric);
  const max = Math.max(...real.map(metric)) || 1;
  return values.map((v) => v / max);
}

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
    return { row, sides, w: wf, h, H: Math.max(0.03, Math.min(1, h)) * L };
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
