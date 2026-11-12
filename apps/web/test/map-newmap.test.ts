// Elco, 12 Nov on /make: "mapping something new is a ceremony ... if it's completely new, than we have a 'place
// holder' ... there should be a recognizable 'state'"; while work runs the map stays, a small strip on it; the
// result lands on the map as a new layer.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { SHAPE } from '../flower/ring.ts';
import { freePlace, type Place } from '../landscape/places.ts';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

test('a new map stands in the first free place, clear of every flower, as big as the middling one', () => {
  const on: Place[] = [
    { id: 'a', chain: 'c', x: 0, y: 0, s: 1 },
    { id: 'b', chain: 'c', x: 300, y: 0, s: 2 },
    { id: 'd', chain: 'c', x: 0, y: 300, s: 1 },
  ];
  const p = freePlace(on, { x: 0, y: 0, r: 600 }, 'c', 'new:x');
  expect(p.s).toBe(1);
  for (const q of on)
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThanOrEqual(SHAPE.R * (q.s + p.s));
  // the same place each time, so its reading lands where its placeholder stood
  expect(freePlace(on, { x: 0, y: 0, r: 600 }, 'c', 'new:x')).toEqual(p);
});

test('the placeholder, the strip of work and the landed reading', () => {
  const canvas = text('landscape/LandscapeCanvas.tsx');
  expect(canvas).toMatch(/placeholder\?: \{ chain: string; name: string \} \| null \| undefined;/);
  expect(canvas).toMatch(
    /progress\?: \{ map: string \| 'new'; words: string; share: number \| null \} \| null \| undefined;/,
  );
  expect(canvas).toMatch(/landed\?: MapLanded \| null \| undefined;/);
  expect(canvas).toMatch(
    /const data = useMemo\(\(\) => withLanded\(given, landed\), \[given, landed\]\);/,
  );
  expect(canvas).toMatch(
    /const at = home \? spreadPlace\(pendingPlace, home, spreadOf\(gravity\)\) : pendingPlace;/,
  );
  const scene = text('landscape/scene.ts');
  expect(scene).toMatch(/mark: \{ logo: null, symbol: '', types: \['new'\] \}/);
  expect(scene).toMatch(/named \? named\.y1 \+ 8 : at\.c\.y \+ at\.r \+ 10 \+ LABEL_HEIGHT \+ 6/);
  expect(scene).toMatch(
    /const taken: Box\[\] = \[\.\.\.over, \.\.\.\(stripBox \? \[stripBox\] : \[\]\)\];/,
  );
});

test("on the map a flower's own title keeps quiet: the map's badge names it", () => {
  expect(text('flower/drive.ts')).toMatch(
    /const mk = view\s+\? \{\s+\.\.\.spoken,\s+titleInside: \{ \.\.\.spoken\.titleInside, opacity: 0 \},/,
  );
});
