// T202: a click on the flower, and the petal it leaves marked. Pure, with no browser: the click takes
// what hover has lit, a chosen petal holds its accent and its note, and with nothing chosen nothing changes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PetalDetail, Reading } from '@petal/core/types';
import { behaviours } from '@petal/tokens';
import { describe, expect, test } from 'vitest';
import { flyTo } from '../flower/camera.ts';
import { clickedAt, type Live, newLive, stepLive } from '../flower/live.ts';
import { marks } from '../flower/marks.ts';
import { modelOf } from '../flower/model.ts';
import { scatter } from '../flower/order.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const NAMES = ['near-validators-default', 'near-validators-backers', 'house-of-stake-default'];
const read = (name: string) => ({
  reading: JSON.parse(readFileSync(join(GOLDEN, `${name}.reading.json`), 'utf8'))
    .reading as Reading,
  details: JSON.parse(readFileSync(join(GOLDEN, `${name}.json`), 'utf8')).petals as PetalDetail[],
});
const { reading } = read('near-validators-default');
const model = modelOf(reading);

const W = 1440;
const H = 900;

const start = (): Live => {
  const l = newLive(model, 'dock', W, H, false);
  run(l, 90);
  return l;
};
function run(l: Live, frames: number) {
  for (let i = 0; i < frames; i++) stepLive(l, 1 / 60);
}
/** A screen point on a petal at rest, by its rest geometry. */
function onPetal(l: Live, i: number) {
  const r = model.ring;
  const h = (model.height[i] as number) * 0.5;
  const wx = ((r.ax[i] as number) + (r.bx[i] as number)) / 2 + (r.nx[i] as number) * h;
  const wy = ((r.ay[i] as number) + (r.by[i] as number)) / 2 + (r.ny[i] as number) * h;
  return { x: wx * l.camera.k + l.camera.x, y: wy * l.camera.k + l.camera.y };
}
const point = (l: Live, p: { x: number; y: number }) => {
  l.pointer.x = p.x;
  l.pointer.y = p.y;
  l.pointer.inside = true;
};
const away = (l: Live) => {
  l.pointer.inside = false;
};
const centre = (l: Live) => ({
  x: model.cx * l.camera.k + l.camera.x,
  y: model.cy * l.camera.k + l.camera.y,
});
const shown = (l: Live) =>
  marks(
    model,
    l.camera,
    l.presence.x > 0.001
      ? { index: l.noteIndex, presence: l.presence.x, open: l.open.x[l.noteIndex] as number }
      : null,
    l.ring,
    undefined,
    false,
    l.chosen,
  );

describe('what a click takes', () => {
  test('the petal under it, by the same pick as hover', () => {
    const l = start();
    for (const i of [0, 7, 30, model.n - 1]) {
      const p = onPetal(l, i);
      expect(clickedAt(l, p.x, p.y), `petal ${i}`).toEqual({ kind: 'petal', index: i });
      point(l, p);
      run(l, 60);
      expect(l.focusIndex, `hover agrees on ${i}`).toBe(i);
    }
  });

  test('the tail is a petal like the others, with the id its panel knows', () => {
    const l = start();
    const tail = model.petals.findIndex((p) => p.tail);
    const hit = clickedAt(l, onPetal(l, tail).x, onPetal(l, tail).y);
    expect(hit).toEqual({ kind: 'petal', index: tail });
    expect(model.petals[tail]?.id).toBe('__tail');
  });

  test('the centre, where hover lights nothing', () => {
    const l = start();
    const c = centre(l);
    expect(clickedAt(l, c.x, c.y)).toEqual({ kind: 'centre' });
    expect(clickedAt(l, c.x + 20, c.y - 10)).toEqual({ kind: 'centre' });
  });

  test('the ground, far enough out that hover has let go', () => {
    const l = start();
    const c = centre(l);
    const out = model.R * 1.7 * l.camera.k;
    expect(clickedAt(l, c.x + out, c.y)).toEqual({ kind: 'ground' });
    expect(clickedAt(l, 2, H - 2)).toEqual({ kind: 'ground' });
  });

  test('where hover lights a petal at all brightly, that petal, right to the rim and past it', () => {
    const l = start();
    const c = centre(l);
    expect(clickedAt(l, c.x, c.y - model.R * 1.05 * l.camera.k).kind).toBe('petal');
    expect(clickedAt(l, c.x, c.y - model.r0 * 0.8 * l.camera.k).kind).toBe('petal');
  });

  test('on the focus’s own wider tip, over a neighbour’s angle, it’s the focus, as hover says', () => {
    const l = start();
    point(l, onPetal(l, 30));
    run(l, 120);
    expect(l.focusIndex).toBe(30);
    const r = l.ring;
    const h = r.h[30] as number;
    const wx = ((r.ax[30] as number) + (r.bx[30] as number)) / 2 + (r.nx[30] as number) * h * 0.98;
    const wy = ((r.ay[30] as number) + (r.by[30] as number)) / 2 + (r.ny[30] as number) * h * 0.98;
    const halfTip =
      0.4 *
      Math.hypot(
        (r.bx[30] as number) - (r.ax[30] as number),
        (r.by[30] as number) - (r.ay[30] as number),
      );
    const along = { x: -(r.ny[30] as number), y: r.nx[30] as number };
    const k = l.camera.k;
    const hit = clickedAt(
      l,
      (wx + along.x * halfTip) * k + l.camera.x,
      (wy + along.y * halfTip) * k + l.camera.y,
    );
    expect(hit).toEqual({ kind: 'petal', index: 30 });
  });

  test('an open account is what a click takes, wherever it lands', () => {
    const l = start();
    const k = 14;
    const { x, y } = onPetal(l, 0);
    flyTo(l.camera, {
      k,
      x: x - (x - l.camera.x) * (k / l.camera.k),
      y: y - (y - l.camera.y) * (k / l.camera.k),
    });
    point(l, { x, y });
    run(l, 300);
    expect(l.locked).toBe(true);
    expect(clickedAt(l, 5, 5)).toEqual({ kind: 'petal', index: l.focusIndex });
  });

  test('a flower too small to answer the pointer is one thing: its centre, or the ground around it', () => {
    const l = start();
    flyTo(l.camera, { k: 0.1, x: W / 2 - model.cx * 0.1, y: H / 2 - model.cy * 0.1 });
    run(l, 300);
    const c = centre(l);
    const onIt = model.R * 0.8 * l.camera.k;
    expect(clickedAt(l, c.x + onIt, c.y)).toEqual({ kind: 'centre' });
    expect(clickedAt(l, c.x + model.R * 1.2 * l.camera.k, c.y)).toEqual({ kind: 'ground' });
  });
});

describe('a chosen petal', () => {
  test('keeps its accent when the pointer leaves, and no other does', () => {
    const l = start();
    point(l, onPetal(l, 12));
    run(l, 60);
    l.chosen = 12;
    away(l);
    run(l, 300);
    expect(l.accent.x[12]).toBeCloseTo(1, 3);
    expect(l.presence.x).toBeCloseTo(0, 3);
    for (let i = 0; i < model.n; i++) if (i !== 12) expect(l.accent.x[i]).toBeCloseTo(0, 3);
  });

  test('settles at its true height, and hover still rises on another, then lets it go', () => {
    const l = start();
    l.chosen = 12;
    run(l, 240);
    expect(l.heights[12]).toBeCloseTo(model.height[12] as number, 6);
    point(l, onPetal(l, 40));
    run(l, 180);
    expect(l.focusIndex).toBe(40);
    expect(l.heights[40]).toBeGreaterThan(model.height[40] as number);
    expect(l.heights[12]).toBeCloseTo(model.height[12] as number, 6);
    expect(l.accent.x[40]).toBeCloseTo(1, 2);
    expect(l.accent.x[12]).toBeCloseTo(1, 3);
    away(l);
    run(l, 300);
    expect(l.accent.x[40]).toBeCloseTo(0, 3);
    expect(l.heights[40]).toBeCloseTo(model.height[40] as number, 4);
  });

  test('goes to sleep like the rest: no frame asked for once it has settled', () => {
    const l = start();
    l.chosen = 12;
    run(l, 400);
    expect(stepLive(l, 1 / 60).moving).toBe(false);
  });

  test('keeps its note, its name whole, while the pointer is on another', () => {
    const l = start();
    const long = model.petals.findIndex((p) => p.name.length > 24 && !p.tail);
    const i = long === -1 ? 12 : long;
    l.chosen = i;
    run(l, 240);
    const alone = shown(l).notes.find((n) => n.index === i);
    expect(alone?.text).toBe(model.fullNotes[i]);
    expect(alone?.opacity).toBeGreaterThan(0.5);
    point(l, onPetal(l, (i + 20) % model.n));
    run(l, 180);
    const both = shown(l);
    expect(both.focus?.index).toBe((i + 20) % model.n);
    expect(both.notes.find((n) => n.index === i)?.text).toBe(model.fullNotes[i]);
  });

  test('the note that travels says it while the pointer is on it, and hands it back on leaving', () => {
    const l = start();
    l.chosen = 12;
    point(l, onPetal(l, 12));
    run(l, 180);
    const on = shown(l);
    expect(on.focus?.index).toBe(12);
    expect(on.notes.find((n) => n.index === 12)).toBeUndefined();
    away(l);
    run(l, 240);
    const left = shown(l);
    expect(left.focus).toBeNull();
    expect(left.notes.find((n) => n.index === 12)?.text).toBe(model.fullNotes[12]);
  });

  test('near the window’s edge it slides along it, where another note would fade out', () => {
    const l = newLive(model, 'dock', 390, 844, false);
    run(l, 90);
    // a petal on the right, whose name would run out of a window this narrow
    const i = model.petals.findIndex(
      (p, at) => (model.ring.nx[at] as number) > 0.6 && p.name.length > 20,
    );
    l.chosen = i;
    run(l, 240);
    const note = shown(l).notes.find((n) => n.index === i);
    expect(note?.opacity).toBeGreaterThan(0.9);
    expect(note?.x).toBeGreaterThanOrEqual(0);
    expect((note?.x as number) + (note?.width as number)).toBeLessThanOrEqual(390);
    // its rule stays under its words
    expect(Math.min(note?.elbowX as number, note?.ruleX as number)).toBe(note?.x);
  });

  test('stands first among the notes, and the others give it room', () => {
    const l = start();
    const low = model.n - 2;
    l.chosen = low;
    run(l, 240);
    expect(shown(l).notes[0]?.index).toBe(low);
  });

  test('the zoom still works, and its note goes once its flower is too small to answer', () => {
    const l = start();
    l.chosen = 12;
    run(l, 120);
    flyTo(l.camera, { k: 3, x: W / 2 - model.cx * 3, y: H / 2 - model.cy * 3 });
    run(l, 200);
    expect(l.camera.k).toBeCloseTo(3, 1);
    flyTo(l.camera, { k: 0.1, x: W / 2 - model.cx * 0.1, y: H / 2 - model.cy * 0.1 });
    run(l, 300);
    expect(shown(l).notes.find((n) => n.index === 12)).toBeUndefined();
  });

  test('is the small map’s lit petal when the pointer isn’t on another', () => {
    const l = start();
    l.chosen = 12;
    run(l, 60);
    expect(shown(l).map.litIndex).toBe(12);
  });
});

describe('with nothing chosen', () => {
  test('every mark is the same as it was before there was any such thing', () => {
    const l = start();
    point(l, onPetal(l, 3));
    run(l, 120);
    const focus = { index: l.noteIndex, presence: l.presence.x };
    expect(marks(model, l.camera, focus, l.ring, undefined, false, -1)).toEqual(
      marks(model, l.camera, focus, l.ring),
    );
    expect(l.chosen).toBe(-1);
  });
});

describe('the two records of a petal', () => {
  test.each(NAMES)('%s: the canvas and the panel name every petal the same', (name) => {
    const { reading: r, details } = read(name);
    expect(r.petals.map((p) => p.id)).toEqual(details.map((p) => p.id));
    expect(new Set(r.petals.map((p) => p.id)).size).toBe(r.petals.length);
  });

  test.each(NAMES)('%s: ?order=scatter moves every index and keeps every id', (name) => {
    const { reading: r, details } = read(name);
    const m = modelOf({ ...r, petals: scatter(r.petals) });
    expect(m.petals.map((p) => p.index)).not.toEqual(r.petals.map((p) => p.index));
    for (const d of details) {
      const at = m.petals.findIndex((p) => p.id === d.id);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(m.petals[at]?.share).toBe(d.share);
    }
  });
});

describe('in the behaviour table', () => {
  test.each(['figure.pick', 'figure.petal-picked', 'box.close'])('%s is a view', (name) => {
    const b = behaviours.find((x) => x.name === name);
    expect(b?.via).toBe('view');
    expect(b?.purpose.length).toBeLessThanOrEqual(100);
  });
});
