// The hero's motion (lib/hero-story.ts, lib/hero-shots.ts) is a pure function of the beat and its time, so its seams
// can be read: each beat's last frame is the next one's first, the camera cuts on the one and holds (Elco, 12 Nov:
// cut to the beat), a hit lands a hair past its mark and comes back onto it, and a chosen beat is still.
import { describe, expect, test } from 'vitest';
import { flowerAt, shotOf } from '../lib/hero-shots.ts';
import {
  answer,
  beatMs,
  COUNT_MS,
  camera,
  hit,
  INNER,
  kick,
  OVERLAP_MS,
  PETALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  pulse,
  question,
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

  test('a chosen beat is still, with both lines in view', () => {
    for (let beat = 0; beat < 6; beat++) {
      expect(question(beat, settledMs(beat)).opacity).toBeGreaterThan(0.4);
      expect(answer(beat, settledMs(beat)).opacity).toBeCloseTo(1, 3);
      expect(
        near(petalLengths(beat, settledMs(beat)), petalLengths(beat, beatMs(beat)), 0.01),
      ).toBe(true);
      expect(kick(beat, settledMs(beat))).toBeLessThan(0.002);
    }
  });

  test('every beat is whole bars of the one tempo', () => {
    for (let beat = 0; beat < 6; beat++) {
      const bars = beatMs(beat) / (4 * COUNT_MS);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-9);
    }
  });

  test('a hit lands a hair past its mark and comes back onto it', () => {
    expect(hit(0)).toBe(0);
    expect(hit(1)).toBe(1);
    const most = Math.max(...Array.from({ length: 200 }, (_, k) => hit(k / 200)));
    expect(most).toBeGreaterThan(1.02);
    expect(most).toBeLessThan(1.08);
  });

  test('the pulse thumps on every count, harder on the one and the three', () => {
    const peak = (c: number) =>
      Math.max(...Array.from({ length: 40 }, (_, k) => pulse((c - 1) * COUNT_MS + k * 5)));
    expect(peak(1)).toBeGreaterThan(peak(2));
    expect(peak(3)).toBeGreaterThan(peak(4));
    expect(peak(2)).toBeGreaterThan(0.3);
    expect(pulse(COUNT_MS - 1)).toBeLessThan(0.05);
  });

  test('the camera cuts on the one, holds the shot, and joins every beat to the next', () => {
    for (const wide of [true, false]) {
      for (let beat = 0; beat < 6; beat++) {
        const next = (beat + 1) % 6;
        const a = flowerAt(beat, beatMs(beat), wide);
        const b = flowerAt(next, 0, wide);
        expect(
          Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.scale - b.scale),
        ).toBeLessThan(1e-9);
        // moving hardest on the one, in the shot and still by the second count
        const shot = shotOf(beat, wide).flower;
        const held = flowerAt(beat, COUNT_MS, wide);
        expect(held.x).toBeCloseTo(shot.x, 9);
        expect(held.blur).toBe(0);
        if (shotOf(next, wide).flower.x !== shot.x)
          expect(flowerAt(next, 0, wide).blur).toBeGreaterThan(0);
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
