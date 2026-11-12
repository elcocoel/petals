// The look's colours (design/flower-art-direction/default-system-vnext.md, V1, Elco 11 Nov; exact values in
// palette-final.json): five keys handed to a category's values from the most common to the rarest, and grey for
// context. No value has a colour of its own: the keys go by how many petals carry each value, so the same flower
// keyed again gets the same colours and another flower's commonest value is mint too. Only the keys needed. On
// every flower and still picture since 11 Nov (#76; Elco: the lab into the product). Pure.

import { colourLabel } from '../../reading/words.ts';
import { BACKER_LABELS, type BackerClass } from '../../segments/backers.ts';

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
 * Values that say nothing happened draw grey and take no key (Elco, 12 Nov: "a way to color grade the [wallets] that
 * never voted"): a wallet that never voted, and a petal the piece has no value for (reading/index.ts NO_VALUE).
 */
export const QUIET_VALUES: ReadonlySet<string> = new Set(['never voted', 'no value']);

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
  const ranked = [...seen.entries()].sort(
    ([, a], [, b]) => b.petals - a.petals || b.weight - a.weight || a.first - b.first,
  );
  const loud = ranked.filter(([value]) => !QUIET_VALUES.has(value));
  const quiet = ranked.filter(([value]) => QUIET_VALUES.has(value));
  return [
    ...loud.map(([value, s], rank) => ({ value, key: KEYS[rank] ?? null, petals: s.petals })),
    ...quiet.map(([value, s]) => ({ value, key: GREY, petals: s.petals })),
  ];
}

/**
 * One colour per value across a whole map (Elco, 12 Nov: "I have a drop down to say what color means and then the
 * legend tells me what each color is"): the keys ranked once over every flower's petals, so mint is the same value
 * on every flower and the map's legend can say what each colour stands for.
 */
export function mapKeys(flowers: readonly (readonly Keyable[])[]): Keyed[] {
  const real = flowers.flatMap((petals) => petals.filter((p) => !p.tail));
  return keysOf(
    real.map((p) => wordsOf(p.colour)),
    real.map((p) => p.share),
  );
}

/** A map's keys as legend lines: each value's words and its swatch, as flowerKeys gives a flower's. */
export const keyLines = (keyed: readonly Keyed[]): FlowerKey[] =>
  keyed.map((k) => ({ label: k.value, swatch: `key-${(k.key ?? GREY).name}` }));

/** A value's colour among keyed values, or null. */
export const keyFor = (keyed: readonly Keyed[], value: string | null | undefined): Key | null =>
  value === null || value === undefined
    ? null
    : (keyed.find((k) => k.value === value)?.key ?? null);

/** A kind's words, as the reading says it: kinds that read the same (pool, staking pool, validator) share a key. */
export const wordsOf = (colour: string): string => colourLabel(colour);

/** What the look needs of a petal to colour it. */
export interface Keyable {
  id: string;
  colour: string;
  share: number;
  tail?: boolean | undefined;
  segments: readonly { key: string; amount: string }[];
  /** the tail's members as stripes (ReadingPetal fold) */
  fold?: readonly number[] | undefined;
}

/**
 * The art direction's colours for a reading (#76, on every flower since 11 Nov): each petal in its kind's key, the
 * kinds handed out by how many petals carry each, everyone else in grey; each band in its class's key, the classes
 * by how many petals carry a band of each. A value past the fifth, and a petal of bands with none recorded, grey.
 * The same for the live flower and the still picture.
 */
export function lookFills(
  petals: readonly Keyable[],
  /** the map's keys (mapKeys), so a value has one colour on every flower; without, the flower's own */
  keyed?: readonly Keyed[],
): {
  fills: Record<string, string>;
  bands: Record<string, string>;
  /** each kind's colour, by its value, for the legend; none while the petals are banded */
  kinds: Record<string, string>;
  /** the tail's stripes, its members smallest first (fold.ts), where the reading has them */
  folds: Record<string, { cells: number[] }>;
} {
  const real = petals.filter((p) => !p.tail);
  const kinds =
    keyed ??
    keysOf(
      real.map((p) => wordsOf(p.colour)),
      real.map((p) => p.share),
    );
  const classes = keysOf(
    real.flatMap((p) => p.segments.map((s) => s.key)),
    real.flatMap((p) => p.segments.map((s) => Number(s.amount))),
  );
  const banded = classes.length > 0;
  const hexOf = (colour: string) => keyFor(kinds, wordsOf(colour))?.hex ?? GREY.hex;
  return {
    fills: Object.fromEntries(
      petals.map((p) => [p.id, p.tail || banded ? GREY.hex : hexOf(p.colour)]),
    ),
    bands: Object.fromEntries(classes.map((c) => [c.value, c.key?.hex ?? GREY.hex])),
    kinds: banded ? {} : Object.fromEntries(real.map((p) => [p.colour, hexOf(p.colour)])),
    folds: Object.fromEntries(
      petals.flatMap((p) => (p.tail && p.fold?.length ? [[p.id, { cells: [...p.fold] }]] : [])),
    ),
  };
}

/** One line of a flower's key: the reading's words, and the swatch's name as the site's data-swatch rules have it. */
export interface FlowerKey {
  label: string;
  swatch: string;
}

/**
 * A flower's key, in the order its colours were handed (most common first): its kinds, or its bands' classes when
 * its petals are banded, a value past the fifth in grey, then everyone else in grey. The legend inside a flower
 * says what lookFills paints, in the same words.
 */
export function flowerKeys(
  petals: readonly Keyable[],
  /** the map's keys (mapKeys): the flower's own values, in the map's colours */
  keyed?: readonly Keyed[],
): FlowerKey[] {
  const real = petals.filter((p) => !p.tail);
  const swatch = (k: Key | null) => `key-${(k ?? GREY).name}`;
  const classes = keysOf(
    real.flatMap((p) => p.segments.map((s) => s.key)),
    real.flatMap((p) => p.segments.map((s) => Number(s.amount))),
  );
  const rows =
    classes.length > 0
      ? classes.map((c) => ({
          label: BACKER_LABELS[c.value as BackerClass] ?? c.value,
          swatch: swatch(c.key),
        }))
      : (keyed
          ? keyed.filter((k) => real.some((p) => wordsOf(p.colour) === k.value))
          : keysOf(
              real.map((p) => wordsOf(p.colour)),
              real.map((p) => p.share),
            )
        ).map((k) => ({ label: k.value, swatch: swatch(k.key) }));
  return petals.some((p) => p.tail)
    ? [...rows, { label: 'everyone else', swatch: swatch(GREY) }]
    : rows;
}
