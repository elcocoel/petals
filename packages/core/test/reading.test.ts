// T179: the reading (renderer.md, reading/v1). All a drawing needs and no pixels: a second look can
// be drawn from the reading alone, and renderFlower's legend and petal details come from it.
import { describe, expect, test } from 'vitest';
import { buildSpec } from '../src/convention/index.ts';
import { readFlower, readingHash } from '../src/reading/index.ts';
import { renderFlower, SKINS } from '../src/render/index.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { ProposeChoices, Reading, Snapshot } from '../src/types/index.ts';
import { RENDER_VERSION } from '../src/versions.ts';
import { descriptorFor } from './descriptors.ts';
import { GOLDEN_CASES, goldenSpec, readGolden } from './golden-cases.ts';
import { tinyBackers, validators } from './load.ts';

const MEASURE = 'validator_stake_current_epoch';
function specFor(s: Snapshot, choices: ProposeChoices = {}) {
  const d = descriptorFor(s, { measure: MEASURE });
  return buildSpec({ network: d.id, sha256: snapshotSha256(s), choices }, d, s).spec;
}

describe('readFlower', () => {
  const s = validators();
  const spec = specFor(s, { segments: 'backers' });
  const reading = readFlower(spec, s);

  test('petals in order, each with who, how much and what its encodings resolve to', () => {
    expect(reading.petal).toBe('reading/v1');
    expect(reading.title).toBe('NEAR validators');
    expect(reading.petals).toHaveLength(61);
    expect(reading.petals.map((p) => p.index)).toEqual(reading.petals.map((_, i) => i));
    expect(reading.petals[0]).toMatchObject({
      id: 'astro-stakers.poolv1.near',
      rank: 1,
      share: 0.056071,
      kind: 'staking_pool',
      colour: 'staking_pool',
    });
    for (const p of reading.petals) {
      expect(p.width).toBeGreaterThanOrEqual(1);
      expect(p.width).toBeLessThanOrEqual(2);
      expect(p.height).toBeGreaterThanOrEqual(0.03);
      expect(p.height).toBeLessThanOrEqual(1);
    }
    expect(reading.petals.at(-1)).toMatchObject({
      id: '__tail',
      tail: true,
      count: 311,
      colour: 'tail',
      outline: null,
      segments: [],
    });
  });

  test('ids are the snapshot account ids, so readings on one chain compare', () => {
    expect(reading.chain).toBe('near:mainnet');
    const accounts = new Set(s.participants.map((p) => p.id));
    for (const p of reading.petals.filter((x) => !x.tail)) expect(accounts.has(p.id)).toBe(true);
    const other = readFlower(specFor(s, { petals: 5 }), s);
    const ids = new Set(reading.petals.map((p) => p.id));
    for (const p of other.petals.filter((x) => !x.tail)) expect(ids.has(p.id)).toBe(true);
  });

  test('segments are fractions of the bar, bottom to top', () => {
    const segs = reading.petals[0]?.segments ?? [];
    expect(segs.map((x) => x.key)).toEqual(['other', 'large', 'liquid', 'lockup']);
    expect(segs.reduce((t, x) => t + x.frac, 0)).toBeCloseTo(1, 4);
  });

  test('no pixels and no look: no SVG, CSS class, colour or coordinate', () => {
    const text = JSON.stringify(reading);
    for (const look of ['<svg', 'var(--', '"cls"', '"swatch"', '"cx"', '"sides"', 'c-pool'])
      expect(text, look).not.toContain(look);
    expect(Object.keys(reading).sort()).toEqual(
      ['chain', 'details', 'encodings', 'legend', 'petal', 'petals', 'spec_sha256', 'title'].sort(),
    );
    // legend keys say what they stand for; only a skin gives them a swatch
    const colour = reading.legend.find((l) => l.primitive === 'colour');
    expect(colour?.keys?.[0]).toEqual({ key: 'staking_pool', label: 'pool' });
  });

  test('renderFlower is the reading plus the skin: same details, same legend words', () => {
    const r = renderFlower(spec, s);
    // The same details, but for the tail's wording: the one look paints it in a tone, not hatched.
    const unhatched = reading.details.map((d) => ({
      ...d,
      values: d.values.map((v) => ({ ...v, explains: v.explains.replace(/^hatched: /, '') })),
    }));
    expect(r.petals).toEqual(unhatched);
    // The legend is what the look draws: the reading's lines for the dimensions it paints.
    const drawnHere = ['width', 'height', 'colour', 'segments', 'order', 'tail'];
    expect(r.legend.map((l) => l.primitive)).toEqual(
      reading.legend.map((l) => l.primitive).filter((x) => drawnHere.includes(x)),
    );
    const drawn = SKINS[RENDER_VERSION](reading, { size: 800, thumb: false });
    expect(drawn.svg).toBe(r.svg);
  });

  test('a look drawn from the reading alone: the bytes change, the reading does not', () => {
    const before = readingHash(reading);
    const bars = (x: Reading) =>
      x.petals
        .map((p) => `<rect data-p="${p.id}" width="${p.width}" height="${p.height}"/>`)
        .join('');
    expect(bars(reading)).not.toBe(renderFlower(spec, s).svg);
    expect(readingHash(reading)).toBe(before);
    expect(readingHash(readFlower(spec, structuredClone(s)))).toBe(before);
  });

  test('another choice reads differently; the same spec in another key order reads the same', () => {
    const other = readFlower(specFor(s, { width: 'equal' }), s);
    expect(new Set(other.petals.map((p) => p.width))).toEqual(new Set([1]));
    expect(readingHash(other)).not.toBe(readingHash(reading));
    const reverse = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(reverse)
        : x && typeof x === 'object'
          ? Object.fromEntries(
              Object.entries(x)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : x;
    expect(readingHash(readFlower(reverse(spec) as typeof spec, s))).toBe(readingHash(reading));
  });

  test('colour by identity, single colour and no outline resolve to their keys', () => {
    const t = tinyBackers();
    const byIdentity = readFlower(specFor(t, { colour: 'identity' }), t);
    expect(byIdentity.petals.every((p) => ['named', 'anonymous'].includes(p.colour))).toBe(true);
    const single = readFlower(specFor(t, { colour: 'single', outline: 'none' }), t);
    expect(new Set(single.petals.map((p) => p.colour))).toEqual(new Set(['single']));
    expect(single.petals.every((p) => p.outline === null)).toBe(true);
    expect(single.legend.find((l) => l.primitive === 'colour')?.keys).toEqual([
      { key: 'single', label: 'every petal' },
    ]);
  });

  test('every golden flower reads, and its reading names its spec', () => {
    for (const c of GOLDEN_CASES)
      expect(readGolden(c).spec_sha256).toBe(readFlower(goldenSpec(c), c.snapshot()).spec_sha256);
  });
});
