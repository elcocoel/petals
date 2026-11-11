// "Everyone else", folded (#76). Elco, 11 Nov: "it should be there, and it should somehow clearly be a group or some
// visual feeling that this is an abbreviation that could be mapped further". So the tail is drawn as its members
// packed together: a few columns of small cells, one cell per member, each exactly as tall as that member's own
// petal would be, with the fine line between petals between them. A wallet's petal and a member's cell cover the
// same room for the same amount, so the block shows how much they hold together without passing for one big
// wallet, and unpacking it is mapping further. The segments behaviour (recorded parts of a quantity): the parts
// are real members. For /lab first. Pure.
import { GUTTER, n3, pointIn, type Ring, widthAt } from './ring.ts';

/**
 * The room the folded petal takes, as a share of one petal's: one, and one more for each tenfold of members, so 96
 * members take about three petals' room and 690,000 about seven. Never as many as it folds, which would make the
 * many small ones swallow the flower.
 */
export const foldRoom = (members: number): number => 1 + Math.log10(Math.max(1, members));

/** The most cells a column is drawn with; a longer column joins neighbours into one cell, their heights summed. */
export const COLUMN_CELLS = 120;

export interface Fold {
  /** each column's cells, bottom to top, as shares of the tallest column's height */
  columns: number[][];
}

/**
 * The members packed: dealt into columns largest first, one each in turn, so the columns come out nearly as tall
 * as each other and every column starts with its largest. Heights are on the flower's own scale (a petal's height,
 * 0 to 1); `tallest` is the tallest column, which is the folded petal's height.
 */
export function foldOf(heights: readonly number[], room: number): { fold: Fold; tallest: number } {
  const sorted = [...heights].filter((h) => h > 0).sort((a, b) => b - a);
  const count = Math.max(1, Math.ceil(room));
  const cols: number[][] = Array.from({ length: count }, () => []);
  sorted.forEach((h, j) => {
    (cols[j % count] as number[]).push(h);
  });
  // a long column joins neighbours, so a drawing never has more than COLUMN_CELLS cells in one
  const joined = cols.map((c) => {
    if (c.length <= COLUMN_CELLS) return c;
    const per = Math.ceil(c.length / COLUMN_CELLS);
    const out: number[] = [];
    for (let k = 0; k < c.length; k += per)
      out.push(c.slice(k, k + per).reduce((a, b) => a + b, 0));
    return out;
  });
  const sums = joined.map((c) => c.reduce((a, b) => a + b, 0));
  const tallest = Math.max(0, ...sums);
  return {
    fold: { columns: joined.map((c) => c.map((h) => (tallest > 0 ? h / tallest : 0))) },
    tallest,
  };
}

/** The folded petal's cells, as one path: each a stretch of its column, the fine line between them all. */
export function foldPath(ring: Ring, i: number, fold: Fold): string {
  const h = ring.h[i] as number;
  const at = (p: [number, number]) => `${n3(p[0])} ${n3(p[1])}`;
  const cols = fold.columns.length;
  let d = '';
  fold.columns.forEach((cells, c) => {
    let base = 0;
    for (const share of cells) {
      const top = base + share * h;
      const h0 = base + (base > 0 ? GUTTER / 2 : 0);
      const h1 = top - GUTTER / 2;
      base = top;
      if (h1 <= h0) continue;
      // the line between columns, in shares of the wedge's width where the cell sits
      const cut = GUTTER / 2 / (widthAt(ring, i, (h0 + h1) / 2) || 1);
      const t0 = c / cols + (c > 0 ? cut : 0);
      const t1 = (c + 1) / cols - (c < cols - 1 ? cut : 0);
      if (t1 <= t0) continue;
      d += `M${at(pointIn(ring, i, t0, h0))}L${at(pointIn(ring, i, t1, h0))}L${at(pointIn(ring, i, t1, h1))}L${at(pointIn(ring, i, t0, h1))}Z`;
    }
  });
  return d;
}
