// "Everyone else", one petal (11 Nov): as tall as the share it holds, made of its members as stripes,
// the smallest nearest the centre.
import { describe, expect, test } from 'vitest';
import { readFlower } from '../src/reading/index.ts';
import { renderFlower } from '../src/render/index.ts';
import { FOLD_CELLS, foldOf, foldPath } from '../src/render/wedge/fold.ts';
import { lookFills } from '../src/render/wedge/keys.ts';
import { lay, newRing } from '../src/render/wedge/ring.ts';
import { DEFAULT_VIEW } from '../src/view/index.ts';
import { GOLDEN_CASES, goldenSpec } from './golden-cases.ts';

describe('the folded tail', () => {
  test('stacks its members smallest first, as shares of their sum, which is its height', () => {
    const { fold, height } = foldOf([0.1, 0.4, 0.2, 0.3]);
    expect(height).toBeCloseTo(1, 12);
    expect(fold.cells.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  test('every member is in it, and a long tail joins neighbours into at most FOLD_CELLS stripes', () => {
    const hs = Array.from({ length: 5000 }, (_, i) => (i + 1) / 1e6);
    const { fold, height } = foldOf(hs);
    expect(fold.cells.length).toBeLessThanOrEqual(FOLD_CELLS);
    expect(height).toBeCloseTo(
      hs.reduce((a, b) => a + b, 0),
      9,
    );
  });

  test('is drawn as one path of stripes, no NaN', () => {
    const ring = newRing(3);
    lay(ring, Float64Array.from([1, 1, 1]), Float64Array.from([100, 50, 60]), 0);
    const d = foldPath(ring, 2, foldOf([0.3, 0.2, 0.1, 0.1]).fold);
    expect(d.match(/M/g)).toHaveLength(4);
    expect(d).not.toContain('NaN');
  });
});

describe('the reading carries the stripes (since 11 Nov: every flower, live and still)', () => {
  const c = GOLDEN_CASES.find(
    (g) => g.name === 'near-validators-default',
  ) as (typeof GOLDEN_CASES)[0];
  const r = readFlower(goldenSpec(c), c.snapshot(), DEFAULT_VIEW);
  const tail = r.petals.find((p) => p.tail);

  test("the tail's members, smallest first, as shares of all it holds; no other petal has any", () => {
    const fold = tail?.fold ?? [];
    expect(fold.length).toBeGreaterThan(1);
    expect(fold.length).toBeLessThanOrEqual(FOLD_CELLS);
    expect(fold.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    // smallest first; the last stripe may join fewer neighbours than the rest, so it alone may be less
    const joined = fold.slice(0, -1);
    expect(joined).toEqual([...joined].sort((a, b) => a - b));
    expect(r.petals.filter((p) => !p.tail && p.fold)).toEqual([]);
  });

  test('the look hands them on, and the still draws them as stripes', () => {
    expect(lookFills(r.petals).folds[tail?.id ?? '']?.cells).toEqual(tail?.fold);
    const svg = renderFlower(goldenSpec(c), c.snapshot(), { view: DEFAULT_VIEW }).svg;
    const d = /data-p="__tail" data-i="\d+" d="([^"]+)"/.exec(svg)?.[1] ?? '';
    expect(d.match(/M/g)?.length).toBe(tail?.fold?.length);
  });
});
