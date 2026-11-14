// A contribution told in the person's own words or as anyone reads it, and the author it's read for.
import type { Credit } from '@petal/core';
import { describe, expect, test } from 'vitest';
import {
  contributionView,
  contributionWords,
  creditAuthor,
  publicContributionWords,
} from '../lib/contribution-view.ts';

const RECORD: Credit = {
  petal: 'credit/v1',
  author: 'near:mainnet:a-name.near',
  rule: 'points/v1',
  compose: 'compose/v1',
  layers: [
    {
      sha256: 'a1'.repeat(32),
      petal: 'claim/v3',
      map: 'eip155:100:0xfe1084bc16427e5eb7f13fc19bcd4e641f7d571f',
      title: 'RaidGuild: who holds the shares',
      publication: 'f7'.repeat(32),
      seq: 2,
      published_at: '2026-11-11T10:00:00Z',
      first: 3,
      confirmed: 1,
      built_on_by: [],
      reused_by: [],
      built_on: 0,
    },
  ],
  totals: { layers: 1, first: 3, confirmed: 1, built_on: 0 },
  composed_from: [],
};

describe('a contribution', () => {
  test('in the person’s own words by default, as anyone reads it on a public page', () => {
    expect(contributionView(RECORD).counts[0]).toMatchObject({
      value: 3,
      label: contributionWords.first,
    });
    const shown = contributionView(RECORD, publicContributionWords);
    expect(shown.counts.map((c) => c.label)).toEqual([
      publicContributionWords.first,
      publicContributionWords.confirmed,
      publicContributionWords.builtOn,
    ]);
    expect(shown.layers[0]?.title).toBe('RaidGuild: who holds the shares');
    expect(shown.empty).toBe(false);
  });

  test('read for the wallet that signs a publication', () => {
    expect(creditAuthor('near', 'petals.near')).toBe('petals.near');
    expect(creditAuthor('eip155', '0xABC0000000000000000000000000000000000001')).toBe(
      'eip155:1:0xabc0000000000000000000000000000000000001',
    );
    expect(creditAuthor('solana', 'DgiASgeARPbs4p4LSMhhtKb7L6BkW9tfN4eDT1C9yeCE')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:DgiASgeARPbs4p4LSMhhtKb7L6BkW9tfN4eDT1C9yeCE',
    );
  });
});
