// Small groups show up well too. A flower of fewer than FEW petals keeps each as wide as in a flower of FEW, the
// petals evenly round the circle with open circle between, the first at twelve; one or two people drew nothing
// before (a wedge of half the circle or more has no side to stand on).
import { describe, expect, test } from 'vitest';
import { FEW, lay, newRing, polygonPath, roundTopPath, SHAPE } from '../src/render/wedge/ring.ts';

const TAU = Math.PI * 2;
const layOf = (n: number) => {
  const ring = newRing(n);
  lay(ring, new Float64Array(n).fill(1), new Float64Array(n).fill(100), 0);
  return ring;
};

describe('a flower of few', () => {
  test.each([1, 2, 3, 4])(
    '%i petals: each drawn, as wide as one of FEW, centred on its even slot',
    (n) => {
      const ring = layOf(n);
      for (let i = 0; i < n; i++) {
        const d = roundTopPath(ring, i, 100);
        expect(d).not.toMatch(/NaN|Infinity/);
        const w = (ring.end[i] as number) - (ring.start[i] as number);
        expect(w).toBeCloseTo(TAU / FEW, 6);
        expect(((ring.start[i] as number) + (ring.end[i] as number)) / 2).toBeCloseTo(
          (i * TAU) / n,
          6,
        );
      }
      // the centre is the circle the feet stand on
      expect(polygonPath(ring)).toMatch(/A/);
    },
  );

  test('five or more tile the circle, as always', () => {
    const ring = layOf(FEW);
    for (let i = 0; i < FEW; i++) expect(ring.end[i]).toBeCloseTo(ring.start[i + 1] as number, 9);
    expect(polygonPath(ring)).not.toMatch(/A/);
    expect(SHAPE.r0).toBeGreaterThan(0);
  });
});
