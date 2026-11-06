// The whole flower from frame to frame, with no browser: hover, travel, the crossing and the way back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fitView, flyTo, zoomWheel } from '../lab/flower/camera.ts';
import { openAt } from '../lab/flower/detail.ts';
import { flareGain, type HoverWay, heightOf, riseGain } from '../lab/flower/hover.ts';
import { type Live, newLive, noteAt, stepLive, tipOf } from '../lab/flower/live.ts';
import { bandUnder, modelOf, pick } from '../lab/flower/model.ts';
import { leftAt, pointIn, rightAt, SHAPE, widthBefore } from '../lab/flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading: Reading = JSON.parse(
  readFileSync(join(GOLDEN, 'near-validators-default.reading.json'), 'utf8'),
).reading;
const model = modelOf(reading);
const backers = modelOf(
  JSON.parse(readFileSync(join(GOLDEN, 'near-validators-backers.reading.json'), 'utf8')).reading,
);

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
  test('the pointer leads: on the first frame the petal is moving and the note names it', () => {
    const l = start();
    pointAt(l, 20);
    const h0 = l.ring.h[20] as number;
    stepLive(l, FRAME);
    expect(l.accent.x[20]).toBeGreaterThan(0);
    expect(l.ring.h[20]).toBeGreaterThan(h0);
    expect(l.noteIndex).toBe(20);
  });

  test('calm: a touch takes its time, with hardly any overshoot', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 6);
    const rise = (i: number) => (l.ring.h[i] as number) - (model.height[i] as number);
    const whole = riseGain((model.ring.len[30] as number) * l.camera.k) * model.L;
    expect(rise(30)).toBeLessThan(whole * 0.5);
    let top = 0;
    for (let f = 0; f < 120; f++) {
      stepLive(l, FRAME);
      top = Math.max(top, rise(30));
    }
    expect(top).toBeLessThan(whole * 1.04);
    expect(rise(30)).toBeCloseTo(whole, 2);
  });

  test('direct focus carries the weight: 15% next to it, 5% next to that, then nothing', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 240);
    const rise = (i: number) => (l.ring.h[i] as number) - (model.height[i] as number);
    expect(rise(29) / rise(30)).toBeCloseTo(0.15, 2);
    expect(rise(31) / rise(30)).toBeCloseTo(0.15, 2);
    expect(rise(28) / rise(30)).toBeCloseTo(0.05, 2);
    expect(rise(32) / rise(30)).toBeCloseTo(0.05, 2);
    for (const i of [33, 27, 40, 0, 60]) expect(rise(i)).toBe(0);
  });

  test('the circle holds still: no angle changes, no one steps back, only the focus widens', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 240);
    expect(l.rotation.x).toBeCloseTo(0, 9);
    for (let i = 0; i <= model.n; i++)
      expect(l.ring.start[i]).toBeCloseTo(model.ring.start[i] as number, 9);
    for (let i = 0; i < model.n; i++) {
      expect(l.ring.h[i]).toBeGreaterThanOrEqual((model.height[i] as number) - 1e-9);
      expect(l.ring.flare[i]).toBe(i === 30 ? flareTarget(l, 30) : 0);
    }
    expect(flareTarget(l, 30)).toBeGreaterThan(0.5);
  });

  test('its size is in petals, not pixels: the same falloff at any zoom', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 30);
    zoomTo(l, 2.2);
    pointAt(l, 30);
    run(l, 240);
    const rise = (i: number) => (l.ring.h[i] as number) - (model.height[i] as number);
    expect(rise(29) / rise(30)).toBeCloseTo(0.15, 2);
    expect(rise(33)).toBe(0);
  });

  test('on its own wider tip, over a neighbour, the focus stays', () => {
    const l = start();
    pointAt(l, 30);
    run(l, 240);
    const r = l.ring;
    const top = r.h[30] as number;
    const [lx, ly] = leftAt(r, 30, top * 0.97);
    const [rx, ry] = rightAt(r, 30, top * 0.97);
    const wx = lx + (rx - lx) * 0.05;
    const wy = ly + (ry - ly) * 0.05;
    const c = l.camera;
    l.pointer.x = wx * c.k + c.x;
    l.pointer.y = wy * c.k + c.y;
    expect(pick(model, wx, wy, l.reach)?.index).not.toBe(30);
    run(l, 30);
    expect(l.focusIndex).toBe(30);
    // and past the edge it hands over
    l.pointer.x = (lx - (rx - lx) * 0.1) * c.k + c.x;
    l.pointer.y = (ly - (ry - ly) * 0.1) * c.k + c.y;
    run(l, 2);
    expect(l.focusIndex).not.toBe(30);
  });

  test('passing petals do not flash: a fast sweep names few of them, and lands on the last', () => {
    const l = start();
    const names = new Set<number>();
    for (let i = 0; i < 30; i++) {
      pointAt(l, 5 + i);
      stepLive(l, FRAME);
      names.add(l.noteIndex);
    }
    expect(names.size).toBeLessThan(8);
    run(l, 20);
    expect(l.noteIndex).toBe(34);
  });

  test('a passing petal stays pale; one you stop on comes up', () => {
    const l = start();
    pointAt(l, 5);
    stepLive(l, FRAME);
    stepLive(l, FRAME);
    pointAt(l, 6);
    stepLive(l, FRAME);
    expect(l.accent.x[5]).toBeLessThan(0.35);
    run(l, 60);
    expect(l.accent.x[6]).toBeCloseTo(1, 1);
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

const flareTarget = (l: Live, i: number) =>
  flareGain(
    (model.ring.len[i] as number) * l.camera.k,
    widthBefore(model.ring, i, model.height[i] as number) * l.camera.k,
  );

describe('the bands under the pointer', () => {
  test('a point up a bar is on the band its height falls in', () => {
    const segs = [{ frac: 0.5 }, { frac: 0.3 }, { frac: 0.2 }];
    expect(bandUnder(segs, 0.1)).toBe(0);
    expect(bandUnder(segs, 0.6)).toBe(1);
    expect(bandUnder(segs, 0.95)).toBe(2);
    expect(bandUnder(segs, 1.4)).toBe(2);
    expect(bandUnder(segs, -1)).toBe(0);
    expect(bandUnder([], 0.5)).toBe(-1);
  });

  test('following the pointer up the focus, with its bands named on that petal alone', () => {
    const l = newLive(backers, 'dock', W, H, false);
    run(l, 90);
    const seen = new Set<number>();
    for (const up of [0.15, 0.5, 0.75, 0.97]) {
      const r = backers.ring;
      const h = (backers.height[7] as number) * up;
      const wx = ((r.ax[7] as number) + (r.bx[7] as number)) / 2 + (r.nx[7] as number) * h;
      const wy = ((r.ay[7] as number) + (r.by[7] as number)) / 2 + (r.ny[7] as number) * h;
      l.pointer.x = wx * l.camera.k + l.camera.x;
      l.pointer.y = wy * l.camera.k + l.camera.y;
      l.pointer.inside = true;
      run(l, 40);
      expect(l.focusIndex).toBe(7);
      seen.add(l.band);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(l.named.x[7]).toBeCloseTo(1, 1);
    for (const i of [5, 6, 8, 9, 30]) expect(l.named.x[i]).toBe(0);
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
      heightOf('dock', model.height[30] as number, model.L, l.height.t[30] as number),
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
    const [px, py] = pointIn(r, 20, l.along, up);
    const c = l.camera;
    const sx = (px + r.ox) * c.k + c.x;
    const sy = (py + r.oy) * c.k + c.y;
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
});

describe('the travelling note', () => {
  test('lands on the tip of the petal it belongs to', () => {
    const l = start();
    pointAt(l, 20);
    run(l, 90);
    const tip = tipOf(l.ring, 20);
    const at = noteAt(l);
    expect(at.x).toBeCloseTo(tip.x, 1);
    expect(at.y).toBeCloseTo(tip.y, 1);
  });

  test('on a jump across the flower it runs round the rim, never through the middle', () => {
    const l = start();
    pointAt(l, 5);
    run(l, 90);
    pointAt(l, 35);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60; i++) {
      stepLive(l, FRAME);
      const at = noteAt(l);
      closest = Math.min(closest, Math.hypot(at.x - SHAPE.cx, at.y - SHAPE.cy));
    }
    expect(closest).toBeGreaterThan(SHAPE.r0);
  });

  test("takes the short way over twelve o'clock", () => {
    const l = start();
    pointAt(l, 59);
    run(l, 90);
    const before = l.noteAngle.x;
    pointAt(l, 1);
    run(l, 60);
    expect(Math.abs(l.noteAngle.x - before)).toBeLessThan(1.5);
  });
});
