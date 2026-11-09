// Roads (specs/006-the-map, M-C): two flowers that share accounts. Far away, one line whose weight is how
// many they share; up close, it fans out into the shared petals, each line ending on the same account in
// the other flower. A road says "same accounts", never "working together": the relations index's own
// words are "Shared membership is not coordination." Pure.
import type { ReadingPetal } from '@petal/core/types';
import { type Link, type Place, ROADS_FAR } from './places.ts';

export interface Road {
  /** Indexes into the map's flowers. */
  a: number;
  b: number;
  shared: number;
  weight: number;
  /** Among the strongest few of either flower's roads: these show from the farthest away. */
  strong: boolean;
}

/** The roads between placed flowers, most shared first. Links to a flower not on the map are left out. */
export function roadsBetween(flowers: readonly Place[], links: readonly Link[]): Road[] {
  const at = new Map(flowers.map((f, i) => [f.id, i]));
  const roads: Road[] = [];
  for (const l of links) {
    const a = at.get(l.a);
    const b = at.get(l.b);
    if (a === undefined || b === undefined || a === b) continue;
    roads.push({ a, b, shared: l.shared, weight: l.weight, strong: false });
  }
  roads.sort((x, y) => y.shared - x.shared || x.a - y.a || x.b - y.b);
  const count = new Map<number, number>();
  for (const r of roads) {
    const ca = count.get(r.a) ?? 0;
    const cb = count.get(r.b) ?? 0;
    r.strong = ca < ROADS_FAR || cb < ROADS_FAR;
    count.set(r.a, ca + 1);
    count.set(r.b, cb + 1);
  }
  return roads;
}

/** A road's width far away, in px on screen: thin for a few accounts, never past a few px. */
export function roadWidth(shared: number): number {
  return Math.max(0.6, Math.min(3.2, 0.6 + 0.9 * Math.log10(Math.max(1, shared))));
}

/**
 * The petals a road fans into: each pair is a petal in the first flower and the same account's petal in the
 * second. "Everyone else" isn't an account, so it never pairs.
 */
export function fanPairs(
  a: readonly Pick<ReadingPetal, 'id' | 'tail'>[],
  b: readonly Pick<ReadingPetal, 'id' | 'tail'>[],
): [number, number][] {
  const inB = new Map<string, number>();
  b.forEach((p, j) => {
    if (!p.tail) inB.set(p.id, j);
  });
  const pairs: [number, number][] = [];
  a.forEach((p, i) => {
    if (p.tail) return;
    const j = inB.get(p.id);
    if (j !== undefined) pairs.push([i, j]);
  });
  return pairs;
}

/**
 * The accounts a road shares beyond its drawn petals. A flower draws its top holders and "everyone else",
 * so most of what two big flowers share is usually inside their "everyone else" petals.
 */
export function restOf(shared: number, pairs: number): number {
  return Math.max(0, shared - pairs);
}

/** A flower's "everyone else" petal, or -1 if it has none. */
export const tailOf = (petals: readonly Pick<ReadingPetal, 'tail'>[]): number =>
  petals.findIndex((p) => p.tail);

/** How much a road shows at a distance: the more roads on screen, the fainter each, so it never tangles. */
export function crowdFade(onScreen: number): number {
  return Math.max(0.25, Math.min(1, 40 / Math.max(1, onScreen)));
}
