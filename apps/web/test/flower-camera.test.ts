// The camera, with no browser: under the cursor, one to one, soft at the limits, and interruptible.
import { describe, expect, test } from 'vitest';
import {
  type Camera,
  clearSides,
  FLOWER_HOME,
  fitView,
  flyTo,
  letGo,
  newCamera,
  panBy,
  softLimit,
  stepCamera,
  zoomWheel,
} from '../flower/camera.ts';
import { PINCH_GAIN, SOFT_EDGE, ZOOM_LIMITS } from '../flower/feel.ts';

const FRAME = 1 / 60;
const worldAt = (c: Camera, sx: number, sy: number) =>
  [(sx - c.x) / c.k, (sy - c.y) / c.k] as const;
const settle = (c: Camera, frames = 240) => {
  for (let i = 0; i < frames; i++) stepCamera(c, FRAME, false);
};
const pinch = (c: Camera, deltaY: number, sx = 500, sy = 300) =>
  zoomWheel(c, { deltaY, deltaMode: 0, ctrlKey: true, sx, sy });

describe('zooming', () => {
  test('a pinch follows the fingers on the same frame, one to one', () => {
    const c = newCamera(1440, 900);
    const k0 = c.k;
    pinch(c, -20);
    stepCamera(c, FRAME, false);
    expect(Math.log(c.k / k0)).toBeCloseTo(20 * PINCH_GAIN, 9);
  });

  test('the point under the cursor stays under the cursor', () => {
    const c = newCamera(1440, 900);
    const before = worldAt(c, 640, 210);
    for (let i = 0; i < 40; i++) {
      pinch(c, -9, 640, 210);
      stepCamera(c, FRAME, false);
    }
    const after = worldAt(c, 640, 210);
    expect(c.k).toBeGreaterThan(3);
    expect(Math.abs(after[0] - before[0]) * c.k).toBeLessThan(1e-9);
    expect(Math.abs(after[1] - before[1]) * c.k).toBeLessThan(1e-9);
  });

  test('a mouse notch goes through a spring and lands where a finger would', () => {
    const c = newCamera(1440, 900);
    const k0 = c.k;
    zoomWheel(c, { deltaY: -120, deltaMode: 0, ctrlKey: false, sx: 400, sy: 400 });
    stepCamera(c, FRAME, false);
    const first = Math.log(c.k / k0);
    settle(c);
    const whole = Math.log(c.k / k0);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(whole * 0.7);
    expect(whole).toBeCloseTo(120 * 0.002, 6);
  });
});

describe('the soft edge', () => {
  test('inside the limits it changes nothing', () => {
    expect(softLimit(0)).toBe(0);
    expect(softLimit(Math.log(10))).toBe(Math.log(10));
  });

  test('past a limit each step gives less, never stops, and never goes far', () => {
    const hi = Math.log(ZOOM_LIMITS[1]);
    let last = softLimit(hi);
    let lastStep = Number.POSITIVE_INFINITY;
    for (let over = 0.1; over < 3; over += 0.1) {
      const now = softLimit(hi + over);
      expect(now).toBeGreaterThan(last);
      expect(now - last).toBeLessThan(lastStep);
      expect(now).toBeLessThan(hi + SOFT_EDGE);
      lastStep = now - last;
      last = now;
    }
  });

  test('pushed past the limit it gives way, and when let go it comes back', () => {
    const c = newCamera(1440, 900);
    for (let i = 0; i < 200; i++) {
      pinch(c, -25);
      stepCamera(c, FRAME, false);
    }
    expect(c.k).toBeGreaterThan(ZOOM_LIMITS[1]);
    expect(c.k).toBeLessThan(ZOOM_LIMITS[1] * Math.exp(SOFT_EDGE));
    const under = worldAt(c, 500, 300);
    settle(c);
    expect(c.k).toBeCloseTo(ZOOM_LIMITS[1], 5);
    const back = worldAt(c, 500, 300);
    expect(Math.abs(back[0] - (under[0] as number)) * c.k).toBeLessThan(1e-6);
  });

  test('the same at the far end', () => {
    const c = newCamera(1440, 900);
    for (let i = 0; i < 200; i++) {
      pinch(c, 25);
      stepCamera(c, FRAME, false);
    }
    expect(c.k).toBeLessThan(ZOOM_LIMITS[0]);
    settle(c);
    expect(c.k).toBeCloseTo(ZOOM_LIMITS[0], 5);
  });
});

describe('the way back', () => {
  const zoomed = () => {
    const c = newCamera(1440, 900);
    for (let i = 0; i < 80; i++) {
      pinch(c, -10);
      stepCamera(c, FRAME, false);
    }
    settle(c, 30);
    return c;
  };

  test('lands on the fit', () => {
    const c = zoomed();
    const fit = fitView(1440, 900);
    flyTo(c, fit);
    settle(c);
    expect(c.k).toBeCloseTo(fit.k, 3);
    expect(c.x).toBeCloseTo(fit.x, 1);
    expect(c.y).toBeCloseTo(fit.y, 1);
  });

  test('moves smoothly: no frame jumps', () => {
    const c = zoomed();
    flyTo(c, fitView(1440, 900));
    let last = Math.log(c.k);
    let biggest = 0;
    for (let i = 0; i < 90; i++) {
      stepCamera(c, FRAME, false);
      biggest = Math.max(biggest, Math.abs(Math.log(c.k) - last));
      last = Math.log(c.k);
    }
    expect(biggest).toBeLessThan(0.2);
  });

  test('a hand can take it over part-way, from where it is', () => {
    const c = zoomed();
    flyTo(c, fitView(1440, 900));
    for (let i = 0; i < 12; i++) stepCamera(c, FRAME, false);
    const { k, x, y } = c;
    pinch(c, -1, 700, 400);
    expect(c.mode).toBe('anchor');
    stepCamera(c, FRAME, false);
    expect(Math.abs(Math.log(c.k / k))).toBeLessThan(0.05);
    const under = worldAt(c, 700, 400);
    expect(Math.abs((under[0] as number) - (700 - x) / k) * c.k).toBeLessThan(2);
    expect(Math.abs((under[1] as number) - (400 - y) / k) * c.k).toBeLessThan(2);
  });

  test('so can a drag', () => {
    const c = zoomed();
    flyTo(c, fitView(1440, 900));
    for (let i = 0; i < 12; i++) stepCamera(c, FRAME, false);
    const { x } = c;
    panBy(c, 10, 0);
    expect(c.mode).toBe('free');
    expect(c.x).toBe(x + 10);
  });
});

describe('a drag', () => {
  test('moves one to one and coasts to a stop when let go', () => {
    const c = newCamera(1440, 900);
    const { x, y } = c;
    panBy(c, 30, -20);
    expect(c.x).toBe(x + 30);
    expect(c.y).toBe(y - 20);
    letGo(c, 600, 0);
    stepCamera(c, FRAME, false);
    const moved = c.x;
    expect(moved).toBeGreaterThan(x + 30);
    settle(c);
    expect(c.vx).toBe(0);
    expect(c.x).toBeGreaterThan(moved);
  });

  test('reduced motion drops the coast', () => {
    const c = newCamera(1440, 900);
    panBy(c, 30, 0);
    letGo(c, 600, 0);
    const { x } = c;
    stepCamera(c, FRAME, true);
    expect(c.x).toBe(x);
  });
});

describe('a canvas with a side covered (the flower under /make’s conversation)', () => {
  test('the home fits in what the side leaves, centred there', () => {
    const whole = fitView(1200, 800);
    const beside = fitView(1200, 800, undefined, { left: 500, right: 0, top: 0, bottom: 0 });
    expect(beside.k).toBeLessThan(whole.k);
    // the flower's centre is in the middle of the 700 px the conversation leaves
    expect(beside.x + FLOWER_HOME.cx * beside.k).toBeCloseTo(500 + 350);
  });

  test('a camera nobody moved fits again when the side changes; a moved one stays', () => {
    const cam = newCamera(1200, 800);
    clearSides(cam, { left: 500, right: 0, top: 0, bottom: 0 });
    expect(cam.x + FLOWER_HOME.cx * cam.k).toBeCloseTo(850);
    const moved = newCamera(1200, 800);
    moved.touched = true;
    const x = moved.x;
    clearSides(moved, { left: 500, right: 0, top: 0, bottom: 0 });
    expect(moved.x).toBe(x);
  });
});

test('below the conversation, on a phone, the flower fits in the top that’s left', () => {
  const above = fitView(390, 844, undefined, { left: 0, right: 0, top: 0, bottom: 500 });
  expect(above.y + FLOWER_HOME.cy * above.k).toBeCloseTo(172);
});
