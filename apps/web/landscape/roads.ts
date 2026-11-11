// Connections (specs/006-the-map, M-C, bench v2): two flowers that share accounts, drawn as one line whose
// width is how many they share, with the number on zoom or a click. A connection says "same accounts",
// never "working together": the relations index's own words are "Shared membership is not coordination."
// Pure.
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

/**
 * A road's width far away, in px on screen: thin for a few accounts, never past two (Elco, 11 Nov walk: the lines
 * were "way too powerful").
 */
export function roadWidth(shared: number): number {
  return Math.max(0.5, Math.min(2, 0.5 + 0.5 * Math.log10(Math.max(1, shared))));
}

/** How much a road shows at a distance: the more roads on screen, the fainter each, so it never tangles. */
export function crowdFade(onScreen: number): number {
  return Math.max(0.25, Math.min(1, 40 / Math.max(1, onScreen)));
}
