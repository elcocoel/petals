// The hero's motion (lib/hero-story.ts, lib/hero-shots.ts) is a pure function of the beat and its time, so its seams
// can be read: each beat's last frame is the next one's first, the camera never stops (Elco, 12 Nov: one take),
// nothing bounces, and a chosen beat shows both lines over a flower all but at rest.
import { describe, expect, test } from 'vitest';
import { flowerAt } from '../lib/hero-shots.ts';
import {
  answer,
  beatMs,
  CARRY_MS,
  camera,
  INNER,
  OVERLAP_MS,
  PETALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  question,
  settle,
  settledMs,
} from '../lib/hero-story.ts';

const near = (a: readonly number[], b: readonly number[], eps = 0.5) =>
  a.every((x, i) => Math.abs(x - (b[i] as number)) < eps);

describe('the hero story', () => {
  test('each beat ends where the next begins', () => {
    for (let beat = 0; beat < 6; beat++) {
      const next = (beat + 1) % 6;
      expect(near(petalLengths(beat, beatMs(beat)), petalLengths(next, 0))).toBe(true);
      const a = camera(beat, beatMs(beat));
      const b = camera(next, 0);
      expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.002);
      expect(a.rotate).toBeCloseTo(b.rotate, 3);
      for (let i = 0; i < PETALS; i++) {
        const end = petalPaint(beat, beatMs(beat), i);
        const start = petalPaint(next, 0, i);
        // the colour a beat ends on is the one the next starts from
        expect(end.k === 1 ? end.to : end.from).toBe(start.k === 0 ? start.from : start.to);
        expect(Math.abs(petalLit(beat, beatMs(beat), i) - petalLit(next, 0, i))).toBeLessThan(0.01);
      }
    }
  });

  test('an answer is still leaving as the next question comes in, and gone soon after', () => {
    for (let beat = 0; beat < 6; beat++) {
      const next = (beat + 1) % 6;
      expect(answer(beat, beatMs(beat)).opacity).toBeGreaterThan(0);
      expect(answer(beat, beatMs(beat) + OVERLAP_MS).opacity).toBeLessThan(0.002);
      expect(question(beat, beatMs(beat)).opacity).toBeLessThan(0.002);
      expect(question(next, 200).opacity).toBeGreaterThan(0.2);
    }
  });

  test('the first beat on arrival grows from the bare centre', () => {
    expect(petalLengths(0, 0, true).every((r) => r === INNER)).toBe(true);
    expect(camera(0, 0, true).scale).toBeCloseTo(1, 5);
  });

  test('a chosen beat shows both lines over a flower all but at rest', () => {
    for (let beat = 0; beat < 6; beat++) {
      expect(question(beat, settledMs(beat)).opacity).toBeGreaterThan(0.4);
      expect(answer(beat, settledMs(beat)).opacity).toBeCloseTo(1, 3);
      if (beat === 3) continue; // the history beat is still travelling from then to now
      const rest = petalLengths(beat, beatMs(beat) + CARRY_MS);
      expect(near(petalLengths(beat, settledMs(beat)), rest, 8)).toBe(true);
    }
  });

  test('the flower is still settling as the next question comes, and at rest once it has landed', () => {
    for (let beat = 0; beat < 6; beat++) {
      const end = petalLengths(beat, beatMs(beat));
      const rest = petalLengths(beat, beatMs(beat) + CARRY_MS);
      // the beats whose heights move are a little short of rest as the next question comes, never far
      const off = Math.max(...end.map((r, i) => Math.abs(r - (rest[i] as number))));
      if ([0, 1, 3, 4].includes(beat)) expect(off).toBeGreaterThan(0.5);
      expect(off).toBeLessThan(3);
      expect(near(petalLengths(beat, beatMs(beat) + CARRY_MS + 500), rest, 1e-9)).toBe(true);
    }
  });

  test('a move comes to rest without passing its end', () => {
    expect(settle(0)).toBe(0);
    expect(settle(1)).toBe(1);
    const path = Array.from({ length: 201 }, (_, k) => settle(k / 200));
    expect(Math.max(...path)).toBeLessThanOrEqual(1);
    expect(path.every((x, k) => k === 0 || x >= (path[k - 1] as number))).toBe(true);
  });

  test('the camera never stops, and joins every beat to the next', () => {
    for (const wide of [true, false]) {
      for (let beat = 0; beat < 6; beat++) {
        const next = (beat + 1) % 6;
        const a = flowerAt(beat, beatMs(beat), wide);
        const b = flowerAt(next, 0, wide);
        expect(
          Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.scale - b.scale),
        ).toBeLessThan(1e-6);
        for (let t = 0; t < beatMs(beat); t += 100) {
          const p = flowerAt(beat, t, wide);
          const q = flowerAt(beat, t + 100, wide);
          // at least a hundredth of a % of the stage, or of its size, every tenth of a second
          expect(
            Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.scale - p.scale) * 100,
          ).toBeGreaterThan(0.01);
        }
      }
    }
  });

  test('a petal is drawn whole, softened or not', () => {
    expect(petalPath(0, 120)).toMatch(/^M.*Z$/);
    expect(petalPath(0, 120, { round: 2 })).toMatch(/Q/);
    // a petal too short to round is left square, never made bigger
    expect(petalPath(0, INNER + 0.01, { round: 2 })).not.toMatch(/Q/);
  });
});
