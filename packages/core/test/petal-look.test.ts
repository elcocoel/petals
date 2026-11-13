// The petal look, V1 (the art direction's default system, 11 Nov), for /lab first: five
// keys handed out from the most common value to the rarest, grey apart; the highlight's tones from the petal's own
// colour; its stroke inside the petal; and straight heights with no minimum (the default since 11 Nov).
import { describe, expect, test } from 'vitest';
import { HEIGHT_FLOOR } from '../src/reading/encodings.ts';
import { readFlower } from '../src/reading/index.ts';
import {
  insetBy,
  outsidePiece,
  outsideRadii,
  roundedPath,
  tonesOf,
} from '../src/render/wedge/highlight.ts';
import { flowerKeys, GREY, KEYS, keyFor, keysOf, lookFills } from '../src/render/wedge/keys.ts';
import type { ViewV2 } from '../src/types/index.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';

describe("a flower's key (flowerKeys) and its fills (lookFills)", () => {
  const petal = (
    id: string,
    colour: string,
    share: number,
    segments: { key: string; amount: string }[] = [],
  ) => ({
    id,
    colour,
    share,
    segments,
  });
  test('kinds that read the same share one key: staking pool and validator are both pool', () => {
    const petals = [
      petal('a', 'staking_pool', 0.3),
      petal('b', 'validator', 0.2),
      petal('c', 'exchange', 0.4),
      { ...petal('t', 'tail', 0.1), tail: true },
    ];
    const look = lookFills(petals);
    expect(look.fills.a).toBe(look.fills.b);
    expect(look.fills.a).toBe(KEYS[0]?.hex);
    expect(look.fills.c).toBe(KEYS[1]?.hex);
    expect(look.fills.t).toBe(GREY.hex);
    expect(flowerKeys(petals)).toEqual([
      { label: 'pool', swatch: 'key-mint' },
      { label: 'exchange', swatch: 'key-blue' },
      { label: 'everyone else', swatch: 'key-grey' },
    ]);
  });
  test("a banded flower's key is its bands' classes, in the reading's words", () => {
    const petals = [
      petal('a', 'staking_pool', 0.5, [
        { key: 'other', amount: '5' },
        { key: 'lockup', amount: '1' },
      ]),
      petal('b', 'staking_pool', 0.5, [{ key: 'other', amount: '3' }]),
    ];
    expect(flowerKeys(petals)).toEqual([
      { label: 'other delegators', swatch: 'key-mint' },
      { label: 'lockups (vesting)', swatch: 'key-blue' },
    ]);
  });
});

describe('the keys', () => {
  test('the five keys, most common first, and grey apart from them', () => {
    expect(KEYS.map((k) => [k.name, k.hex])).toEqual([
      ['mint', '#8BC9BD'],
      ['blue', '#96D4E3'],
      ['coral', '#EB9C94'],
      ['apricot', '#F4C376'],
      ['pink', '#ECB5D5'],
    ]);
    expect(GREY.hex).toBe('#C7C7C7');
    expect(KEYS).not.toContainEqual(GREY);
  });

  test('go to the value most petals carry first, then by weight, then by first appearance', () => {
    const keyed = keysOf(['b', 'a', 'b', null, 'c', 'a', 'd'], [1, 5, 1, 0, 9, 5, 1]);
    expect(keyed.map((k) => [k.value, k.key?.name, k.petals])).toEqual([
      ['a', 'mint', 2],
      ['b', 'blue', 2],
      ['c', 'coral', 1],
      ['d', 'apricot', 1],
    ]);
    expect(keyFor(keyed, 'c')?.name).toBe('coral');
    expect(keyFor(keyed, null)).toBeNull();
  });

  test('only the keys needed: one value is mint, and a value past the fifth has none', () => {
    expect(keysOf(['x', 'x']).map((k) => k.key?.name)).toEqual(['mint']);
    const six = keysOf(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(six.map((k) => k.key?.name ?? null)).toEqual([
      'mint',
      'blue',
      'coral',
      'apricot',
      'pink',
      null,
    ]);
  });

  test('no value has a colour of its own: the same values in another order are keyed by that order', () => {
    expect(keysOf(['for', 'against']).map((k) => k.value)).toEqual(['for', 'against']);
    expect(keysOf(['against', 'for']).map((k) => k.value)).toEqual(['against', 'for']);
  });
});

describe('the highlight', () => {
  test('its tones come from the fill: stroke × 0.62, light lifted without changing the hue, shade × 0.78', () => {
    const t = tonesOf('#8BC9BD');
    // Figma's mint stroke, about #567D75 (the art direction's handoff)
    expect(t.stroke).toBe('#567D75');
    expect(t.shade).toBe('#6C9D93');
    // 1.15 lifts mint's brightest channel (201) to 231: under 255, so the whole 1.15 applies
    expect(t.light).toBe('#A0E7D9');
    // apricot's red is 244, so its light is held to 255 on that channel and lifted as much on the rest
    const a = tonesOf('#F4C376');
    expect(a.light.slice(1, 3)).toBe('FF');
  });

  test('its stroke lies inside the petal: every side moved in by half its width', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(insetBy(square, 1)).toEqual([
      [1, 1],
      [9, 1],
      [9, 9],
      [1, 9],
    ]);
    // a petal too thin for it gets none
    expect(
      insetBy(
        [
          [0, 0],
          [1, 0],
          [1, 10],
          [0, 10],
        ],
        0.6,
      ),
    ).toBeNull();
  });

  test('its corners soften, never more than half the shorter side, so a small petal stays its size', () => {
    const thin: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 10],
      [0, 10],
    ];
    const d = roundedPath(thin, 2);
    const xs = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
    expect(d).toContain('Q');
    expect(d).toMatch(/^M0 0\.5Q0 0 0\.5 0/);
  });
});

describe('a reading with no minimum height', () => {
  const c = GOLDEN_CASES.find(
    (g) => g.name === 'near-validators-default',
  ) as (typeof GOLDEN_CASES)[0];
  const straight: ViewV2 = {
    petal: 'view/v2',
    dimensions: {
      height: { data: 'share', scale: 'linear' },
      width: null,
      order: { data: 'share' },
      colour: { data: 'kind' },
      outline: null,
      texture: null,
      markings: null,
      segments: null,
      lines: null,
      labels: { data: 'identity' },
    },
  };

  test('straight, a petal is as tall as its share over the largest, everyone else too, and no taller', () => {
    const r = readFlower(goldenSpec(c), c.snapshot(), straight);
    const max = Math.max(...r.petals.map((p) => p.share));
    for (const p of r.petals) expect(p.height).toBeCloseTo(p.share / max, 12);
    // no minimum: the smallest are far under the old floor
    expect(Math.min(...r.petals.map((p) => p.height))).toBeLessThan(HEIGHT_FLOOR);
    expect(new Set(r.petals.map((p) => p.width))).toEqual(new Set([1]));
  });

  test('on the other scales the floor stays, the tail its average member, and the flower reads as it always has', () => {
    const r = readFlower(goldenSpec(c), c.snapshot());
    expect(Math.min(...r.petals.map((p) => p.height))).toBeGreaterThanOrEqual(HEIGHT_FLOOR);
    expect(r).toEqual(readGolden(c));
    // a floor asked for still holds on the straight scale
    const floored = readFlower(goldenSpec(c), c.snapshot(), straight, [], { floor: HEIGHT_FLOOR });
    expect(Math.min(...floored.petals.map((p) => p.height))).toBeGreaterThanOrEqual(HEIGHT_FLOOR);
  });
});

describe('the highlight on a petal of bands: the outside only', () => {
  test('the foot corners soften on the first band, the tip on the last, none between', () => {
    expect(outsideRadii(true, false, 2)).toEqual([0, 0, 2, 2]);
    expect(outsideRadii(false, true, 2)).toEqual([2, 2, 0, 0]);
    expect(outsideRadii(false, false, 2)).toEqual([0, 0, 0, 0]);
  });

  test('a middle band strokes only its two sides, never across', () => {
    const inner: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 100],
      [0, 100],
    ];
    const d = outsidePiece(inner, 100, 1, 30, 60, false, false, 1);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain('Q');
  });
});
