// The look's colours (design/flower-art-direction/default-system-vnext.md, V1, Elco 11 Nov; exact values in
// palette-final.json): five keys handed to a category's values from the most common to the rarest, and grey for
// context. No value has a colour of its own: the keys go by how many petals carry each value, so the same flower
// keyed again gets the same colours and another flower's commonest value is mint too. Only the keys needed. For
// /lab first (#76): nothing on the live flowers uses them until Elco has seen them. Pure.

export type KeyName = 'mint' | 'blue' | 'coral' | 'apricot' | 'pink' | 'grey';

export interface Key {
  name: KeyName;
  hex: string;
}

/** The five keys, most common first (Elco's order, 11 Nov). */
export const KEYS: readonly Key[] = [
  { name: 'mint', hex: '#8BC9BD' },
  { name: 'blue', hex: '#96D4E3' },
  { name: 'coral', hex: '#EB9C94' },
  { name: 'apricot', hex: '#F4C376' },
  { name: 'pink', hex: '#ECB5D5' },
];

/** For context, such as a focused question's "everyone else in it"; not a sixth rank. */
export const GREY: Key = { name: 'grey', hex: '#C7C7C7' };

/** What "common" counts here: the petals that carry a value. Said in every key. */
export const COMMON_COUNTS = 'petals';

export interface Keyed {
  /** the category's value, as the data says it */
  value: string;
  /** its colour, or null past the fifth value: such a value draws in no key's colour */
  key: Key | null;
  /** how many petals carry it */
  petals: number;
}

/**
 * The keys for a category's values: the value most petals carry first; between two carried by as many, the one
 * with more weight (power held) behind it, then the one that comes first round the flower. A petal with no value
 * (null) takes none.
 */
export function keysOf(
  values: readonly (string | null | undefined)[],
  weights: readonly number[] = [],
): Keyed[] {
  const seen = new Map<string, { petals: number; weight: number; first: number }>();
  values.forEach((value, i) => {
    if (value === null || value === undefined) return;
    const was = seen.get(value) ?? { petals: 0, weight: 0, first: i };
    was.petals += 1;
    was.weight += weights[i] ?? 0;
    seen.set(value, was);
  });
  return [...seen.entries()]
    .sort(([, a], [, b]) => b.petals - a.petals || b.weight - a.weight || a.first - b.first)
    .map(([value, s], rank) => ({ value, key: KEYS[rank] ?? null, petals: s.petals }));
}

/** A value's colour among keyed values, or null. */
export const keyFor = (keyed: readonly Keyed[], value: string | null | undefined): Key | null =>
  value === null || value === undefined
    ? null
    : (keyed.find((k) => k.value === value)?.key ?? null);
