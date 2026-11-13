// A map's layers as strata (wave 8, composition.md §9): oldest first by the record's order, each author named and
// their first publication's day, Petals' import said as imported and unsigned, what each layer covers in words, and
// each first author in their own colour.
import { describe, expect, test } from 'vitest';
import {
  authorSwatches,
  authorsLine,
  type CardAuthor,
  type CardLayer,
  strataLine,
  strataOf,
} from '../lib/map-strata.ts';

const layers: CardLayer[] = [
  {
    sha256: 'b'.repeat(64),
    petal: 'layer/v1',
    title: 'Names for 14 members',
    states: [{ at: '2026-11-12T10:00:00Z' }],
    collected_at: '2026-11-12T10:00:00Z',
    by: ['near:mainnet:elco.near', 'near:mainnet:raid.near'],
    first: {
      author: 'near:mainnet:elco.near',
      publication: 'p2',
      published_at: '2026-11-13T01:00:00Z',
    },
  },
  {
    sha256: 'a'.repeat(64),
    petal: 'snapshot/v1',
    title: 'RaidGuild members and their shares',
    states: [{ chain: 'eip155:100', block: 37912004 }],
    collected_at: '2026-11-09T12:00:00Z',
    by: ['near:mainnet:mapping.petals.near'],
    first: {
      author: 'near:mainnet:mapping.petals.near',
      publication: 'p1',
      published_at: '2026-11-13T00:00:00Z',
    },
  },
  {
    sha256: 'c'.repeat(64),
    petal: 'proposals/v3',
    states: [{ from: '2021-02-03T00:00:00Z', to: '2026-11-11T00:00:00Z' }],
    by: ['near:mainnet:mapping.petals.near'],
    first: {
      author: 'near:mainnet:mapping.petals.near',
      publication: 'p1',
      published_at: '2026-11-13T00:00:00Z',
    },
  },
];
const authors: CardAuthor[] = [
  { author: 'near:mainnet:mapping.petals.near', name: "Petals' mapping", imported: true },
  { author: 'near:mainnet:elco.near', name: 'elco.near', first: 34, confirmed: 12, built_on: 3 },
  { author: 'near:mainnet:raid.near' },
];

describe('a map’s layers as strata', () => {
  const strata = strataOf(layers, authors);
  test('oldest first, by when each was first published, then its hash', () => {
    expect(strata.map((l) => l.id[0])).toEqual(['a', 'c', 'b']);
  });
  test('who published it: the first author and their day, then the rest; the import said plainly', () => {
    expect(authorsLine(strata[0]?.authors ?? [])).toBe(
      "by Petals' mapping, imported, unsigned, 13 Nov 2026",
    );
    expect(authorsLine(strata[2]?.authors ?? [])).toBe(
      'by elco.near, 13 Nov 2026, (on this map: 34 added first · 12 confirmed · 3 built on it) and raid.near',
    );
    expect(authorsLine([])).toBe('by not recorded');
  });
  test('what each covers, and its kind', () => {
    expect(strataLine(strata[0] ?? ({} as never))).toBe(
      'a reading · block 37,912,004 · read 9 Nov 2026',
    );
    expect(strata[1]?.title).toBe('proposals and votes');
    expect(strata[1]?.covers).toBe('3 Feb 2021 to 11 Nov 2026');
  });
  test('each first author in their colour, the import in grey', () => {
    const sw = authorSwatches(strata, authors);
    expect(sw.get('near:mainnet:mapping.petals.near')).toBe('key-grey');
    expect(sw.get('near:mainnet:elco.near')).toBe('key-mint');
  });
});
