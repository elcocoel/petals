// "Everyone else", one petal (#76; Elco, 11 Nov): as tall as the share it holds, made of its members as stripes,
// the smallest nearest the centre.
import { describe, expect, test } from 'vitest';
import { FOLD_CELLS, foldOf, foldPath } from '../src/render/wedge/fold.ts';
import { lay, newRing } from '../src/render/wedge/ring.ts';

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
