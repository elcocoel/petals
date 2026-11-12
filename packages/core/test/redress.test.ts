// Elco, 12 Nov, wave 4: after a change in Tools the map redraws without the second's wait. The browser dresses a
// reading again through the new view (redress), from the petals' own data and the pieces given with them, and it
// must draw exactly what the server's reading in that view will: the same petals, in the same order, the same
// widths, heights, colours, names and outlines.
import { describe, expect, test } from 'vitest';
import { readFlower, redress } from '../src/reading/index.ts';
import type { SeamPiece } from '../src/seam.ts';
import type { ReadingPetal, View } from '../src/types/index.ts';
import { DEFAULT_VIEW } from '../src/view/index.ts';
import { GOLDEN_CASES, goldenSpec } from './golden-cases.ts';

const c = GOLDEN_CASES.find((g) => g.name === 'house-of-stake-default') as (typeof GOLDEN_CASES)[0];
const spec = goldenSpec(c);
const s = c.snapshot();
const ids = readFlower(spec, s, DEFAULT_VIEW)
  .petals.filter((p) => !p.tail)
  .map((p) => p.id);

const piece = (
  name: string,
  kind: 'date' | 'count' | 'category',
  of: (id: string, i: number) => string,
) =>
  ({
    name,
    kind,
    unit: kind,
    standing: 'verified',
    layer: 'test',
    as_of: '2026-11-12T00:00:00Z',
    values: s.participants.map((p, i) => ({ participant: p.id, value: of(p.id, i) })),
  }) as SeamPiece;
const given = [
  piece('votes_cast', 'count', (_, i) => String((i * 37) % 11)),
  piece('last_active', 'date', (_, i) =>
    new Date(Date.UTC(2026, 0, 1 + ((i * 13) % 300))).toISOString(),
  ),
  piece('voted', 'category', (_, i) => (i % 3 === 0 ? 'never voted' : 'voted')),
];
// the server gives the values of the drawn petals only (SYSTEMS's 'given')
const drawn = new Set(ids);
const givenDrawn = given.map(
  (p) =>
    ({
      ...p,
      values: 'values' in p ? p.values.filter((v) => drawn.has(v.participant)) : [],
    }) as SeamPiece,
);

const withView = (edit: (d: Record<string, unknown>) => void): View => {
  const v = structuredClone(DEFAULT_VIEW);
  edit(v.dimensions as unknown as Record<string, unknown>);
  return v;
};
const look = (petals: readonly ReadingPetal[]) =>
  petals.map((p) => ({
    id: p.id,
    name: p.name,
    width: Number(p.width.toFixed(9)),
    height: Number(p.height.toFixed(9)),
    colour: p.colour,
    outline: p.outline,
  }));

const VIEWS: [string, View][] = [
  ['the default', DEFAULT_VIEW],
  ['order last active', withView((d) => (d.order = { data: 'last_active' }))],
  ['order most active', withView((d) => (d.order = { data: 'votes_cast' }))],
  ['order by name', withView((d) => (d.order = { data: 'name' }))],
  ['order by kind', withView((d) => (d.order = { data: 'kind' }))],
  ['width by amount', withView((d) => (d.width = { data: 'amount', max_ratio: 2 }))],
  ['height by its root', withView((d) => (d.height = { data: 'share', scale: 'sqrt' }))],
  ['height by amount', withView((d) => (d.height = { data: 'amount', scale: 'log' }))],
  ['colour voted or never', withView((d) => (d.colour = { data: 'voted' }))],
  ['colour who it is', withView((d) => (d.colour = { data: 'identity' }))],
  ['labels by kind', withView((d) => (d.labels = { data: 'kind' }))],
  ['labels none', withView((d) => (d.labels = null))],
  ['outline none', withView((d) => (d.outline = null))],
];

describe('redress draws what the server will', () => {
  test.each(VIEWS)('%s, from the default reading', (_, view) => {
    const from = readFlower(spec, s, DEFAULT_VIEW, given).petals;
    const server = readFlower(spec, s, view, given).petals;
    expect(look(redress(from, view, givenDrawn))).toEqual(look(server));
  });

  test.each(VIEWS)('%s, and back to the default', (_, view) => {
    const from = readFlower(spec, s, view, given).petals;
    const server = readFlower(spec, s, DEFAULT_VIEW, given).petals;
    expect(look(redress(from, DEFAULT_VIEW, givenDrawn))).toEqual(look(server));
  });
});

test('height by a count: the drawn petals as the server draws them (the tail waits for the server)', () => {
  const view = withView((d) => (d.height = { data: 'votes_cast', scale: 'linear' }));
  const from = readFlower(spec, s, DEFAULT_VIEW, given).petals;
  const server = readFlower(spec, s, view, given).petals.filter((p) => !p.tail);
  const mine = redress(from, view, givenDrawn).filter((p) => !p.tail);
  expect(look(mine).map((p) => p.id)).toEqual(look(server).map((p) => p.id));
  expect(mine.map((p) => Math.round(p.height * 100))).toEqual(
    server.map((p) => Math.round(p.height * 100)),
  );
});
