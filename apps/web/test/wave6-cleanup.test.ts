// The visual behaviours around the proposals hold as things change size, and the small dial (the mini map that
// shows at high zoom) stands at the top right, as in a video game.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { expect, test } from 'vitest';
import type { View } from '../flower/camera.ts';
import { marks } from '../flower/marks.ts';
import { modelOf } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';
import { roomAlong } from '../flower/scene.ts';

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
  expect(scene).toMatch(
    /if \(refit \|\| ringMoved \|\| arcsBehind \|\| !laid\) \{\s+arcsOn\(ring\);/,
  );
  expect(scene).toMatch(
    /placeArc\(ring, s\.pl\.petal, hide \? s\.pl\.step - hide \+ 1 : s\.pl\.step\)/,
  );
});

// Ref Finance's 189, opened, once ran behind the header and across its neighbours' names.
test('an opened stack reaches only as far as there is room, the rest folded into its count', () => {
  // straight up from y 300 in a 900-high window, 16 clear of the top: 284 of room
  expect(roomAlong(500, 300, 0, -1, 1440, 900, [], 16)).toBeCloseTo(284);
  // a box across the way stops it at the box's edge
  const box = { x0: 400, y0: 100, x1: 600, y1: 200 };
  expect(roomAlong(500, 300, 0, -1, 1440, 900, [box], 16)).toBeCloseTo(100);
  // a box beside the way doesn't
  expect(roomAlong(700, 300, 0, -1, 1440, 900, [box], 16)).toBeCloseTo(284);
  // starting under a box: no room
  expect(roomAlong(500, 150, 0, -1, 1440, 900, [box], 16)).toBe(0);
  const scene = text('flower/scene.ts');
  expect(scene).toMatch(/const hide = count <= fit \? 0 : count - \(fit - 1\);/);
  // the arcs hold still while the pointer is on one, so a press lands where it pointed
  expect(scene).toMatch(/if \(votes && \(!laid \|\| \(!overArc && stackPointed === null\)\)\)/);
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

// Arcadia's long line running off once ran from the opened petal to its panel, which stood under Tools.
test("an account's panel stands clear of the boxes over the map, in the first corner with room", () => {
  const k = 12;
  const tools = { x0: 0, y0: 0, x1: 300, y1: H };
  const info = { x0: W - 440, y0: 0, x1: W, y1: H - 260 };
  let seen = 0;
  for (let i = 0; i < Math.min(m.n, 6); i++) {
    const out = marks(m, at(k), { index: i, presence: 1, open: 1 }, m.ring, undefined, false, -1, [
      tools,
      info,
    ]);
    const p = out.panel;
    if (!p) continue;
    seen += 1;
    for (const b of [tools, info]) {
      const apart = p.x >= b.x1 || p.x + p.width <= b.x0 || p.y >= b.y1 || p.y + p.height <= b.y0;
      expect(apart).toBe(true);
    }
  }
  expect(seen).toBeGreaterThan(0);
});

test('a note that is drawn at all holds its place: a fainter one never sits on it', () => {
  const marksTs = text('../../packages/core/src/render/wedge/marks.ts');
  expect(marksTs).toMatch(/const SHOWS = 0\.01;/);
  expect(marksTs).toMatch(/room \*= 1 - ramp\(0, SHOWS, o\.opacity\)/);
});
