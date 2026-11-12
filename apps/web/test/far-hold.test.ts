// Elco, 12 Nov walk: "we have to hold on to the mini shape longer until I'm actually focusing on one or another
// group of dowels ... the transition happens at different times depending on something related to the size of
// petals". The far wave hands over to petals at one zoom for the whole chain, measured from its home.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fitView, newCamera } from '../flower/camera.ts';
import { FAR_HOLD, farOf } from '../landscape/useLandscape.ts';

const home = { cx: 0, cy: 0, r: 4000 };

test('waves for every flower out to FAR_HOLD from the home, petals for every flower past it', () => {
  const cam = newCamera(1440, 800, home);
  const k = fitView(1440, 800, home).k;
  cam.k = k;
  expect(farOf(cam, home)).toBe(1);
  cam.k = k * FAR_HOLD[0];
  expect(farOf(cam, home)).toBe(1);
  cam.k = k * FAR_HOLD[1];
  expect(farOf(cam, home)).toBe(0);
  cam.k = k * ((FAR_HOLD[0] + FAR_HOLD[1]) / 2);
  expect(farOf(cam, home)).toBeCloseTo(0.5, 5);
});

test('the scene takes one share for all, and no flower comes alive while every one is a wave', () => {
  const land = readFileSync(
    join(import.meta.dirname, '..', 'landscape', 'useLandscape.ts'),
    'utf8',
  );
  expect(land).toMatch(/const want = waved >= 0\.99 \? new Set<number>\(\) : liveSet\(/);
});
