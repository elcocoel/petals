// "Everyone else" as its members (one petal, sized by the share it represents, its stripes inverted, the smaller
// closer to the centre): the members' heights stacked, smallest first, in at most FOLD_CELLS stripes. The
// numbers only; render/wedge/fold.ts draws them. Pure.

/** The most stripes a folded petal is drawn with; a longer tail joins neighbours into one, their heights summed. */
export const FOLD_CELLS = 120;

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
