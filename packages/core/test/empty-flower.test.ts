// A flower with nothing to draw (a reading with no petals, or petals that are all zero) still writes only valid SVG
// paths: no path of a lone 'Z', which browsers reject, and no NaN.
import { expect, test } from 'vitest';
import type { Reading } from '../src/index.ts';
import { FAR_WAVE, farPath, farRuns } from '../src/render/wedge/far.ts';
import { bandCorners, insetBy, roundedPath } from '../src/render/wedge/highlight.ts';
import { modelOf } from '../src/render/wedge/model.ts';
import {
  bandPath,
  polygonPath,
  roundTopPath,
  SHAPE,
  silhouettePath,
} from '../src/render/wedge/ring.ts';

const valid = (d: string) => d === '' || (/^M/.test(d) && !/NaN/.test(d));

const zero = (i: number) => ({
  index: i,
  id: `a${i}`,
  label: `a${i}`,
  kind: 'unknown',
  identity: null,
  amount: '0',
  share: 0,
  rank: i + 1,
  name: `a${i}`,
  width: 0,
  height: 0,
  colour: 'unknown',
  outline: null,
  segments: [],
});

test('a flower with no petals draws its ring as a circle, and no bands', () => {
  const m = modelOf({ title: 'empty', petals: [] } as unknown as Reading);
  expect(m.n).toBe(0);
  const ring = polygonPath(m.ring);
  expect(valid(ring)).toBe(true);
  expect(ring).not.toBe('Z');
  expect(valid(silhouettePath(m.ring))).toBe(true);
  expect(valid(farPath(m, SHAPE, FAR_WAVE))).toBe(true);
  expect(farRuns(m, SHAPE, [], FAR_WAVE)).toEqual([]);
  expect(roundedPath([], 2)).toBe('');
});

test('a flower whose petals are all zero draws valid paths', () => {
  for (const n of [1, 3, 8]) {
    const m = modelOf({
      title: 'zero',
      petals: Array.from({ length: n }, (_, i) => zero(i)),
    } as unknown as Reading);
    expect(valid(polygonPath(m.ring))).toBe(true);
    expect(valid(silhouettePath(m.ring))).toBe(true);
    expect(valid(bandPath(m.ring, 0, 0, 1))).toBe(true);
    expect(valid(farPath(m, SHAPE, FAR_WAVE))).toBe(true);
    for (const run of farRuns(
      m,
      SHAPE,
      m.petals.map(() => '#000'),
      FAR_WAVE,
    ))
      expect(valid(run.d)).toBe(true);
  }
});

const petal = (i: number, share: number) => ({
  ...zero(i),
  amount: String(share * 100),
  share,
  width: 1,
  height: share,
});

/** Every path a flower writes for its petals: the ring, the silhouette, each wedge, its far shape and bands, and a lit
 * petal's rounded piece. */
const everyPath = (m: ReturnType<typeof modelOf>): string[] => [
  polygonPath(m.ring),
  silhouettePath(m.ring),
  farPath(m, SHAPE, FAR_WAVE),
  ...farRuns(
    m,
    SHAPE,
    m.petals.map(() => '#000'),
    FAR_WAVE,
  ).map((r) => r.d),
  ...m.petals.flatMap((_, i) => {
    const h = m.ring.h[i] as number;
    const inset = insetBy(bandCorners(m.ring, i, 0, h), 1);
    return [bandPath(m.ring, i, 0, h), roundTopPath(m.ring, i, h), roundedPath(inset ?? [], 2)];
  }),
];

test('a flower of one petal draws valid paths, whether it holds something or nothing', () => {
  for (const petals of [[petal(0, 1)], [zero(0)]]) {
    const m = modelOf({ title: 'one', petals } as unknown as Reading);
    expect(m.n).toBe(1);
    for (const d of everyPath(m)) {
      expect(d).not.toBe('Z');
      expect(valid(d)).toBe(true);
    }
  }
});
