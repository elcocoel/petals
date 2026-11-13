// A pressed proposal says what it's about: its facts, its voters, its own words where they say
// more than its title, and its link said for what it is.
import type { Proposal } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { proposalView } from '../lib/proposal-view.ts';

const base: Proposal = {
  id: '1',
  title: 'Schedule an auction',
  kind: 'Vote',
  proposer: 'refchef.near',
  at: '2021-07-13T21:12:25.573Z',
  closes_at: null,
  decided_at: null,
  outcome: 'passed',
  as_said: 'Approved',
  ref: 'proposal:near:mainnet:ref-finance.sputnik-dao.near:1',
  votes: [
    { account: 'a.near', vote: 'for', as_said: 'Approve', at: null },
    { account: 'b.near', vote: 'for', as_said: 'Approve', at: null },
    { account: 'c.near', vote: 'against', as_said: 'Reject', at: null },
  ],
};

describe('a pressed proposal', () => {
  test('its facts and how its voters voted', () => {
    const v = proposalView(base);
    expect(v.facts).toBe('Vote · Approved · 13 Jul 2021');
    expect(v.who).toBe('By refchef.near');
    expect(v.votes).toBe('2 for · 1 against');
  });
  test('its own words only where they say more than its title', () => {
    expect(proposalView({ ...base, summary: 'Schedule an auction' }).words).toBeNull();
    expect(proposalView({ ...base, summary: 'Schedule an auction on Skyward.' }).words).toBe(
      'Schedule an auction on Skyward.',
    );
  });
  test('its link, said for what it is', () => {
    expect(
      proposalView({ ...base, link: { url: 'https://x.example', kind: 'named in its text' } }).link,
    ).toEqual({ url: 'https://x.example', label: 'A link its text names' });
    expect(
      proposalView({ ...base, link: { url: 'https://s.example', kind: 'where it was made' } }).link
        ?.label,
    ).toBe('Where it was made');
  });
});
