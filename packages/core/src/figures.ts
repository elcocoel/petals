// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// Counting (FR-025; data-model.md, Figures). The agent interprets; these count. W1 owns this.
import { notImplemented } from './not-implemented.ts';
import type { FigureChanges, Figures, PetalRow, Segment, Snapshot, Spec } from './types/index.ts';

export function computeFigures(
  s: Snapshot,
  opts: { measure: string; petals?: number; nakamotoThreshold?: number; topK?: number[] },
): Figures {
  return notImplemented('computeFigures');
}

/** Top N by the spec's order, plus the declared tail. */
export function selectPetals(s: Snapshot, sel: Spec['selection']): PetalRow[] {
  return notImplemented('selectPetals');
}

/** NEAR: lockup, liquid, 1M+, other (see fixtures/README.md for how the snapshot marks them). */
export function backerSegments(s: Snapshot, poolId: string): Segment[] {
  return notImplemented('backerSegments');
}

/** US5, tools.md compare_figures. `a` is the earlier snapshot. */
export function compareFigures(
  a: Snapshot,
  b: Snapshot,
  opts: { measure: string; petals?: number },
): FigureChanges {
  return notImplemented('compareFigures');
}
