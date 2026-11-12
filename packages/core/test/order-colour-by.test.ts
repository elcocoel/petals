// Elco, 12 Nov: "the dimension of time specifically is particularly absent ... it always looks like a shell, like a
// nautilus ... last active, most active ... a way to color grade the [wallets] that never voted ... the legend tells
// me what each color is". Order takes the activity pieces SYSTEMS gives with a reading (last_active, a date, newest
// first; votes_cast, a count, most first); Colour takes voted, 'never voted' in grey; and a map's keys are ranked
// once over all its flowers.
import { describe, expect, test } from 'vitest';
import { readFlower } from '../src/reading/index.ts';
import { GREY, KEYS, keysOf, mapKeys, wordsOf } from '../src/render/wedge/keys.ts';
import type { SeamPiece } from '../src/seam.ts';
import type { View } from '../src/types/index.ts';
import { DEFAULT_VIEW } from '../src/view/index.ts';
import { GOLDEN_CASES, goldenSpec } from './golden-cases.ts';

const c = GOLDEN_CASES.find((g) => g.name === 'house-of-stake-default') as (typeof GOLDEN_CASES)[0];
const spec = goldenSpec(c);
const s = c.snapshot();
const plain = readFlower(spec, s, DEFAULT_VIEW);
const ids = plain.petals.filter((p) => !p.tail).map((p) => p.id);

const piece = (
  name: string,
  kind: 'date' | 'count' | 'category',
  values: [string, string][],
): SeamPiece =>
  ({
    name,
    kind,
    unit: kind,
    standing: 'verified',
    layer: 'test',
    as_of: '2026-11-12T00:00:00Z',
    values: values.map(([participant, value]) => ({ participant, value })),
  }) as SeamPiece;

const withView = (edit: (d: Record<string, unknown>) => void): View => {
  const v = structuredClone(DEFAULT_VIEW);
  edit(v.dimensions as unknown as Record<string, unknown>);
  return v;
};

// the smallest three were active last, the biggest never
const [a, b, c3] = ids.slice(-3) as [string, string, string];
const lastActive = piece('last_active', 'date', [
  [a, '2026-11-01T00:00:00Z'],
  [b, '2026-11-10T00:00:00Z'],
  [c3, '2026-10-01T00:00:00Z'],
]);
const votesCast = piece('votes_cast', 'count', [
  [a, '3'],
  [b, '12'],
  [c3, '7'],
]);
const voted = piece('voted', 'category', [
  ...ids.map((id): [string, string] => [
    id,
    id === a || id === b || id === c3 ? 'voted' : 'never voted',
  ]),
]);
const pieces = [lastActive, votesCast, voted];

describe('Order', () => {
  test('by size, as it always was, when the view says share', () => {
    expect(readFlower(spec, s, DEFAULT_VIEW, pieces).petals.map((p) => p.id)).toEqual(
      plain.petals.map((p) => p.id),
    );
  });

  test('last active: newest first, those with no date after, the tail last', () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => (d.order = { data: 'last_active' })),
      pieces,
    );
    const order = r.petals.map((p) => p.id);
    expect(order.slice(0, 3)).toEqual([b, a, c3]);
    expect(r.petals.at(-1)?.tail ?? false).toBe(plain.petals.at(-1)?.tail ?? false);
    expect(new Set(order)).toEqual(new Set(plain.petals.map((p) => p.id)));
  });

  test('most active: most votes cast first', () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => (d.order = { data: 'votes_cast' })),
      pieces,
    );
    expect(r.petals.slice(0, 3).map((p) => p.id)).toEqual([b, c3, a]);
  });
});

describe('every choice Tools offers draws (VISUAL QA, 12 Nov)', () => {
  test('order by kind, who it is, or the name each petal shows', () => {
    for (const data of ['kind', 'identity', 'name']) {
      const r = readFlower(
        spec,
        s,
        withView((d) => (d.order = { data })),
        pieces,
      );
      expect(new Set(r.petals.map((p) => p.id))).toEqual(new Set(plain.petals.map((p) => p.id)));
    }
    // by name: a to z (a person's names, else each petal's own label)
    const byName = readFlower(
      spec,
      s,
      withView((d) => (d.order = { data: 'name' })),
      pieces,
    )
      .petals.filter((p) => !p.tail)
      .map((p) => p.name);
    expect(byName).toEqual([...byName].sort());
  });

  test('width and height by a count: each petal by its own count', () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => {
        d.width = { data: 'votes_cast', max_ratio: 2 };
        d.height = { data: 'votes_cast', scale: 'linear' };
      }),
      pieces,
    );
    const at = (id: string) => r.petals.find((p) => p.id === id);
    expect(at(b)?.width).toBeCloseTo(2, 6);
    expect((at(b)?.height ?? 0) > (at(a)?.height ?? 0)).toBe(true);
  });
});

describe('Colour', () => {
  test("voted or never: each petal's value is its key, 'never voted' grey and taking no key", () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => (d.colour = { data: 'voted' })),
      pieces,
    );
    const real = r.petals.filter((p) => !p.tail);
    expect(real.find((p) => p.id === a)?.colour).toBe('voted');
    expect(real.find((p) => p.id === ids[0])?.colour).toBe('never voted');
    // its words are its own (wordsOf), never 'unknown': the keys and the legend name it
    expect(wordsOf('voted')).toBe('voted');
    expect(wordsOf('never voted')).toBe('never voted');
    const keyed = keysOf(real.map((p) => wordsOf(p.colour)));
    expect(keyed.find((k) => k.value === 'voted')?.key).toBe(KEYS[0]);
    expect(keyed.find((k) => k.value === 'never voted')?.key).toBe(GREY);
  });

  test("a count on Colour isn't drawn as categories: its raw numbers never become keys", () => {
    const r = readFlower(
      spec,
      s,
      withView((d) => (d.colour = { data: 'votes_cast' })),
      pieces,
    );
    expect(r.petals.some((p) => p.colour === '12')).toBe(false);
  });

  test('a map ranks its keys once, so a value has one colour on every flower', () => {
    const one = [{ id: '1', colour: 'dao', share: 1, segments: [] }];
    const two = [
      { id: '2', colour: 'person', share: 1, segments: [] },
      { id: '3', colour: 'person', share: 1, segments: [] },
    ];
    const keyed = mapKeys([one, two]);
    // the commonest across both flowers first, whichever flower it's on
    expect(keyed.map((k) => k.key?.name)).toEqual([KEYS[0]?.name, KEYS[1]?.name]);
    expect(keyed[0]?.value).toBe(wordsOf('person'));
    expect(keyed[1]?.value).toBe(wordsOf('dao'));
  });
});
