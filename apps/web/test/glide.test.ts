// Data layers from different people add up to fuller and fuller maps; the map
// drawn from the layers on, petals moving, no jump.
import { expect, test } from 'vitest';
import { drawnOf, GLIDE, glideBetween, stepGlide } from '../flower/glide.ts';
import { lay, newRing, type Ring } from '../flower/ring.ts';

const ringOf = (widths: number[], heights: number[]): Ring => {
  const ring = newRing(widths.length);
  lay(ring, Float64Array.from(widths), Float64Array.from(heights), 0);
  return ring;
};
const rest = (widths: number[], heights: number[]) => ({
  width: Float64Array.from(widths),
  height: Float64Array.from(heights),
});
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

const W0 = [1, 1, 1, 1, 1, 1];
const H0 = [10, 20, 30, 40, 50, 60];
const before = drawnOf(
  ringOf(W0, H0),
  ['a', 'b', 'c', 'd', 'e', 'f'],
  ['#a', '#b', '#c', '#d', '#e', '#f'],
  rest(W0, H0),
);

test('the same petals drawn the same way never glide', () => {
  expect(glideBetween(before, ['a', 'b', 'c', 'd', 'e', 'f'], rest(W0, H0))).toBeNull();
});

test('a petal glides from where it was drawn to where the new reading lays it', () => {
  const W1 = [1, 1, 1, 1, 1, 1];
  const H1 = [60, 20, 30, 40, 50, 10];
  const g = glideBetween(before, ['a', 'b', 'c', 'd', 'e', 'f'], rest(W1, H1));
  expect(g).not.toBeNull();
  if (!g) return;
  const ring = ringOf(W1, H1);
  // the first frame: still where it was
  stepGlide(g, ring, 0);
  near(ring.h[0] as number, 10);
  // half way: between
  const mid = ringOf(W1, H1);
  stepGlide(g, mid, GLIDE / 2);
  expect(mid.h[0] as number).toBeGreaterThan(10);
  expect(mid.h[0] as number).toBeLessThan(60);
  // done: where the new reading lays it, and the glide says so
  const end = ringOf(W1, H1);
  expect(stepGlide(g, end, GLIDE)).toBe(false);
  near(end.h[0] as number, 60);
});

test('a wallet the new reading brings grows out of its seam, the others making room, touching all the way', () => {
  const W1 = [1, 1, 1, 1, 1, 1, 1];
  const H1 = [10, 20, 30, 35, 40, 50, 60];
  const ids = ['a', 'b', 'c', 'x', 'd', 'e', 'f'];
  const g = glideBetween(before, ids, rest(W1, H1));
  if (!g) throw new Error('no glide');
  const first = ringOf(W1, H1);
  stepGlide(g, first, 0);
  // it starts with no width and no height, at the end of the petal before it as drawn
  near((first.end[3] as number) - (first.start[3] as number), 0);
  near(first.h[3] as number, 0);
  near(first.start[3] as number, before.end[2] as number);
  for (const t of [GLIDE * 0.25, GLIDE * 0.25, GLIDE * 0.25]) {
    const ring = ringOf(W1, H1);
    stepGlide(g, ring, t);
    for (let i = 0; i < 6; i++) near(ring.start[i + 1] as number, ring.end[i] as number);
  }
});

test('a wallet it no longer has closes into its seam, a ghost that fades as it goes', () => {
  const W1 = [1, 1, 1, 1, 1];
  const H1 = [10, 20, 40, 50, 60];
  const g = glideBetween(before, ['a', 'b', 'd', 'e', 'f'], rest(W1, H1));
  if (!g) throw new Error('no glide');
  expect(g.gone).toHaveLength(1);
  expect(g.ghostFills).toEqual(['#c']);
  const first = ringOf(W1, H1);
  stepGlide(g, first, 0);
  // it starts where it was, as tall as it was
  near(g.ghosts.start[0] as number, before.start[2] as number);
  near(g.ghosts.h[0] as number, 30);
  // half way it sits between its neighbours, touching both
  const mid = ringOf(W1, H1);
  stepGlide(g, mid, GLIDE / 2);
  near(g.ghosts.start[0] as number, mid.end[1] as number);
  near(g.ghosts.end[0] as number, mid.start[2] as number);
  expect(g.e).toBeGreaterThan(0);
  // done: nothing left of it, where 'b' ends and 'd' starts
  const end = ringOf(W1, H1);
  stepGlide(g, end, GLIDE);
  near((g.ghosts.end[0] as number) - (g.ghosts.start[0] as number), 0);
  near(g.ghosts.h[0] as number, 0);
  expect(g.e).toBe(1);
});

// on live the server's reading lands half way through the browser's own, the same: the flower glides on, no jump
test('the same reading landing half way through a glide carries it on where it was', () => {
  const W1 = [1, 1, 1, 1, 1, 1];
  const H1 = [60, 20, 30, 40, 50, 10];
  const g = glideBetween(before, ['a', 'b', 'c', 'd', 'e', 'f'], rest(W1, H1));
  if (!g) throw new Error('no glide');
  const half = ringOf(W1, H1);
  stepGlide(g, half, GLIDE / 2);
  const mid = half.h[0] as number;
  const taken = drawnOf(half, ['a', 'b', 'c', 'd', 'e', 'f'], [], rest(W1, H1), g);
  const again = glideBetween(taken, ['a', 'b', 'c', 'd', 'e', 'f'], rest(W1, H1));
  expect(again).toBe(g);
  // the next frame goes on from there, not from the start or the end
  const next = ringOf(W1, H1);
  stepGlide(g, next, 1 / 60);
  expect(next.h[0] as number).toBeGreaterThan(mid);
  expect(next.h[0] as number).toBeLessThan(60);
  // a flower that had finished its glide still never moves for the same reading
  expect(
    glideBetween(
      drawnOf(ringOf(W1, H1), ['a', 'b', 'c', 'd', 'e', 'f'], [], rest(W1, H1)),
      ['a', 'b', 'c', 'd', 'e', 'f'],
      rest(W1, H1),
    ),
  ).toBeNull();
});
