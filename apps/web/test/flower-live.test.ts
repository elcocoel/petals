// The whole flower from frame to frame, with no browser: hover, travel, the crossing and the way back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fitView, flyTo, zoomWheel } from '../lab/flower/camera.ts';
import { openAt } from '../lab/flower/detail.ts';
import { type HoverWay, heightOf } from '../lab/flower/hover.ts';
import { type Live, newLive, stepLive, tipOf } from '../lab/flower/live.ts';
import { modelOf } from '../lab/flower/model.ts';
import { SHAPE } from '../lab/flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading: Reading = JSON.parse(
  readFileSync(join(GOLDEN, 'near-validators-default.reading.json'), 'utf8'),
).reading;
const model = modelOf(reading);

const FRAME = 1 / 60;
const W = 1440;
const H = 900;

const start = (way: HoverWay = 'dock', calm = false): Live => {
  const l = newLive(model, way, W, H, calm);
  run(l, 90);
  return l;
};
function run(l: Live, frames: number, dt = FRAME) {
  for (let i = 0; i < frames; i++) stepLive(l, dt);
}
/** Puts the pointer on a petal, at rest, by its rest geometry. */
function pointAt(l: Live, i: number, along = 0.5, up = 0.5) {
  const r = model.ring;
  const h = (model.height[i] as number) * up;
  const wx =
    (r.ax[i] as number) * (1 - along) + (r.bx[i] as number) * along + (r.nx[i] as number) * h;
  const wy =
    (r.ay[i] as number) * (1 - along) + (r.by[i] as number) * along + (r.ny[i] as number) * h;
  const c = l.camera;
  l.pointer.x = wx * c.k + c.x;
  l.pointer.y = wy * c.k + c.y;
  l.pointer.inside = true;
}
const pinch = (l: Live, deltaY: number) =>
  zoomWheel(l.camera, {
    deltaY,
    deltaMode: 0,
    ctrlKey: true,
    sx: l.pointer.x,
    sy: l.pointer.y,
  });
/** Zooms by real pinch events, a frame each, until the scale gets there. */
function zoomTo(l: Live, k: number) {
  for (let i = 0; i < 2000 && Math.abs(Math.log(l.camera.k / k)) > 0.005; i++) {
    const d = Math.log(k / l.camera.k) / 0.01;
    pinch(l, -Math.max(-8, Math.min(8, d)));
    stepLive(l, FRAME);
  }
}

describe('at rest', () => {
  test('the bloom ends on the reading, exactly', () => {
    const l = newLive(model, 'dock', W, H, false);
    expect(l.height.x[0]).toBe(-1);
    run(l, 180);
    for (let i = 0; i < model.n; i++) expect(l.ring.h[i]).toBeCloseTo(model.height[i] as number, 3);
    expect(l.ring.ax[7]).toBeCloseTo(model.ring.ax[7] as number, 3);
  });

  test('then it stops asking for frames', () => {
    const l = newLive(model, 'dock', W, H, false);
    let frames = 0;
    while (stepLive(l, FRAME).moving && frames < 600) frames++;
    expect(frames).toBeLessThan(180);
  });
});

describe('hover: dock', () => {
  test('the pointer leads: lit on the first frame, moving on the first frame', () => {
    const l = start();
    pointAt(l, 20);
    const h0 = l.ring.h[20] as number;
    stepLive(l, FRAME);
    expect(l.accent.x[20]).toBeGreaterThan(0.9);
    expect(l.ring.h[20]).toBeGreaterThan(h0);
  });

  test('neighbours swell with a falloff, and the far side barely moves in height', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 60);
    const extra = (i: number) => (l.widths[i] as number) / (model.width[i] as number);
    expect(extra(30)).toBeGreaterThan(extra(32));
    expect(extra(32)).toBeGreaterThan(extra(36));
    expect(extra(28)).toBeGreaterThan(extra(24));
    expect(extra(0)).toBeCloseTo(1, 3);
    expect(l.ring.h[0]).toBeCloseTo(model.height[0] as number, 2);
  });

  test('what is under the pointer is what is drawn under the pointer', () => {
    const l = start();
    for (const i of [3, 12, 30, 47, 60]) {
      pointAt(l, i, 0.4, 0.8);
      run(l, 60);
      const c = l.camera;
      const wx = (l.pointer.x - c.x) / c.k - SHAPE.cx;
      const wy = (l.pointer.y - c.y) / c.k - SHAPE.cy;
      const angle = (Math.atan2(wx, -wy) + Math.PI * 2) % (Math.PI * 2);
      const a0 = (l.ring.start[i] as number) + l.ring.rotation;
      const a1 = (l.ring.start[i + 1] as number) + l.ring.rotation;
      expect(l.focusIndex).toBe(i);
      expect(angle).toBeGreaterThanOrEqual(a0 - 1e-6);
      expect(angle).toBeLessThanOrEqual(a1 + 1e-6);
    }
  });

  test('the polygon stays closed through a sweep', () => {
    const l = start();
    for (let i = 0; i < 61; i++) {
      pointAt(l, i);
      stepLive(l, FRAME);
      stepLive(l, FRAME);
      expect(l.ring.start[model.n]).toBeCloseTo(Math.PI * 2, 9);
    }
  });
});

describe('hover: lift', () => {
  test('only the one under the pointer grows; the others settle back', () => {
    const l = start('lift');
    pointAt(l, 30);
    run(l, 60);
    expect(l.ring.h[30]).toBeGreaterThan(model.height[30] as number);
    expect(l.widths[30]).toBeGreaterThan((model.width[30] as number) * 2);
    for (const i of [29, 31, 0, 50]) {
      expect(l.ring.h[i]).toBeLessThan(model.height[i] as number);
      expect(l.ring.h[i]).toBeGreaterThan((model.height[i] as number) * 0.85);
      expect(l.widths[i]).toBeCloseTo(model.width[i] as number, 3);
    }
  });
});

describe('leaving', () => {
  test('everything goes back to the reading, and the loop sleeps', () => {
    const l = start();
    pointAt(l, 12);
    run(l, 60);
    l.pointer.inside = false;
    let frames = 0;
    while (stepLive(l, FRAME).moving && frames < 900) frames++;
    expect(frames).toBeLessThan(600);
    expect(l.presence.x).toBe(0);
    expect(l.rotation.x).toBeCloseTo(0, 2);
    for (let i = 0; i < model.n; i++) {
      expect(l.widths[i]).toBeCloseTo(model.width[i] as number, 2);
      expect(l.ring.h[i]).toBeCloseTo(model.height[i] as number, 2);
    }
  });

  test('moving into the middle of the polygon calms it as continuously as moving out', () => {
    const l = start();
    pointAt(l, 12);
    run(l, 40);
    const c = l.camera;
    l.pointer.x = SHAPE.cx * c.k + c.x;
    l.pointer.y = SHAPE.cy * c.k + c.y;
    run(l, 120);
    expect(l.presence.x).toBe(0);
  });
});

describe('frame rate', () => {
  test('60 and 120 Hz end in the same place', () => {
    const script = (dt: number) => {
      const l = newLive(model, 'dock', W, H, false);
      const per = Math.round(1 / 60 / dt);
      for (let f = 0; f < 240; f++) {
        if (f === 90) pointAt(l, 15);
        if (f === 130) pointAt(l, 40);
        if (f === 150) l.pointer.inside = false;
        for (let s = 0; s < per; s++) stepLive(l, dt);
      }
      return l;
    };
    const a = script(1 / 60);
    const b = script(1 / 120);
    expect(b.rotation.x).toBeCloseTo(a.rotation.x, 2);
    for (const i of [0, 15, 16, 40, 41, 60]) {
      expect(b.ring.h[i]).toBeCloseTo(a.ring.h[i] as number, 1);
      expect(b.widths[i]).toBeCloseTo(a.widths[i] as number, 2);
    }
  });
});

describe('reduced motion', () => {
  test('every change is direct: one frame and it is there', () => {
    const l = start('dock', true);
    pointAt(l, 30);
    stepLive(l, FRAME);
    expect(l.accent.x[30]).toBeGreaterThan(0.9);
    expect(l.ring.h[30]).toBeCloseTo(
      heightOf(model.height[30] as number, model.L, l.height.t[30] as number),
      6,
    );
    const again = stepLive(l, FRAME);
    expect(again.moving).toBe(false);
  });
});

describe('the crossing', () => {
  const side = model.ring.len[20] as number;

  test('opens with the zoom, part-way stays part-way, and locks past the middle', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 30);
    zoomTo(l, 40 / side);
    run(l, 60);
    expect(l.open.x[20]).toBeCloseTo(openAt(side, l.camera.k), 3);
    expect(l.open.x[20]).toBeGreaterThan(0.1);
    expect(l.open.x[20]).toBeLessThan(0.5);
    expect(l.locked).toBe(false);
    pointAt(l, 20);
    zoomTo(l, 80 / side);
    run(l, 60);
    expect(l.open.x[20]).toBe(1);
    expect(l.locked).toBe(true);
  });

  test('widens up to four times', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 30);
    zoomTo(l, 80 / side);
    run(l, 90);
    expect((l.widths[20] as number) / (model.width[20] as number)).toBeCloseTo(4, 2);
  });

  test('what was under the pointer stays under it as the petal opens', () => {
    const l = start();
    pointAt(l, 20, 0.5, 0.5);
    run(l, 30);
    zoomTo(l, 80 / side);
    run(l, 120);
    // where the pointed-at point of the petal is drawn, on screen
    const r = l.ring;
    const up = (l.up * (r.h[20] as number)) / (model.height[20] as number);
    const wx = ((r.ax[20] as number) + (r.bx[20] as number)) / 2 + (r.nx[20] as number) * up + r.ox;
    const wy = ((r.ay[20] as number) + (r.by[20] as number)) / 2 + (r.ny[20] as number) * up + r.oy;
    const c = l.camera;
    const sx = wx * c.k + c.x;
    const sy = wy * c.k + c.y;
    expect(Math.hypot(sx - l.pointer.x, sy - l.pointer.y)).toBeLessThan(3);
  });

  test('once locked the pointer can wander; a zoom out closes it and sets it free', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 30);
    zoomTo(l, 80 / side);
    run(l, 30);
    l.pointer.x += 200;
    run(l, 30);
    expect(l.focusIndex).toBe(20);
    expect(l.locked).toBe(true);
    zoomTo(l, 12 / side);
    run(l, 60);
    expect(l.locked).toBe(false);
    expect(l.open.x[20]).toBe(0);
  });

  test('Esc: the way back closes it, with the zoom as the clock', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 30);
    zoomTo(l, 80 / side);
    run(l, 30);
    flyTo(l.camera, fitView(W, H));
    let last = l.open.x[20] as number;
    let rose = false;
    for (let i = 0; i < 240; i++) {
      stepLive(l, FRAME);
      if ((l.open.x[20] as number) > last + 1e-6) rose = true;
      last = l.open.x[20] as number;
    }
    expect(rose).toBe(false);
    expect(l.open.x[20]).toBe(0);
    expect(l.camera.k).toBeCloseTo(fitView(W, H).k, 2);
  });

  test('the note chases the tip it belongs to', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 90);
    const tip = tipOf(l.ring, 20);
    expect(l.noteX.x).toBeCloseTo(tip.x, 1);
    expect(l.noteY.x).toBeCloseTo(tip.y, 1);
  });
});
