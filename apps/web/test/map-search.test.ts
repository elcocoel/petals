// Search on the Power Map (#105): the answers that are maps on this map, as rows, in search's order.
import { describe, expect, test } from 'vitest';
import { searchRows } from '../lib/map-search.ts';

const flowers = [
  { name: 'Uniswap', map: 'eip155:1:0x1f98', place: { chain: 'eip155:1' } },
  { name: 'Marketing DAO', map: 'near:marketing.sputnik-dao.near', place: { chain: 'near:mainnet' } },
  { name: 'No map', place: { chain: 'eip155:1' } },
];
const label = (c: string) => ({ 'eip155:1': 'Ethereum', 'near:mainnet': 'NEAR' })[c] ?? c;

describe('search rows', () => {
  test('maps on this map in search order, with the first thing that matched under each', () => {
    const rows = searchRows(
      {
        results: [
          {
            kind: 'map',
            id: 'near:marketing.sputnik-dao.near',
            title: 'Marketing DAO',
            matched: [
              { kind: 'proposal', id: 'p:1', title: 'Booth at a hackathon' },
              { kind: 'claim', id: 'c:1', title: 'later' },
            ],
          },
          { kind: 'map', id: 'eip155:1:0x1f98', title: 'Uniswap' },
          { kind: 'map', id: 'eip155:10:0xgone', title: 'Not here' },
          { kind: 'note', id: 'n1', title: 'my note' },
        ],
      },
      flowers,
      label,
    );
    expect(rows).toEqual([
      {
        at: 1,
        map: 'near:marketing.sputnik-dao.near',
        name: 'Marketing DAO',
        chain: 'NEAR',
        matched: 'Proposal · Booth at a hackathon',
      },
      { at: 0, map: 'eip155:1:0x1f98', name: 'Uniswap', chain: 'Ethereum', matched: null },
    ]);
  });
});
