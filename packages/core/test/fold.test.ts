// "Everyone else", folded (#76): its members packed as cells in a few columns, each as tall as its own petal would
// be; the block never passes for one wallet, and its room grows slowly with how many it folds.
import { describe, expect, test } from 'vitest';
import { COLUMN_CELLS, foldOf, foldPath, foldRoom } from '../src/render/wedge/fold.ts';
import { lay, newRing } from '../src/render/wedge/ring.ts';

describe('the folded tail', () => {
  test('deals its members into columns largest first, one each in turn', () => {
    const { fold, tallest } = foldOf([0.1, 0.4, 0.2, 0.3], 2);
    // columns: [0.4, 0.2] and [0.3, 0.1]; the tallest is 0.6
    expect(tallest).toBeCloseTo(0.6, 12);
    expect(fold.columns.map((c) => c.map((x) => Math.round(x * 1000) / 1000))).toEqual([
      [0.667, 0.333],
      [0.5, 0.167],
    ]);
  });

  test('every member is in it: the cells add up to all of their heights', () => {
    const hs = Array.from({ length: 96 }, (_, i) => 0.02 / (i + 1));
    const { fold, tallest } = foldOf(hs, foldRoom(96));
    const sum = fold.columns.flat().reduce((a, b) => a + b, 0) * tallest;
    expect(sum).toBeCloseTo(
      hs.reduce((a, b) => a + b, 0),
      12,
    );
  });

  test('a long column joins neighbours, never more than COLUMN_CELLS cells', () => {
    const { fold } = foldOf(
      Array.from({ length: 5000 }, () => 0.001),
      3,
    );
    for (const c of fold.columns) expect(c.length).toBeLessThanOrEqual(COLUMN_CELLS);
  });

  test('is drawn as one path of cells, no NaN', () => {
    const ring = newRing(3);
    lay(ring, Float64Array.from([1, 1, 3]), Float64Array.from([100, 50, 60]), 0);
    const d = foldPath(ring, 2, foldOf([0.3, 0.2, 0.1, 0.1], 3).fold);
    expect(d.match(/M/g)?.length).toBeGreaterThanOrEqual(3);
    expect(d).not.toContain('NaN');
  });
});

describe("the folded tail's room", () => {
  test('one petal, and one more for each tenfold of members, never as many as it folds', () => {
    expect(foldRoom(1)).toBe(1);
    expect(foldRoom(10)).toBe(2);
    expect(foldRoom(96)).toBeCloseTo(2.98, 2);
    expect(foldRoom(690_983)).toBeLessThan(7);
  });
});
