// The Play: a map's dated readings, oldest first, played one after another; the map draws its main reading.
import { expect, test } from 'vitest';
import { momentOf, playSteps } from '../lib/play.ts';

const r = (snapshot: string, as_of: string, dated?: boolean) => ({
  snapshot,
  as_of,
  title: `UNI delegates ${snapshot}`,
  ...(dated === undefined ? {} : { dated }),
});

test('the moments are the dated readings, oldest first, and only where there are two or more', () => {
  expect(
    playSteps([
      r('main', '2026-11-12T00:00:00Z'),
      r('oct', '2026-10-31T23:59:59Z', true),
      r('aug', '2026-08-31T23:59:59Z', true),
      r('sep', '2026-09-30T23:59:59Z', true),
    ]).map((s) => s.snapshot),
  ).toEqual(['aug', 'sep', 'oct']);
  expect(
    playSteps([r('main', '2026-11-12T00:00:00Z'), r('oct', '2026-10-31T00:00:00Z', true)]),
  ).toEqual([]);
  expect(playSteps(undefined)).toEqual([]);
});

test("each moment says what it read, in its reading's own title", () => {
  expect(
    playSteps([r('sep', '2026-09-30T23:59:59Z', true), r('oct', '2026-10-31T23:59:59Z', true)]).map(
      (s) => s.title,
    ),
  ).toEqual(['UNI delegates sep', 'UNI delegates oct']);
});

test('a moment reads as its month', () => {
  expect(momentOf('2026-10-31T23:59:59Z')).toBe('Oct 2026');
});
