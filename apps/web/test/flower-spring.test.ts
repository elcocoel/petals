// The springs: exact, so right at any frame rate, and interruptible without a jump.
import { describe, expect, test } from 'vitest';
import {
  advance,
  advanceAll,
  advanceBothWays,
  channel,
  SNAP,
  type Spring,
  type SpringSpec,
  spring,
  stepOf,
} from '../flower/spring.ts';

const SPECS: SpringSpec[] = [
  { response: 0.3, damping: 0.56 },
  { response: 0.2, damping: 1 },
  { response: 0.62, damping: 0.94 },
];

const moving = (x: number, v: number, t: number): Spring => ({ x, v, t });

describe('a spring', () => {
  test.each(SPECS)('two half steps land exactly where one whole step does: %o', (spec) => {
    const a = moving(3, -2, 10);
    const b = moving(3, -2, 10);
    advance(a, stepOf(spec, 1 / 60));
    advance(b, stepOf(spec, 1 / 120));
    advance(b, stepOf(spec, 1 / 120));
    expect(b.x).toBeCloseTo(a.x, 10);
    expect(b.v).toBeCloseTo(a.v, 9);
  });

  test.each(SPECS)('60 and 120 Hz follow the same curve through a retarget: %o', (spec) => {
    const a = spring(0);
    const b = spring(0);
    for (let frame = 0; frame < 120; frame++) {
      const target = frame < 30 ? 1 : frame < 60 ? -2 : 5;
      a.t = target;
      b.t = target;
      advance(a, stepOf(spec, 1 / 60));
      advance(b, stepOf(spec, 1 / 120));
      advance(b, stepOf(spec, 1 / 120));
    }
    expect(b.x).toBeCloseTo(a.x, 2);
  });

  test('a new target keeps position and velocity: nothing jumps', () => {
    const s = spring(0);
    s.t = 1;
    const step = stepOf(SPECS[0] as SpringSpec, 1 / 60);
    for (let i = 0; i < 6; i++) advance(s, step);
    const { x, v } = s;
    s.t = -5;
    expect(s.x).toBe(x);
    expect(s.v).toBe(v);
    advance(s, step);
    expect(Math.abs(s.x - x)).toBeLessThan(Math.abs(v) * (1 / 60) + 0.1);
  });

  test('a bouncy spring overshoots; a damped one does not', () => {
    const peak = (spec: SpringSpec) => {
      const s = spring(0);
      s.t = 1;
      let top = 0;
      for (let i = 0; i < 120; i++) {
        advance(s, stepOf(spec, 1 / 60));
        top = Math.max(top, s.x);
      }
      return top;
    };
    expect(peak({ response: 0.3, damping: 0.56 })).toBeGreaterThan(1.05);
    expect(peak({ response: 0.2, damping: 1 })).toBeLessThanOrEqual(1);
  });

  test('settles, and says so', () => {
    const s = spring(0);
    s.t = 1;
    const step = stepOf({ response: 0.2, damping: 1 }, 1 / 60);
    let frames = 0;
    while (advance(s, step)) frames++;
    expect(frames).toBeLessThan(120);
    expect(s.x).toBe(1);
    expect(s.v).toBe(0);
    expect(advance(s, step)).toBe(false);
  });

  test('reduced motion lands in one step', () => {
    const s = moving(0, 3, 7);
    advance(s, SNAP);
    expect(s.x).toBe(7);
    expect(s.v).toBe(0);
  });
});

describe('a channel', () => {
  test('does what a spring per petal would', () => {
    const ch = channel(3);
    ch.t.set([1, 2, 3]);
    const one = [spring(0), spring(0), spring(0)];
    one.forEach((s, i) => {
      s.t = i + 1;
    });
    const step = stepOf({ response: 0.3, damping: 0.6 }, 1 / 60);
    for (let f = 0; f < 10; f++) {
      advanceAll(ch, step);
      for (const s of one) advance(s, step);
    }
    one.forEach((s, i) => {
      expect(ch.x[i]).toBeCloseTo(s.x, 10);
    });
  });

  test('can go up on one spring and down on another', () => {
    const up = stepOf({ response: 0.2, damping: 1 }, 1 / 60);
    const down = stepOf({ response: 0.8, damping: 1 }, 1 / 60);
    const ch = channel(2);
    ch.x[1] = 1;
    ch.t[0] = 1;
    ch.t[1] = 0;
    const rising = spring(0);
    rising.t = 1;
    const falling = spring(1);
    falling.t = 0;
    for (let f = 0; f < 10; f++) {
      advanceBothWays(ch, up, down);
      advance(rising, up);
      advance(falling, down);
    }
    expect(ch.x[0]).toBeCloseTo(rising.x, 10);
    expect(ch.x[1]).toBeCloseTo(falling.x, 10);
    expect(ch.x[0] as number).toBeGreaterThan(1 - (ch.x[1] as number));
  });

  test('reports when all of it has stopped', () => {
    const ch = channel(2);
    expect(advanceAll(ch, stepOf({ response: 0.2, damping: 1 }, 1 / 60))).toBe(false);
    ch.t[1] = 1;
    expect(advanceAll(ch, stepOf({ response: 0.2, damping: 1 }, 1 / 60))).toBe(true);
  });
});
