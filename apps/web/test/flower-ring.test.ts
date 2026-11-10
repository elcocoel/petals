// The ring. Its circle is layout()'s, held to the golden SVGs: the same angles, the same polygon, the
// same heights. Its petals are wedges, held here to what a wedge has to be.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { GUTTER } from '../flower/feel.ts';
import {
  bandPath,
  insideWedge,
  lay,
  leftAt,
  newRing,
  polygonPath,
  type Ring,
  restOf,
  rightAt,
  SHAPE,
  widthAt,
  widthBefore,
} from '../flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading = (name: string): Reading =>
  JSON.parse(readFileSync(join(GOLDEN, `${name}.reading.json`), 'utf8')).reading;
const svg = (name: string): string => readFileSync(join(GOLDEN, `${name}.svg`), 'utf8');
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

const NAMES = ['near-validators-default', 'near-validators-backers', 'house-of-stake-default'];
const { cx, cy, r0 } = SHAPE;

/** A boundary's corner on the polygon. */
const vertex = (r: Ring, i: number): [number, number] => [
  cx + r0 * (r.ux[i] as number),
  cy + r0 * (r.uy[i] as number),
];
const dot = (a: number[], b: number[]) =>
  (a[0] as number) * (b[0] as number) + (a[1] as number) * (b[1] as number);
const cross = (a: number[], b: number[]) =>
  (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number);
const minus = (a: readonly number[], b: readonly number[]) => [
  (a[0] as number) - (b[0] as number),
  (a[1] as number) - (b[1] as number),
];

describe('the same circle as the golden', () => {
  test.each(NAMES)(
    "%s: the golden's polygon is this ring's (the one look draws from it)",
    (name) => {
      const { ring } = restOf(reading(name).petals);
      const poly = svg(name).match(/class="petal-poly"[^>]* d="([^"]+)"/)?.[1] ?? '';
      expect(poly).toBe(polygonPath(ring));
    },
  );

  test.each(NAMES)('%s: every height exactly the reading, with no curve and no floor', (name) => {
    const r = reading(name);
    const { height } = restOf(r.petals);
    r.petals.forEach((p, i) => {
      expect(height[i]).toBe(p.height * SHAPE.L);
    });
    for (const bar of svg(name).matchAll(/id="s-(\d+)-bar"[^>]* d="([^"]+)"/g)) {
      const d = numbers(bar[2] as string);
      const goldenH = Math.hypot(
        (d[0] as number) - (d[6] as number),
        (d[1] as number) - (d[7] as number),
      );
      expect(height[Number(bar[1])]).toBeCloseTo(goldenH, 1);
    }
  });
});

describe('a wedge', () => {
  const { petals } = reading('near-validators-default');
  const rest = restOf(petals);
  const ring = rest.ring;
  const heights = [0, 40, 120, 190];

  test('takes up its whole angle: the only thing between two wedges is one thin line', () => {
    for (let i = 0; i < ring.n; i++) {
      const next = (i + 1) % ring.n;
      // measured square to the boundary they share, at the base, the tip, and between
      const u = [ring.ux[next] as number, ring.uy[next] as number];
      for (const h of heights) {
        const gap = Math.abs(cross(minus(leftAt(ring, next, h), rightAt(ring, i, h)), u));
        expect(gap).toBeCloseTo(GUTTER, 6);
      }
    }
  });

  test('has straight radial sides: each runs parallel to the boundary it stands on', () => {
    for (const i of [0, 7, 30, 60]) {
      const up = minus(leftAt(ring, i, 190), leftAt(ring, i, 0));
      expect(Math.abs(cross(up, [ring.ux[i] as number, ring.uy[i] as number]))).toBeLessThan(1e-9);
      expect(dot(up, [ring.ux[i] as number, ring.uy[i] as number])).toBeGreaterThan(0);
      const other = minus(rightAt(ring, i, 190), rightAt(ring, i, 0));
      expect(
        Math.abs(cross(other, [ring.ux[i + 1] as number, ring.uy[i + 1] as number])),
      ).toBeLessThan(1e-9);
    }
  });

  test('gets wider with the radius, as the reference does', () => {
    for (const i of [0, 20]) {
      expect(widthBefore(ring, i, 190)).toBeGreaterThan(widthBefore(ring, i, 0) * 2.5);
    }
  });

  test('sits flush on the polygon', () => {
    for (let i = 0; i < ring.n; i++) {
      const v0 = vertex(ring, i);
      const v1 = vertex(ring, i + 1);
      const side = minus(v1, v0);
      expect(Math.abs(cross(minus(leftAt(ring, i, 0), v0), side))).toBeLessThan(1e-6);
      expect(Math.abs(cross(minus(rightAt(ring, i, 0), v0), side))).toBeLessThan(1e-6);
      expect(leftAt(ring, i, 0)[0]).toBeCloseTo(ring.ax[i] as number, 9);
      expect(rightAt(ring, i, 0)[1]).toBeCloseTo(ring.by[i] as number, 9);
    }
  });

  test('is cut straight across at any height: ends and bands run parallel to its base', () => {
    for (const i of [3, 44]) {
      const base = minus(rightAt(ring, i, 0), leftAt(ring, i, 0));
      for (const h of [33, 150]) {
        const cut = minus(rightAt(ring, i, h), leftAt(ring, i, h));
        expect(Math.abs(cross(cut, base)) / Math.hypot(...(base as [number, number]))).toBeLessThan(
          1e-9,
        );
      }
    }
  });

  test('has straight edges only: four corners and nothing else', () => {
    expect(polygonPath(ring)).toMatch(/^M[-\d. L]+Z$/);
    const d = bandPath(ring, 0, 10, 60);
    expect(d).toMatch(/^M[-\d. L]+Z$/);
    expect(numbers(d)).toHaveLength(8);
  });

  test('a tiny wedge keeps a line it can afford', () => {
    const tiny = restOf(Array.from({ length: 500 }, () => ({ width: 1, height: 0.5 })));
    expect(tiny.ring.gut[0]).toBeLessThan(GUTTER / 2);
    expect(widthBefore(tiny.ring, 0, 0)).toBeGreaterThan(0);
    expect(GUTTER).toBeLessThan(1.1);
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
      expect(gap).toBeLessThan(GUTTER * 1.1);
    }
  });
});

describe('a focused wedge', () => {
  const { petals } = reading('near-validators-default');
  const rest = restOf(petals);
  const flared = (f: number): Ring => {
    const ring = newRing(rest.width.length);
    lay(ring, rest.width, rest.height, 0);
    ring.flare[20] = f;
    return ring;
  };

  test('widens at the tip and leaves its base, and the circle, where they are', () => {
    const ring = flared(0.7);
    const top = ring.h[20] as number;
    expect(widthAt(ring, 20, top)).toBeCloseTo(widthBefore(ring, 20, top) * 1.7, 6);
    expect(widthAt(ring, 20, 0)).toBeCloseTo(widthBefore(ring, 20, 0), 6);
    expect(leftAt(ring, 20, 0)[0]).toBeCloseTo(rest.ring.ax[20] as number, 9);
    expect(rightAt(ring, 20, 0)[0]).toBeCloseTo(rest.ring.bx[20] as number, 9);
    expect(leftAt(ring, 21, 100)).toEqual(leftAt(rest.ring, 21, 100));
  });

  test('is still a wedge: its sides are one straight line from base to tip', () => {
    const ring = flared(1.2);
    const top = ring.h[20] as number;
    const a = leftAt(ring, 20, 0);
    const b = leftAt(ring, 20, top / 2);
    const c = leftAt(ring, 20, top);
    expect(Math.abs(cross(minus(b, a), minus(c, a)))).toBeLessThan(1e-6);
    expect(numbers(bandPath(ring, 20, 0, top))).toHaveLength(8);
  });

  test('is hit where it is drawn: its wider tip counts, past its edge does not', () => {
    const ring = flared(0.7);
    const top = ring.h[20] as number;
    const [lx, ly] = leftAt(ring, 20, top * 0.95);
    const [rx, ry] = rightAt(ring, 20, top * 0.95);
    const across = [rx - lx, ry - ly];
    expect(insideWedge(ring, 20, lx + across[0] * 0.02, ly + across[1] * 0.02)).toBe(true);
    expect(insideWedge(rest.ring, 20, lx + across[0] * 0.02, ly + across[1] * 0.02)).toBe(false);
    expect(insideWedge(ring, 20, lx - across[0] * 0.02, ly - across[1] * 0.02)).toBe(false);
    // beyond the tip and under the base it isn't there
    const mx = ((ring.ax[20] as number) + (ring.bx[20] as number)) / 2;
    const my = ((ring.ay[20] as number) + (ring.by[20] as number)) / 2;
    expect(insideWedge(ring, 20, mx - (ring.nx[20] as number), my - (ring.ny[20] as number))).toBe(
      false,
    );
  });
});
