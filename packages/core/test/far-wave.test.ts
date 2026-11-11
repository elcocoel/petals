// The far wave (#84): one soft ring from a flower's own heights, smoothed round the circle so wallets merge, with
// a hole for the organisation's mark. Drawn only by the map bench in /lab until Elco has seen it.
import { describe, expect, test } from 'vitest';
import { FAR_WAVE, farPath, farRuns, waveHeights, waveReach } from '../src/render/wedge/far.ts';
import { modelOf } from '../src/render/wedge/model.ts';
import { SHAPE } from '../src/render/wedge/ring.ts';
import { GOLDEN_CASES, readGolden } from './golden-cases.ts';

const c = GOLDEN_CASES.find(
  (g) => g.name === 'near-validators-default',
) as (typeof GOLDEN_CASES)[0];
const m = modelOf(readGolden(c));

describe('the far wave', () => {
  test('comes from the petals: highest where the tallest petals are, never above them', () => {
    const hs = waveHeights(m);
    expect(hs).toHaveLength(FAR_WAVE.points);
    const tallest = Math.max(...m.height);
    expect(Math.max(...hs)).toBeLessThanOrEqual(tallest + 1e-9);
    expect(Math.max(...hs)).toBeGreaterThan(0);
    // the largest validators go first, clockwise from twelve: the wave is higher just after twelve than opposite
    expect(hs[2] as number).toBeGreaterThan(hs[FAR_WAVE.points / 2] as number);
  });

  test('is one closed path with a hole, and no gaps between wallets', () => {
    const d = farPath(m, SHAPE);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toContain('C');
    expect(d).not.toContain('NaN');
    expect(waveReach(m, SHAPE)).toBeGreaterThan(SHAPE.r0 / SHAPE.R);
    expect(waveReach(m, SHAPE)).toBeLessThanOrEqual(1);
  });
});

describe('the far wave in its colours', () => {
  test('one shape per run of one colour round the circle, together the whole ring', () => {
    const fills = Array.from(m.petals, (_, i) => (i < 10 ? '#8BC9BD' : '#96D4E3'));
    const runs = farRuns(m, SHAPE, fills);
    expect(new Set(runs.map((r) => r.fill))).toEqual(new Set(['#8BC9BD', '#96D4E3']));
    for (const r of runs) expect(r.d).not.toContain('NaN');
  });
});
