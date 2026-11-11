// Proposals on the ring and each wallet's vote (#93): each proposal an arc from when it was put up to when it was
// decided, else when its voting closed, else the ring's end; a vote's dot just inside the polygon; no vote, no dot.
import { describe, expect, test } from 'vitest';
import { lay, newRing } from '../src/render/wedge/ring.ts';
import {
  ARC_LEAST,
  arcsOf,
  LANE_GAP,
  laneRadius,
  OTHERS_AT,
  type Proposal,
  placeDot,
  placesOf,
  voteDot,
  votesOn,
} from '../src/render/wedge/votes.ts';

const p = (id: string, at: string, decided: string | null, closes: string | null): Proposal => ({
  id,
  title: id,
  at,
  decided_at: decided,
  closes_at: closes,
  outcome: 'passed',
  votes: [
    { account: 'a', vote: 'for' },
    { account: 'b', vote: 'against' },
  ],
});

describe('the ring', () => {
  const from = '2026-01-01T00:00:00Z';
  const to = '2026-01-11T00:00:00Z';

  test('an arc runs from its time put up to its decision, else its close, else the ring’s end', () => {
    const arcs = arcsOf(
      [
        p('decided', '2026-01-02T00:00:00Z', '2026-01-04T00:00:00Z', '2026-01-09T00:00:00Z'),
        p('closes', '2026-01-02T00:00:00Z', null, '2026-01-07T00:00:00Z'),
        p('open', '2026-01-06T00:00:00Z', null, null),
      ],
      from,
      to,
    );
    const [a, b, c] = ['decided', 'closes', 'open'].map((id) => arcs.find((x) => x.id === id));
    const TAU = Math.PI * 2;
    expect(a?.a0).toBeCloseTo(TAU * 0.1, 9);
    expect(a?.a1).toBeCloseTo(TAU * 0.3, 9);
    expect(b?.a1).toBeCloseTo(TAU * 0.6, 9);
    expect(c?.a1).toBeCloseTo(TAU, 9);
  });

  test('a proposal outside the stretch has no arc, and one decided the day it was put up still shows', () => {
    expect(
      arcsOf([p('before', '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z', null)], from, to),
    ).toEqual([]);
    const [same] = arcsOf(
      [p('same', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z', null)],
      from,
      to,
    );
    expect((same?.a1 ?? 0) - (same?.a0 ?? 0)).toBeCloseTo(ARC_LEAST, 12);
  });

  test("each vote by account; an account that didn't vote has none", () => {
    const v = votesOn(p('x', from, null, null));
    expect(v.get('a')).toBe('for');
    expect(v.get('b')).toBe('against');
    expect(v.get('c')).toBeUndefined();
  });

  test("a vote's dot sits just inside the polygon, under its petal's foot", () => {
    const ring = newRing(4);
    lay(ring, Float64Array.from([1, 1, 1, 1]), Float64Array.from([10, 10, 10, 10]), 0);
    const d = voteDot(ring, 0);
    const foot = Math.hypot(
      ((ring.ax[0] as number) + (ring.bx[0] as number)) / 2 - 400,
      ((ring.ay[0] as number) + (ring.by[0] as number)) / 2 - 400,
    );
    expect(Math.hypot(d.x - 400, d.y - 400)).toBeLessThan(foot);
    expect(d.r).toBeGreaterThan(0);
  });

  test('proposals open at once stack outward, each on the first free lane', () => {
    const arcs = arcsOf(
      [
        p('one', '2026-01-02T00:00:00Z', null, '2026-01-05T00:00:00Z'),
        p('two', '2026-01-03T00:00:00Z', null, '2026-01-06T00:00:00Z'),
        p('three', '2026-01-07T00:00:00Z', null, '2026-01-08T00:00:00Z'),
      ],
      from,
      to,
    );
    expect(arcs.map((a) => [a.id, a.lane])).toEqual([
      ['one', 0],
      ['two', 1],
      ['three', 0],
    ]);
    expect(laneRadius(1) - laneRadius(0)).toBe(LANE_GAP);
  });

  test("each proposal stacks above its proposer's petal, oldest first; others in a stack of their own", () => {
    const by = (id: string, at: string, proposer: string | null) => ({
      ...p(id, at, null, null),
      proposer,
    });
    const placed = placesOf(
      [
        by('b', '2026-01-03T00:00:00Z', 'a'),
        by('a', '2026-01-02T00:00:00Z', 'a'),
        by('c', '2026-01-04T00:00:00Z', 'zzz'),
        by('d', '2026-01-05T00:00:00Z', null),
      ],
      ['a', 'b'],
      from,
      to,
    );
    expect(placed).toEqual([
      { id: 'a', petal: 0, step: 0 },
      { id: 'b', petal: 0, step: 1 },
      { id: 'c', petal: -1, step: 0 },
      { id: 'd', petal: -1, step: 1 },
    ]);
    const near = placeDot(OTHERS_AT, 0);
    const far = placeDot(OTHERS_AT, 3);
    expect(Math.hypot(far.x - 400, far.y - 400)).toBeGreaterThan(
      Math.hypot(near.x - 400, near.y - 400),
    );
  });
});
