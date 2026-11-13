// "Everyone else", folded: it is there, clearly a group, an abbreviation that could be mapped further. So the
// tail is one petal, as wide as any, as tall as the share it holds on the flower's own scale, made of its
// members stacked as stripes, the smallest nearest the centre, each as tall as its own share. The segments
// behaviour (recorded parts of a quantity): the parts are real members. The numbers are the reading's
// (reading/fold.ts, a tail petal's fold); this draws them, on every flower since 11 Nov. Pure.
import type { Fold } from '../../reading/fold.ts';
import { GUTTER, n3, pointIn, type Ring } from './ring.ts';

export { FOLD_CELLS, type Fold, foldOf } from '../../reading/fold.ts';

/** A stripe's line is never more than this share of its own height, so the smallest stay visible. */
const LINE_SHARE = 0.3;

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
