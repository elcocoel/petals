// Ties inside a flower: the relation the view's Lines names, from the flower's own pieces, as pairs of its petals.
import type { SeamPiece } from '@petal/core';
import { DEFAULT_VIEW, latestView } from '@petal/core/view';
import { expect, test } from 'vitest';
import { tiePairs, tiesOf } from '../lib/ties.ts';

const base = { standing: 'verified', layer: 'h', as_of: '2026-11-14T00:00:00Z' } as const;
const alike = {
  ...base,
  name: 'votes_alike',
  kind: 'relation',
  lines: [
    { from: 'a.near', to: 'b.near', value: '0.9' },
    { from: 'b.near', to: 'c.near', value: '0.85' },
  ],
} as unknown as SeamPiece;
const votes = { ...base, name: 'votes_cast', kind: 'count', values: [] } as unknown as SeamPiece;
const withLines = (data: string | null) => {
  const v = latestView(DEFAULT_VIEW);
  return { ...v, dimensions: { ...v.dimensions, lines: data ? { data } : null } } as typeof v;
};

test('Lines draws the relation it names, from the flower’s own pieces; none on None or without it', () => {
  expect(tiesOf([votes, alike], withLines('votes_alike'))).toEqual([
    ['a.near', 'b.near'],
    ['b.near', 'c.near'],
  ]);
  expect(tiesOf([votes, alike], withLines(null))).toBeNull();
  expect(tiesOf([votes], withLines('votes_alike'))).toBeNull();
  expect(tiesOf(undefined, withLines('votes_alike'))).toBeNull();
  // a piece of another kind under that name draws no ties
  expect(tiesOf([votes], withLines('votes_cast'))).toBeNull();
});

test('a tie joins two petals of their own; a wallet folded into everyone else has none', () => {
  const petals = [{ id: 'a.near' }, { id: 'b.near' }, { id: 'group:rest' }];
  expect(
    tiePairs(
      [
        ['a.near', 'b.near'],
        ['b.near', 'c.near'],
        ['a.near', 'a.near'],
      ],
      petals,
    ),
  ).toEqual([[0, 1]]);
});
