// The hero's motion (lib/hero-story.ts) is a pure function of the beat and its time, so its seams can be read:
// each beat's last frame is the next one's first, the settled moment is still, and heights stay the story's.
import { describe, expect, test } from 'vitest';
import {
  BEAT_MS,
  camera,
  INNER,
  PETALS,
  petalLengths,
  petalLit,
  petalPaint,
  petalPath,
  SETTLED_MS,
  spring,
  words,
} from '../lib/hero-story.ts';

const near = (a: readonly number[], b: readonly number[], eps = 0.5) =>
  a.every((x, i) => Math.abs(x - (b[i] as number)) < eps);

describe('the hero story', () => {
  test('each beat ends where the next begins', () => {
    for (let beat = 0; beat < 6; beat++) {
      const next = (beat + 1) % 6;
      expect(near(petalLengths(beat, BEAT_MS), petalLengths(next, 0))).toBe(true);
      const a = camera(beat, BEAT_MS);
      const b = camera(next, 0);
      expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.002);
      expect(a.rotate).toBeCloseTo(b.rotate, 3);
      for (let i = 0; i < PETALS; i++) {
        const end = petalPaint(beat, BEAT_MS, i);
        const start = petalPaint(next, 0, i);
        // the colour a beat ends on is the one the next starts from
        expect(end.k === 1 ? end.to : end.from).toBe(start.k === 0 ? start.from : start.to);
        expect(Math.abs(petalLit(beat, BEAT_MS, i) - petalLit(next, 0, i))).toBeLessThan(0.01);
      }
    }
  });

  test('the first beat on arrival grows from the bare centre', () => {
    expect(petalLengths(0, 0, true).every((r) => r === INNER)).toBe(true);
    expect(camera(0, 0, true).scale).toBeCloseTo(1, 5);
  });

  test('the settled moment has stopped moving, and both lines are in view', () => {
    for (let beat = 0; beat < 6; beat++) {
      if (beat === 3) continue; // the history beat is still travelling from then to now
      expect(near(petalLengths(beat, SETTLED_MS), petalLengths(beat, SETTLED_MS + 400), 0.01)).toBe(
        true,
      );
    }
    const w = words(SETTLED_MS);
    expect(w.question.opacity).toBeGreaterThan(0.4);
    expect(w.answer.opacity).toBeCloseTo(1, 3);
  });

  test('the spring arrives at its end and passes it only a little', () => {
    expect(spring(0)).toBe(0);
    expect(spring(1)).toBe(1);
    const most = Math.max(...Array.from({ length: 200 }, (_, k) => spring(k / 200)));
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThan(1.06);
  });

  test('a petal is drawn whole, softened or not', () => {
    expect(petalPath(0, 120)).toMatch(/^M.*Z$/);
    expect(petalPath(0, 120, { round: 2 })).toMatch(/Q/);
    // a petal too short to round is left square, never made bigger
    expect(petalPath(0, INNER + 0.01, { round: 2 })).not.toMatch(/Q/);
  });
});
