// Ties inside a flower (the view's Lines): the relation the view names there, from the flower's own data (its
// reading's pieces, e.g. votes_alike: the pairs of wallets that voted alike), as pairs of its petals. A flower
// without that piece, or a view with Lines on None, draws none. Pure.
import type { SeamPiece } from '@petal/core';
import type { View } from '@petal/core/types';
import { latestView } from '@petal/core/view';

/** The pairs of accounts the view's Lines draws on a flower, or null where it draws none. */
export function tiesOf(
  given: readonly SeamPiece[] | undefined,
  view: View,
): [string, string][] | null {
  const by = latestView(view).dimensions.lines?.data ?? null;
  const piece = by ? given?.find((p) => p.name === by) : undefined;
  return piece?.kind === 'relation' ? piece.lines.map((l) => [l.from, l.to]) : null;
}

/** Those pairs as pairs of the flower's petals, by index: only where both are petals of their own. */
export function tiePairs(
  ties: readonly (readonly [string, string])[],
  petals: readonly { id: string }[],
): [number, number][] {
  const at = new Map(petals.map((p, i) => [p.id, i]));
  return ties.flatMap(([from, to]) => {
    const a = at.get(from);
    const b = at.get(to);
    return a === undefined || b === undefined || a === b ? [] : [[a, b] as [number, number]];
  });
}
