// "Everyone else", folded (#76). Elco, 11 Nov: "it should be there, and it should somehow clearly be a group ...
// an abbreviation that could be mapped further", then: "everyone else should be 1 petal, the correct size for the
// percentage it represents - the stripey pattern would work better inverted (smaller closer to the center)". So
// the tail is one petal, as wide as any, as tall as the share it holds on the flower's own scale, made of its
// members stacked as stripes, the smallest nearest the centre, each as tall as its own share. The segments
// behaviour (recorded parts of a quantity): the parts are real members. For /lab first. Pure.
import { GUTTER, n3, pointIn, type Ring } from './ring.ts';

/** The most stripes a folded petal is drawn with; a longer tail joins neighbours into one, their heights summed. */
export const FOLD_CELLS = 120;

/** A stripe's line is never more than this share of its own height, so the smallest stay visible. */
const LINE_SHARE = 0.3;

export interface Fold {
  /** its members' stripes, from the centre out, as shares of the petal's height: the smallest first */
  cells: number[];
}

/**
 * The members stacked, smallest first, in at most FOLD_CELLS stripes. Heights are on the flower's own scale (a
 * petal's height, 0 to 1); `height` is their sum, the share they hold together, which is the petal's height.
 */
export function foldOf(heights: readonly number[]): { fold: Fold; height: number } {
  const sorted = [...heights].filter((h) => h > 0).sort((a, b) => a - b);
  const per = Math.max(1, Math.ceil(sorted.length / FOLD_CELLS));
  const cells: number[] = [];
  for (let k = 0; k < sorted.length; k += per) {
    cells.push(sorted.slice(k, k + per).reduce((a, b) => a + b, 0));
  }
  const height = cells.reduce((a, b) => a + b, 0);
  return { fold: { cells: cells.map((h) => (height > 0 ? h / height : 0)) }, height };
}

/** The folded petal's stripes, as one path: each a stretch of the wedge, with a fine line between them. */
export function foldPath(ring: Ring, i: number, fold: Fold): string {
  const h = ring.h[i] as number;
  const at = (p: [number, number]) => `${n3(p[0])} ${n3(p[1])}`;
  let d = '';
  let base = 0;
  fold.cells.forEach((share, j) => {
    const top = base + share * h;
    const line = Math.min(GUTTER, share * h * LINE_SHARE);
    const h0 = base + (j > 0 ? line / 2 : 0);
    const h1 = top - (j < fold.cells.length - 1 ? line / 2 : 0);
    base = top;
    if (h1 <= h0) return;
    d += `M${at(pointIn(ring, i, 0, h0))}L${at(pointIn(ring, i, 1, h0))}L${at(pointIn(ring, i, 1, h1))}L${at(pointIn(ring, i, 0, h1))}Z`;
  });
  return d;
}
