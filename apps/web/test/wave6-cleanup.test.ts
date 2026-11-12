// Elco, 12 Nov, wave 4 walk: "look at how many visual behaviors are bugging in relation to the proposal and things
// change sizes ... I thought it was cute that there is a mini map of the dial that shows up at high zoom. The place
// where it's showing up is pretty weird. I think it should be on the top right as if I was playing a video game."
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { expect, test } from 'vitest';
import type { View } from '../flower/camera.ts';
import { marks } from '../flower/marks.ts';
import { modelOf } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');
const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const m = modelOf(
  (
    JSON.parse(readFileSync(join(GOLDEN, 'near-validators-default.reading.json'), 'utf8')) as {
      reading: Reading;
    }
  ).reading,
);
const W = 1440;
const H = 900;
const at = (k: number): View => ({
  k,
  x: W / 2 - SHAPE.cx * k,
  y: H / 2 - SHAPE.cy * k,
  width: W,
  height: H,
});

test('the proposals sit on their petals as the petals move: drawn from the ring as it is now', () => {
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(/if \(ringMoved && votes\) arcsOn\(ring\);/);
  expect(scene).toMatch(/const d = placeArc\(ring, s\.pl\.petal, s\.pl\.step\);/);
});

test('the small dial stands at the top right, left of any box there', () => {
  const k = 12;
  const free = marks(m, at(k), null).map;
  expect(free.x).toBeGreaterThan(W / 2);
  expect(free.y).toBeLessThan(H / 4);
  const box = { x0: W - 400, y0: 0, x1: W, y1: H };
  const slid = marks(m, at(k), null, m.ring, undefined, false, -1, [box]).map;
  expect(slid.x + slid.size).toBeLessThanOrEqual(box.x0);
});

test("a petal opening slides the flower's mark and name with its ring", () => {
  expect(text('landscape/useLandscape.ts')).toMatch(
    /if \(ox \|\| oy\) slid\.set\(i, \{ x: ox \* view\.k, y: oy \* view\.k \}\);/,
  );
  expect(text('landscape/scene.ts')).toMatch(/const moved = slid\?\.get\(i\);/);
});
