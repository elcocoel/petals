// ILLUSTRATIVE ONLY. Nothing here comes from a reading: `interactions` is a field nothing fills, and
// nothing groups accounts by a common funder. This exists to judge the feel of lines inside the
// polygon and a dotted ring, on a private bench, and it's off by default (?relations=1). A real flower
// can't claim any of this.
import type { FakeRelations } from '../../flower/scene.ts';

/** A fixed seed, so it's the same drawing every time. */
const SEED = 20261105;

/** mulberry32. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fakeRelations(n: number, count = 34): FakeRelations {
  const r = random(SEED);
  const pairs: [number, number][] = [];
  for (let i = 0; i < count && n > 1; i++) {
    // Weighted towards the big petals, as the reference is.
    const a = Math.floor(r() * r() * n);
    let b = Math.floor(r() * n);
    if (b === a) b = (a + 1 + Math.floor(r() * (n - 1))) % n;
    pairs.push([a, b]);
  }
  return { pairs, ring: 0.96 };
}
