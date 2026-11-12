// The hero's motion (lib/hero-story.ts, lib/hero-shots.ts) is a pure function of the beat and its time, so its seams
// can be read: each beat's last frame is the next one's first, the camera cuts on the one and holds (Elco, 12 Nov:
// cut to the beat), a hit lands elastic, wobbling onto its mark, and nothing is dead still for long.
import { describe, expect, test } from 'vitest';
import { flowerAt, shotOf } from '../lib/hero-shots.ts';
import {
  answerBox,
  answerLine,
  beatMs,
  COUNT_MS,
  camera,
  INNER,
  kick,
  PETALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  pulse,
  question,
  settledMs,
  spring,
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

  test('the answer box stays on, and its words give way to the next answer on the response', () => {
    for (let beat = 0; beat < 6; beat++) {
      const next = (beat + 1) % 6;
      for (let t = 0; t <= beatMs(beat); t += 50) expect(answerBox(beat, t).opacity).toBe(1);
      // the answer is still there as the next question comes in, and gone once the next one is in
      expect(answerLine(beat, next, 0).opacity).toBe(1);
      expect(answerLine(beat, next, settledMs(next)).opacity).toBe(0);
      expect(answerLine(next, next, settledMs(next)).opacity).toBe(1);
      expect(question(beat, beatMs(beat)).opacity).toBeLessThan(0.002);
      expect(question(next, 200).opacity).toBeGreaterThan(0.2);
    }
    // on arrival the box comes with the first answer
    expect(answerBox(0, 0, true).opacity).toBe(0);
    expect(answerBox(0, settledMs(0), true).opacity).toBeCloseTo(1, 5);
  });

  test('the first beat on arrival grows from the bare centre', () => {
    expect(petalLengths(0, 0, true).every((r) => r === INNER)).toBe(true);
    expect(camera(0, 0, true).scale).toBeCloseTo(1, 5);
  });

  test('a chosen beat shows both lines over its settled flower', () => {
    for (let beat = 0; beat < 6; beat++) {
      expect(question(beat, settledMs(beat)).opacity).toBeGreaterThan(0.4);
      expect(answerLine(beat, beat, settledMs(beat)).opacity).toBe(1);
      // only the ripple still moves it
      expect(near(petalLengths(beat, settledMs(beat)), petalLengths(beat, beatMs(beat)), 3)).toBe(
        true,
      );
      expect(Math.abs(kick(beat, settledMs(beat)))).toBeLessThan(0.002);
    }
  });

  test('every beat is whole bars of the one tempo', () => {
    for (let beat = 0; beat < 6; beat++) {
      const bars = beatMs(beat) / (4 * COUNT_MS);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-9);
    }
  });

  test('an elastic landing passes its mark and lands on it; with more damping it barely passes', () => {
    expect(spring(0)).toBe(0);
    expect(spring(1)).toBe(1);
    const path = Array.from({ length: 400 }, (_, k) => spring(k / 400));
    const most = Math.max(...path);
    expect(most).toBeGreaterThan(1.1);
    expect(most).toBeLessThan(1.2);
    // after its peak it comes back under its mark once
    expect(Math.min(...path.slice(path.indexOf(most)))).toBeLessThan(1);
    expect(Math.max(...Array.from({ length: 400 }, (_, k) => spring(k / 400, 0.7)))).toBeLessThan(
      1.06,
    );
  });

  test('the pulse thumps on every count, harder on the one and the three', () => {
    const peak = (c: number) =>
      Math.max(...Array.from({ length: 40 }, (_, k) => pulse((c - 1) * COUNT_MS + k * 5)));
    expect(peak(1)).toBeGreaterThan(peak(2));
    expect(peak(3)).toBeGreaterThan(peak(4));
    expect(peak(2)).toBeGreaterThan(0.3);
    expect(pulse(COUNT_MS - 1)).toBeLessThan(0.05);
  });

  test('the camera whips on the one, lands, keeps drifting, and joins every beat to the next', () => {
    for (const wide of [true, false]) {
      for (let beat = 0; beat < 6; beat++) {
        const next = (beat + 1) % 6;
        const a = flowerAt(beat, beatMs(beat), wide);
        const b = flowerAt(next, 0, wide);
        expect(
          Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.scale - b.scale),
        ).toBeLessThan(1e-9);
        // landed near its shot by the second count, no longer smeared
        const shot = shotOf(beat, wide).flower;
        const landed = flowerAt(beat, COUNT_MS * 1.2, wide);
        expect(Math.hypot(landed.x - shot.x, landed.y - shot.y)).toBeLessThan(3);
        expect(landed.blur).toBe(0);
        // and never dead still
        for (let t = 0; t < beatMs(beat); t += 100) {
          const p = flowerAt(beat, t, wide);
          const q = flowerAt(beat, t + 100, wide);
          expect(
            Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.scale - p.scale),
          ).toBeGreaterThan(1e-4);
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
