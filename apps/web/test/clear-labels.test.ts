// META's QA, 12 Nov (checked by PM): "labels never sit on each other or run off the window". A flower's notes
// give way to what's already on the screen (the map's names, its neighbours' names, the boxes over the map); the
// chosen petal's note slides clear of a box; the neighbours' names stay inside the window; the flower that speaks
// is drawn under the names; a folded stack's count finds a free place or keeps quiet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { expect, test } from 'vitest';
import type { View } from '../flower/camera.ts';
import { marks } from '../flower/marks.ts';
import { modelOf } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading = (name: string): Reading =>
  JSON.parse(readFileSync(join(GOLDEN, `${name}.reading.json`), 'utf8')).reading;
const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

const m = modelOf(reading('near-validators-default'));
const W = 1440;
const H = 900;
const at = (k: number): View => ({
  k,
  x: W / 2 - SHAPE.cx * k,
  y: H / 2 - SHAPE.cy * k,
  width: W,
  height: H,
});

const hit = (
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test("the notes give way to what's already on the screen", () => {
  const free = marks(m, at(2.6), null);
  const seen = free.notes.filter((n) => n.opacity > 0.5);
  expect(seen.length).toBeGreaterThan(0);
  const first = seen[0] as (typeof seen)[number];
  const box = {
    x0: first.x - 4,
    y0: first.y - 14,
    x1: first.x + first.width + 4,
    y1: first.elbowY + 4,
  };
  const given = marks(m, at(2.6), null, m.ring, undefined, false, -1, [box]);
  for (const n of given.notes.filter((n) => n.opacity > 0.05))
    expect(hit({ x0: n.x, y0: n.y - 12, x1: n.x + n.width, y1: n.elbowY }, box)).toBe(false);
});

test("the chosen petal's note slides clear of a box over the map", () => {
  const chosen = m.order[0] as number;
  // big enough that a click's note shows (DETAIL.hover)
  const k = 140 / m.R;
  const kept = marks(m, at(k), null, m.ring, undefined, false, chosen);
  const note = kept.notes.find((n) => n.index === chosen);
  expect(note).toBeDefined();
  const n = note as NonNullable<typeof note>;
  const panel = { x0: n.x - 10, y0: 0, x1: W, y1: H };
  const slid = marks(m, at(k), null, m.ring, undefined, false, chosen, [panel]).notes.find(
    (o) => o.index === chosen,
  );
  expect(slid).toBeDefined();
  const s = slid as NonNullable<typeof slid>;
  expect(s.x + s.width).toBeLessThanOrEqual(panel.x0);
});

test('on the map: the boxes over it, the names inside the window, the speaker under the names', () => {
  const land = text('landscape/useLandscape.ts');
  expect(land).toMatch(/document\.querySelectorAll<HTMLElement>\('section\[data-float\]'\)/);
  expect(land).toMatch(
    /if \(driveFlower\(d, dt, view, i !== speaking, scene\.taken\(\)\)\) moving = true;/,
  );
  expect(land).toMatch(/if \(onTop\) node\.insertBefore\(d\.scene\.root, scene\.top\);/);
  expect(land).toMatch(
    /pointer\.inside && i === under && \(entered < 0 \|\| i === entered\) && pointedWay < 0;/,
  );
  expect(text('components/ui/FloatBox.tsx')).toMatch(/data-float=""/);
  const scene = text('landscape/scene.ts');
  expect(scene).toMatch(/const placed: Box\[\] = \[\.\.\.over\];/);
  expect(scene).toMatch(/const taken: Box\[\] = \[\.\.\.over, /);
  expect(scene).toMatch(
    /x0 = Math\.min\(view\.width - EDGE \/ 2 - w, Math\.max\(left \+ EDGE \/ 2, x0\)\);/,
  );
  expect(text('flower/scene.ts')).toMatch(/s\.label\.set\('display', free \? 'inline' : 'none'\);/);
});
