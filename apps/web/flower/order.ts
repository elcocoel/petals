// The order petals go round the ring. A reading gives them by rank. ?order=scatter, only to judge the
// look: a shuffle that depends on nothing but each account's id, so a flower comes out the same every
// time and two flowers put one account in the same relative place. Nothing about the reading changes.

/** FNV-1a, with a finisher so ids that differ only at the end still land far apart. */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function scatter<T extends { id: string }>(petals: readonly T[]): T[] {
  return petals
    .map((petal) => ({ petal, key: hash(petal.id) }))
    .sort((a, b) => a.key - b.key || (a.petal.id < b.petal.id ? -1 : 1))
    .map((x) => x.petal);
}
