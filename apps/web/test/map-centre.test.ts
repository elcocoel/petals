// Elco, 12 Nov walk: "one click put something in the center ... a dashed line on the center for focus all the dowels
// are organized around that ... what everything else gets compared to"; "how could I select two dowels and see only
// those connections".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { footprint, ringsAround } from '../landscape/places.ts';

const at = (id: string, x: number, y: number, s = 1) => ({ id, chain: 'c', x, y, s });

test('the chosen one in the middle; those sharing most nearest; those sharing none past them; no two touch', () => {
  const places = [
    at('a', 0, 0),
    at('b', 500, 0),
    at('c', -800, 300),
    at('d', 40, 900),
    at('e', 1, 1),
  ];
  const shared = [0, 3, 40, 0, 1];
  const { places: out, r } = ringsAround(places, shared, 0, { x: 100, y: 100 });
  const d = (i: number) => Math.hypot((out[i]?.x ?? 0) - 100, (out[i]?.y ?? 0) - 100);
  expect(out[0]).toMatchObject({ x: 100, y: 100 });
  expect(d(2)).toBeLessThanOrEqual(d(1));
  expect(d(1)).toBeLessThanOrEqual(d(4));
  expect(d(4)).toBeLessThan(d(3));
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const p = out[i] as (typeof out)[number];
      const q = out[j] as (typeof out)[number];
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(
        footprint(p.s) + footprint(q.s) - 1e-6,
      );
    }
  expect(r).toBeGreaterThan(d(3));
  expect(out.map((p) => p.s)).toEqual(places.map((p) => p.s));
});

test('a click centres, a click on the centre goes in, Shift shows only the pair, Escape steps back', () => {
  const land = readFileSync(
    join(import.meta.dirname, '..', 'landscape', 'useLandscape.ts'),
    'utf8',
  );
  expect(land).toMatch(/if \(f >= 0 && entered < 0 && add && centre >= 0 && f !== centre\)/);
  expect(land).toMatch(/toCentre\(idOf\(flowers\[f\]\)\)/);
  expect(land).toMatch(
    /if \(\(data\.centre \?\? -1\) >= 0 && entered < 0\) \{\s+at\?\.current\?\.onCentre\?\.\(null\);/,
  );
  const scene = readFileSync(join(import.meta.dirname, '..', 'landscape', 'scene.ts'), 'utf8');
  expect(scene).toMatch(/if \(only !== -1\) o = i === only \? 1 : 0;/);
  expect(scene).toMatch(/'stroke-dasharray': '6 6'/);
});

test("inside a DAO, the neighbours' names stay on the edges; the line and its count show for the way pointed at", () => {
  const scene = readFileSync(join(import.meta.dirname, '..', 'landscape', 'scene.ts'), 'utf8');
  expect(scene).toMatch(
    /const lit = way\.to === wayPointed;\s+a\.g\.set\('opacity', o2\(lit \? enter \* ARROW_TONE : 0\)\);/,
  );
  expect(scene).toMatch(/a\.num\.node\.textContent = count\(way\.shared\);/);
  const land = readFileSync(
    join(import.meta.dirname, '..', 'landscape', 'useLandscape.ts'),
    'utf8',
  );
  expect(land).toMatch(/way: entered >= 0 \? pointedWay : -1,/);
});

test('a new arrangement glides in from where each flower stood, the camera moving to it; reduced motion, at once', () => {
  const land = readFileSync(
    join(import.meta.dirname, '..', 'landscape', 'useLandscape.ts'),
    'utf8',
  );
  expect(land).toMatch(/prior\.layout !== data\.layout &&[\s\S]{0,140}!quiet\(\)\.matches/);
  expect(land).toMatch(/flyNext = fitView\(cam\.width, cam\.height, home, cam\.clear\);/);
  expect(land).toMatch(/const e = glide \* glide \* \(3 - 2 \* glide\);/);
  expect(land).toMatch(
    /places: new Map\(flowers\.map\(\(f\) => \[idOf\(f\) \?\? '', \{ x: f\.place\.x, y: f\.place\.y \}\]\)\)/,
  );
  const scene = readFileSync(join(import.meta.dirname, '..', 'landscape', 'scene.ts'), 'utf8');
  expect(scene).toMatch(/move\(\) \{/);
});
