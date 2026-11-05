// The copy of layout() and band() (lab/flower/ring.ts) held to the golden SVGs they came from, and to
// the rule that matters most: however it's swollen, the polygon stays closed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { bandPath, lay, newRing, polygonPath, restOf, SHAPE } from '../lab/flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading = (name: string): Reading =>
  JSON.parse(readFileSync(join(GOLDEN, `${name}.reading.json`), 'utf8')).reading;
const svg = (name: string): string => readFileSync(join(GOLDEN, `${name}.svg`), 'utf8');
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

const NAMES = ['near-validators-default', 'near-validators-backers', 'house-of-stake-default'];

describe('the same flower as the golden', () => {
  test.each(NAMES)('%s: its polygon', (name) => {
    const { ring, width } = restOf(reading(name).petals);
    const poly = svg(name).match(/class="petal-poly" d="([^"]+)"/)?.[1] ?? '';
    const golden = numbers(poly);
    expect(golden.length).toBe(width.length * 2);
    width.forEach((_, i) => {
      expect(ring.ax[i]).toBeCloseTo(golden[i * 2] as number, 1);
      expect(ring.ay[i]).toBeCloseTo(golden[i * 2 + 1] as number, 1);
    });
  });

  test.each(NAMES)('%s: every whole bar', (name) => {
    const { ring, height } = restOf(reading(name).petals);
    const bars = [...svg(name).matchAll(/id="s-(\d+)-bar"[^>]* d="([^"]+)"/g)];
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      const i = Number(bar[1]);
      const mine = numbers(bandPath(ring, i, 0, height[i] as number));
      const golden = numbers(bar[2] as string);
      expect(mine.length).toBe(golden.length);
      mine.forEach((x, at) => {
        expect(x).toBeCloseTo(golden[at] as number, 1);
      });
    }
  });
});

describe('the polygon', () => {
  const { petals } = reading('near-validators-default');
  const rest = restOf(petals);

  test('closes, however the widths change', () => {
    const widths = Float64Array.from(rest.width, (w, i) => w * (i === 5 ? 4 : i < 9 ? 2.5 : 0.7));
    const ring = newRing(rest.width.length);
    lay(ring, widths, rest.height, 0.4);
    expect(ring.start[ring.n]).toBeCloseTo(Math.PI * 2, 9);
    for (let i = 0; i < ring.n; i++) {
      const next = (i + 1) % ring.n;
      const gap = Math.hypot(
        (ring.ax[next] as number) - (ring.bx[i] as number),
        (ring.ay[next] as number) - (ring.by[i] as number),
      );
      expect(gap).toBeLessThan(1.2);
      // every corner stays on the circle, near enough: the gap takes it just inside
      const r = Math.hypot((ring.ax[i] as number) - SHAPE.cx, (ring.ay[i] as number) - SHAPE.cy);
      expect(r).toBeLessThanOrEqual(SHAPE.r0 + 1e-9);
      expect(r).toBeGreaterThan(SHAPE.r0 - 1);
    }
  });

  test('has straight edges only', () => {
    const ring = rest.ring;
    expect(polygonPath(ring)).toMatch(/^M[-\d. L]+Z$/);
    expect(bandPath(ring, 0, 0, 10)).toMatch(/^M[-\d. L]+Z$/);
  });
});
